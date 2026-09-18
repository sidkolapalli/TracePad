import type {
  Draft,
  Exercise,
  PracticeCase,
  SessionState,
  TimerState,
} from "./types";
import { getActiveFile, validateProjectFiles } from "./files";
import { isScratchpad } from "./scratchpad/model";

export const STORAGE_KEY = "localpad.session.v1";
const DEFAULT_DURATION = 45 * 60 * 1000;

export function defaultSession(): SessionState {
  return {
    version: 1,
    activeId: "pair-sum",
    customExercises: [],
    drafts: {},
    timer: {
      durationMs: DEFAULT_DURATION,
      remainingMs: DEFAULT_DURATION,
      deadline: null,
      started: false,
    },
    fontSize: 14,
    panelWidth: 35,
    consoleHeight: 260,
    theme: "dark",
    sidebarTab: "brief",
    sidebarCollapsed: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCase(value: unknown): value is PracticeCase {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    typeof value.code === "string"
  );
}

function isCases(value: unknown): value is PracticeCase[] {
  return (
    Array.isArray(value) &&
    value.every(isCase) &&
    new Set(value.map((test) => test.id)).size === value.length
  );
}

function isDraft(value: unknown): value is Draft {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    typeof value.stdin === "string" &&
    isCases(value.tests) &&
    (value.scratchpad === undefined || isScratchpad(value.scratchpad)) &&
    // Keep valid saved text even when editing has exceeded the execution budget.
    // The file-creation flow and worker enforce limits without losing the draft.
    validateProjectFiles(value.files, value.source, {
      enforceLimits: false,
    }) === null
  );
}

function isExercise(value: unknown): value is Exercise {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    value.difficulty === "Custom" &&
    value.custom === true &&
    typeof value.topic === "string" &&
    typeof value.description === "string" &&
    typeof value.starterCode === "string" &&
    isCases(value.tests) &&
    Array.isArray(value.constraints) &&
    value.constraints.every((item) => typeof item === "string") &&
    Array.isArray(value.examples) &&
    value.examples.every(
      (example) =>
        isRecord(example) &&
        typeof example.input === "string" &&
        typeof example.output === "string" &&
        (example.explanation === undefined ||
          typeof example.explanation === "string"),
    )
  );
}

function isTimer(value: unknown): value is TimerState {
  return (
    isRecord(value) &&
    isFiniteNumber(value.durationMs) &&
    value.durationMs > 0 &&
    isFiniteNumber(value.remainingMs) &&
    typeof value.started === "boolean" &&
    (value.deadline === null ||
      (isFiniteNumber(value.deadline) && value.started))
  );
}

export function isSession(value: unknown): value is SessionState {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.activeId === "string" &&
    value.activeId.length > 0 &&
    isTimer(value.timer) &&
    isFiniteNumber(value.fontSize) &&
    isFiniteNumber(value.panelWidth) &&
    isFiniteNumber(value.consoleHeight) &&
    Array.isArray(value.customExercises) &&
    value.customExercises.every(isExercise) &&
    new Set(value.customExercises.map((exercise) => exercise.id)).size ===
      value.customExercises.length &&
    isRecord(value.drafts) &&
    Object.values(value.drafts).every(isDraft)
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** A failed read never overwrites the original storage entry. */
export function loadSession(): { state: SessionState; warning?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { state: defaultSession() };
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) {
      return {
        state: defaultSession(),
        warning:
          "Saved practice data could not be read. A fresh session is open; the original saved data has not been changed.",
      };
    }
    return {
      state: {
        ...parsed,
        drafts: Object.fromEntries(
          Object.entries(parsed.drafts).map(([id, draft]) => [
            id,
            {
              ...draft,
              ...(draft.files === undefined
                ? {}
                : { files: { ...draft.files } }),
              ...(draft.activeFile === undefined
                ? {}
                : { activeFile: getActiveFile(draft) }),
            },
          ]),
        ),
        // Older v1 sessions have no theme. A bad preference must not discard code.
        theme: parsed.theme === "light" ? "light" : "dark",
        sidebarTab:
          parsed.sidebarTab === "files" ||
          parsed.sidebarTab === "scratchpad" ||
          parsed.sidebarTab === "interview"
            ? parsed.sidebarTab
            : "brief",
        sidebarCollapsed: parsed.sidebarCollapsed === true,
        fontSize: Math.round(clamp(parsed.fontSize, 12, 24)),
        panelWidth: clamp(parsed.panelWidth, 25, 55),
        consoleHeight: Math.round(clamp(parsed.consoleHeight, 160, 500)),
      },
    };
  } catch {
    return {
      state: defaultSession(),
      warning:
        "Browser storage is unavailable or saved data is unreadable. Your current work can continue, but may not survive a refresh.",
    };
  }
}

/** The caller keeps its in-memory state, including code, when saving fails. */
export function saveSession(state: SessionState): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return "Could not save to this browser. Your work is still here; copy your code before closing or refreshing.";
  }
}

export function getDraft(state: SessionState, exercise: Exercise): Draft {
  const saved = Object.hasOwn(state.drafts, exercise.id)
    ? state.drafts[exercise.id]
    : undefined;
  return saved
    ? {
        ...saved,
        ...(saved.files === undefined ? {} : { files: { ...saved.files } }),
        ...(saved.activeFile === undefined
          ? {}
          : { activeFile: getActiveFile(saved) }),
        tests: saved.tests.map((test) => ({ ...test })),
        ...(saved.scratchpad === undefined
          ? {}
          : { scratchpad: structuredClone(saved.scratchpad) }),
      }
    : {
        source: exercise.starterCode,
        stdin: "",
        tests: exercise.tests.map((test) => ({ ...test })),
      };
}

export function timerRemaining(timer: TimerState, now = Date.now()): number {
  return timer.deadline === null ? timer.remainingMs : timer.deadline - now;
}

export function startTimer(timer: TimerState, now = Date.now()): TimerState {
  if (timer.deadline !== null) return { ...timer };
  return { ...timer, started: true, deadline: now + timer.remainingMs };
}

export function pauseTimer(timer: TimerState, now = Date.now()): TimerState {
  return { ...timer, remainingMs: timerRemaining(timer, now), deadline: null };
}

export function resetTimer(
  timer: TimerState,
  durationMs = timer.durationMs,
): TimerState {
  const duration =
    Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : timer.durationMs;
  return {
    durationMs: duration,
    remainingMs: duration,
    deadline: null,
    started: false,
  };
}

export function formatTime(ms: number): string {
  const seconds = Math.ceil(Math.abs(ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = hours
    ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`
    : `${pad(minutes)}:${pad(remainder)}`;
  return `${ms < 0 ? "+" : ""}${time}`;
}
