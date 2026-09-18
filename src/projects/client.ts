import { isSession, loadSession, STORAGE_KEY } from "../session";
import { defaultLearning, isLearning, LEARNING_KEY } from "../learning/state";
import type { Project, ProjectDocument, ProjectState } from "./types";

export const ACTIVE_PROJECT_KEY = "localpad.active-project.v1";
const CLIENT_KEY = "localpad.recovery-client.v1";
let clientId: string | undefined;
function recoveryClient() {
  if (clientId) return clientId;
  try {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    clientId =
      (navigation?.type === "reload" || navigation?.type === "back_forward"
        ? sessionStorage.getItem(CLIENT_KEY)
        : null) ?? crypto.randomUUID();
    sessionStorage.setItem(CLIENT_KEY, clientId);
  } catch {
    clientId = crypto.randomUUID();
  }
  return clientId;
}
export const recoveryKey = (id: string) =>
  `localpad.project.v1.${id}.${recoveryClient()}`;
export function isProjectState(value: unknown): value is ProjectState {
  const s = value as ProjectState | null;
  return (
    !!s &&
    s.schemaVersion === 1 &&
    isSession(s.session) &&
    isLearning(s.learning)
  );
}
export async function projectRequest<T>(
  path = "",
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/projects${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Localpad": "1" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      result?.error ??
        "The local database could not be reached. Your edits are still here.",
    );
  if (!result)
    throw new Error("The local database returned an unreadable response.");
  return result as T;
}

export async function openInitialProject(): Promise<{
  document: ProjectDocument;
  warning: string;
}> {
  let active: string | null = null,
    migration: { migrationKey?: string; state?: ProjectState } = {},
    warning = "";
  try {
    active = localStorage.getItem(ACTIVE_PROJECT_KEY);
    const sessionRaw = localStorage.getItem(STORAGE_KEY),
      learningRaw = localStorage.getItem(LEARNING_KEY);
    if (!active && (sessionRaw || learningRaw)) {
      const session = loadSession();
      const learning = learningRaw
        ? JSON.parse(learningRaw)
        : defaultLearning();
      if (session.warning || !isLearning(learning)) {
        warning =
          "Some older browser data could not be imported. The original browser entries have been preserved.";
      } else {
        const bytes = new TextEncoder().encode(
          JSON.stringify([sessionRaw, learningRaw]),
        );
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        migration = {
          migrationKey: Array.from(new Uint8Array(hash), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
          state: { schemaVersion: 1, session: session.state, learning },
        };
      }
    }
  } catch {
    warning =
      "Browser recovery storage is unavailable or contains unreadable data. Database saves are still available.";
  }
  if (active) {
    try {
      const document = await projectRequest<ProjectDocument>(`/${active}`);
      if (document.project.archivedAt === null) return { document, warning };
    } catch (error) {
      // A missing project can fall back to the picker; a disconnected database cannot.
      if (
        !(error instanceof Error) ||
        !error.message.includes("no longer available")
      )
        throw error;
    }
  }
  return {
    document: await projectRequest<ProjectDocument>(
      "/bootstrap",
      "POST",
      migration,
    ),
    warning,
  };
}

type PendingSave = {
  expectedRevision: number;
  saveId: string;
  state: ProjectState;
};
interface Recovery {
  version: 1;
  revision: number;
  state: ProjectState;
  dirty: boolean;
  savedAt?: number;
  pending?: PendingSave;
}
export interface SaveStatus {
  kind: "saved" | "saving" | "unsaved" | "error";
  message: string;
  cacheWarning: string;
}

/** Serializes saves and keeps an idempotent request across interrupted responses. */
export class ProjectStore {
  document: ProjectDocument;
  status: SaveStatus = {
    kind: "saved",
    message: "Saved locally",
    cacheWarning: "",
  };
  private dirty = false;
  private pending?: PendingSave;
  private timer?: ReturnType<typeof setTimeout>;
  private inflight?: Promise<void>;
  private listener?: () => void;
  private adopted?: { key: string; raw: string };
  constructor(document: ProjectDocument) {
    this.document = document;
    try {
      let raw = localStorage.getItem(recoveryKey(document.project.id));
      if (!raw) {
        const prefix = `localpad.project.v1.${document.project.id}`;
        const candidates = Object.keys(localStorage)
          .filter((key) => key === prefix || key.startsWith(`${prefix}.`))
          .flatMap((key) => {
            try {
              const raw = localStorage.getItem(key)!;
              const cache = JSON.parse(raw) as Recovery;
              return cache.dirty && isProjectState(cache.state)
                ? [{ key, raw, at: cache.savedAt ?? 0 }]
                : [];
            } catch {
              return [];
            }
          })
          .sort((a, b) => b.at - a.at);
        if (candidates[0]) {
          this.adopted = candidates[0];
          raw = candidates[0].raw;
        }
      }
      if (raw) {
        const cache = JSON.parse(raw) as Recovery;
        if (
          cache.version === 1 &&
          cache.dirty &&
          isProjectState(cache.state) &&
          Number.isInteger(cache.revision) &&
          cache.revision >= 0
        ) {
          this.document = {
            ...document,
            revision: cache.revision,
            state: cache.state,
          };
          this.dirty = true;
          if (
            cache.pending &&
            isProjectState(cache.pending.state) &&
            typeof cache.pending.saveId === "string" &&
            cache.pending.expectedRevision === cache.revision
          )
            this.pending = cache.pending;
          this.status = {
            kind: "unsaved",
            message: "Restored unsaved edits",
            cacheWarning: "",
          };
        }
      }
    } catch {
      this.status.cacheWarning =
        "Browser recovery is unavailable. Keep this tab open until the database save finishes.";
    }
  }
  subscribe(listener: () => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
      clearTimeout(this.timer);
    };
  }
  private notify() {
    this.listener?.();
  }
  private cache() {
    try {
      const data: Recovery = {
        version: 1,
        revision: this.document.revision,
        state: this.document.state,
        dirty: this.dirty,
        savedAt: Date.now(),
        pending: this.pending,
      };
      localStorage.setItem(
        recoveryKey(this.document.project.id),
        JSON.stringify(data),
      );
      if (
        !this.dirty &&
        this.adopted &&
        localStorage.getItem(this.adopted.key) === this.adopted.raw
      ) {
        localStorage.removeItem(this.adopted.key);
        this.adopted = undefined;
      }
      this.status.cacheWarning = "";
    } catch {
      this.status.cacheWarning =
        "Browser recovery is full or unavailable. Keep this tab open until the database save finishes.";
    }
  }
  update(patch: Partial<ProjectState>) {
    if (
      Object.entries(patch).every(
        ([key, value]) =>
          this.document.state[key as keyof ProjectState] === value,
      )
    )
      return;
    this.document = {
      ...this.document,
      state: { ...this.document.state, ...patch },
    };
    this.dirty = true;
    if (this.status.kind !== "error")
      this.status = { ...this.status, kind: "unsaved", message: "Saving…" };
    this.cache();
    this.notify();
    clearTimeout(this.timer);
    if (this.status.kind !== "error")
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, 500);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.inflight) {
      await this.inflight;
      if (this.dirty) return this.flush();
      return;
    }
    if (!this.dirty) return;
    const work = async () => {
      this.status = { ...this.status, kind: "saving", message: "Saving…" };
      this.notify();
      while (this.dirty) {
        this.pending ??= {
          expectedRevision: this.document.revision,
          saveId: crypto.randomUUID(),
          state: this.document.state,
        };
        const request = this.pending;
        this.cache();
        try {
          const result = await projectRequest<{ revision: number }>(
            `/${this.document.project.id}/state`,
            "PUT",
            request,
          );
          this.document = { ...this.document, revision: result.revision };
          this.dirty = request.state !== this.document.state;
          this.pending = undefined;
          this.cache();
        } catch (error) {
          this.status = {
            ...this.status,
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not save this project.",
          };
          this.cache();
          this.notify();
          throw error;
        }
      }
      this.status = { ...this.status, kind: "saved", message: "Saved locally" };
      this.notify();
    };
    this.inflight = work();
    try {
      await this.inflight;
    } finally {
      this.inflight = undefined;
    }
  }
  preserve = () => {
    this.cache();
  };
  hasUnsavedChanges = () => this.dirty;
  updateDetails(project: Project) {
    this.document = { ...this.document, project };
    this.notify();
  }
}

export function downloadProject(document: ProjectDocument) {
  const blob = new Blob(
    [
      JSON.stringify(
        { format: "localpad-project", version: 1, ...document },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    link = window.document.createElement("a");
  link.href = url;
  link.download = `${document.project.name.replace(/[^\w-]+/g, "-") || "tracepad"}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
