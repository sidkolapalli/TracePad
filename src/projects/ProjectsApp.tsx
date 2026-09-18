import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Database,
  Folder,
  FolderPlus,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import App from "../App";
import { TracepadMark } from "../TracepadMark";
import { ProjectPicker } from "./ProjectPicker";
import { defaultSession } from "../session";
import { defaultLearning } from "../learning/state";
import {
  ACTIVE_PROJECT_KEY,
  downloadProject,
  isProjectState,
  openInitialProject,
  ProjectStore,
  projectRequest,
  recoveryKey,
} from "./client";
import type {
  Project,
  ProjectDetails,
  ProjectDocument,
  ProjectState,
  WorkspaceProject,
} from "./types";

const blank: ProjectDetails = {
  name: "",
  company: "",
  role: "",
  interviewDate: "",
  notes: "",
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "That action could not be completed.";

function ProjectForm({
  project,
  onClose,
  onSave,
  onArchive,
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (details: ProjectDetails) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<ProjectDetails>(project ?? blank);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const change = (key: keyof ProjectDetails, value: string) =>
    setDetails((d) => ({ ...d, [key]: value }));
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="project-dialog"
      aria-labelledby="project-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform(() => onSave(details));
        }}
      >
        <div className="project-dialog-heading">
          <div>
            <h2 id="project-dialog-title">
              {project ? "Project details" : "New project"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close project details"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="project-form-intro">
          Keep this interview’s code, questions, and practice history together.
        </p>
        <label>
          Project name
          <input
            autoFocus
            required
            maxLength={100}
            value={details.name}
            placeholder="e.g. Backend engineer · September"
            onChange={(e) => change("name", e.target.value)}
          />
        </label>
        <div className="project-form-grid">
          <label>
            Company <span>optional</span>
            <input
              maxLength={100}
              value={details.company}
              placeholder="Company or team"
              onChange={(e) => change("company", e.target.value)}
            />
          </label>
          <label>
            Interview date <span>optional</span>
            <input
              type="date"
              value={details.interviewDate}
              onChange={(e) => change("interviewDate", e.target.value)}
            />
          </label>
        </div>
        <label>
          Role <span>optional</span>
          <input
            maxLength={160}
            value={details.role}
            placeholder="Python developer"
            onChange={(e) => change("role", e.target.value)}
          />
        </label>
        <label>
          Preparation notes <span>optional</span>
          <textarea
            rows={4}
            maxLength={6000}
            value={details.notes}
            placeholder="Topics to focus on, recruiter guidance, or interview format…"
            onChange={(e) => change("notes", e.target.value)}
          />
        </label>
        {error && (
          <p className="project-error" role="alert">
            {error}
          </p>
        )}
        <div className="project-form-actions">
          {project && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void perform(onArchive)}
            >
              <Archive size={15} /> Archive
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={busy || !details.name.trim()}
          >
            {busy && <LoaderCircle size={15} className="spin" />}
            {project ? "Save details" : "Create project"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function ProjectsApp() {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [, refreshStatus] = useState(0);
  const [error, setError] = useState(""),
    [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(true),
    [switching, setSwitching] = useState(false);
  const [archived, setArchived] = useState(false),
    [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const beforeLeave = useRef<(() => void) | null>(null),
    importInput = useRef<HTMLInputElement>(null);
  const changeLock = useRef(false);
  const bootGeneration = useRef(0);
  const activate = useCallback((document: ProjectDocument) => {
    setStore(new ProjectStore(document));
    try {
      localStorage.setItem(ACTIVE_PROJECT_KEY, document.project.id);
    } catch {
      /* Database remains authoritative. */
    }
    setMenuOpen(false);
  }, []);
  const refreshProjects = useCallback(async () => {
    const data = await projectRequest<{ projects: Project[] }>();
    setProjects(data.projects);
  }, []);
  const boot = useCallback(async () => {
    const generation = ++bootGeneration.current;
    setLoading(true);
    setError("");
    try {
      const result = await openInitialProject();
      if (generation !== bootGeneration.current) return;
      setWarning(result.warning);
      activate(result.document);
      await refreshProjects();
    } catch (e) {
      if (generation === bootGeneration.current) setError(message(e));
    } finally {
      if (generation === bootGeneration.current) setLoading(false);
    }
  }, [activate, refreshProjects]);
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    if (!store) return;
    const unsubscribe = store.subscribe(() =>
      refreshStatus((value) => value + 1),
    );
    void store.flush().catch(() => {});
    const guard = (event: BeforeUnloadEvent) => {
      store.preserve();
      if (store.hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener("pagehide", store.preserve);
    window.addEventListener("beforeunload", guard);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", store.preserve);
      window.removeEventListener("beforeunload", guard);
    };
  }, [store]);
  const leave = async () => {
    flushSync(() => beforeLeave.current?.());
    await store?.flush();
  };
  const changeProject = async (action: () => Promise<void>) => {
    if (changeLock.current) return;
    changeLock.current = true;
    flushSync(() => setSwitching(true));
    setError("");
    try {
      await leave();
      await action();
      await refreshProjects();
    } catch (e) {
      setError(message(e));
      throw e;
    } finally {
      changeLock.current = false;
      setSwitching(false);
    }
  };
  const open = (id: string) => {
    if (id === store?.document.project.id) {
      setMenuOpen(false);
      return;
    }
    void changeProject(async () =>
      activate(await projectRequest<ProjectDocument>(`/${id}`)),
    ).catch(() => {});
  };
  const project = store?.document.project;
  const workspace = useMemo<WorkspaceProject | undefined>(
    () =>
      store
        ? {
            suspended: switching,
            project: store.document.project,
            initial: store.document.state,
            onSession: (state) => store.update({ session: state }),
            onLearning: (state) => store.update({ learning: state }),
            registerBeforeLeave: (handler) => {
              beforeLeave.current = handler;
            },
            onManage: () => setEditing(store.document.project),
            onOpenProjects: () => setMenuOpen((value) => !value),
            projectsOpen: menuOpen,
            saveStatus:
              store.status.kind === "error"
                ? "Save needs attention"
                : store.status.message,
            saveFailed: store.status.kind === "error",
          }
        : undefined,
    [store, project, switching, menuOpen, store?.status],
  );
  const saveDetails = async (details: ProjectDetails) => {
    if (editing === "new") {
      await changeProject(async () => {
        const session = {
          ...defaultSession(),
          theme: store?.document.state.session.theme ?? "dark",
        };
        const state: ProjectState = {
          schemaVersion: 1,
          session,
          learning: defaultLearning(),
        };
        activate(
          await projectRequest<ProjectDocument>("", "POST", { details, state }),
        );
        setArchived(false);
      });
    } else if (editing) {
      const updated = await projectRequest<Project>(
        `/${editing.id}`,
        "PATCH",
        details,
      );
      if (updated.id === project?.id) store?.updateDetails(updated);
      await refreshProjects();
    }
  };
  const archive = async () => {
    if (!editing || editing === "new") return;
    await changeProject(async () => {
      await projectRequest(`/${editing.id}`, "PATCH", {
        ...editing,
        archived: true,
      });
      if (editing.id === project?.id)
        activate(
          await projectRequest<ProjectDocument>("/bootstrap", "POST", {}),
        );
    });
  };
  const restore = (p: Project) => {
    void changeProject(async () => {
      await projectRequest(`/${p.id}`, "PATCH", { ...p, archived: false });
      activate(await projectRequest<ProjectDocument>(`/${p.id}`));
      setArchived(false);
    }).catch(() => {});
  };
  const recoveryCopy = async () => {
    if (!store) return;
    if (changeLock.current) return;
    changeLock.current = true;
    flushSync(() => setSwitching(true));
    setError("");
    try {
      flushSync(() => beforeLeave.current?.());
      const document = store.document;
      const copy = await projectRequest<ProjectDocument>("", "POST", {
        details: {
          ...document.project,
          name: `${document.project.name.slice(0, 84)} · recovery`,
        },
        state: document.state,
      });
      try {
        localStorage.removeItem(recoveryKey(document.project.id));
      } catch {
        /* Original database work is safe. */
      }
      activate(copy);
      await refreshProjects();
    } catch (e) {
      setError(message(e));
    } finally {
      changeLock.current = false;
      setSwitching(false);
    }
  };
  const importProject = async (file: File) => {
    try {
      if (file.size > 32 * 1024 * 1024)
        throw new Error("Choose a Tracepad backup smaller than 32 MiB.");
      const data = JSON.parse(await file.text());
      if (
        data.format !== "localpad-project" ||
        data.version !== 1 ||
        !isProjectState(data.state) ||
        !data.project?.name
      )
        throw new Error("This file is not a valid Tracepad project backup.");
      await changeProject(async () => {
        activate(
          await projectRequest<ProjectDocument>("", "POST", {
            details: data.project,
            state: data.state,
          }),
        );
        setArchived(false);
      });
    } catch (e) {
      setError(message(e));
    }
  };
  if (!store || !workspace)
    return (
      <main className="project-loading">
        <span className="studio-wordmark">
          <TracepadMark size={40} />
          <span>Tracepad</span>
        </span>
        <p className="studio-tagline">Understand it. Build it. Explain it.</p>
        {loading ? (
          <p role="status">
            <LoaderCircle size={18} className="spin" /> Opening your projects…
          </p>
        ) : (
          <>
            <p role="alert">{error}</p>
            <button className="primary-button" onClick={() => void boot()}>
              Retry database connection
            </button>
          </>
        )}
      </main>
    );
  const visible = projects.filter((p) =>
    archived ? p.archivedAt !== null : p.archivedAt === null,
  );
  return (
    <div className="studio-shell">
      <ProjectPicker
        open={menuOpen}
        projects={visible}
        activeId={project!.id}
        archived={archived}
        busy={switching}
        onOpenChange={setMenuOpen}
        onSelect={(p) => (p.archivedAt ? restore(p) : open(p.id))}
        onNew={() => setEditing("new")}
        onDetails={() => setEditing(project!)}
        onArchived={() => setArchived((value) => !value)}
        onExport={() => downloadProject(store.document)}
        onImport={() => importInput.current?.click()}
      />
      <main className="studio-workspace" aria-busy={switching}>
        {(error ||
          warning ||
          store.status.kind === "error" ||
          store.status.cacheWarning) && (
          <div className="project-save-banner" role="alert">
            <span>
              {error ||
                (store.status.kind === "error" ? store.status.message : "") ||
                warning ||
                store.status.cacheWarning}
            </span>
            {store.status.kind === "error" && (
              <>
                <button
                  disabled={switching}
                  onClick={() => {
                    setError("");
                    void store.flush().catch(() => {});
                  }}
                >
                  Retry save
                </button>
                <button
                  disabled={switching}
                  onClick={() => void recoveryCopy()}
                >
                  Save recovery copy
                </button>
                <button onClick={() => downloadProject(store.document)}>
                  Export work
                </button>
              </>
            )}
            {store.status.kind !== "error" && (
              <button
                aria-label="Dismiss notice"
                onClick={() => {
                  setError("");
                  setWarning("");
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}
        <App key={project!.id} project={workspace} />
        {switching && (
          <div className="project-switch-indicator" role="status">
            <LoaderCircle size={15} className="spin" /> Saving and opening
            project…
          </div>
        )}
      </main>
      <input
        ref={importInput}
        hidden
        type="file"
        accept="application/json,.json"
        aria-label="Import project backup"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importProject(file);
        }}
      />
      {editing && (
        <ProjectForm
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={saveDetails}
          onArchive={archive}
        />
      )}
    </div>
  );
}
