import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Check,
  CircleAlert,
  Clock3,
  Code2,
  FlaskConical,
  GripHorizontal,
  HardDrive,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pause,
  Pencil,
  PencilRuler,
  Play,
  Plus,
  RotateCcw,
  Search,
  Square,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Files,
  BookOpen,
  MessagesSquare,
  Terminal,
  Settings2,
  ChevronsUpDown,
  Folder,
  GraduationCap,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import CodeEditor from "./CodeEditor";
import { ConsolePanel } from "./ConsolePanel";
import { TracepadMark } from "./TracepadMark";
import { Scratchpad } from "./scratchpad/Scratchpad";
import type { Scratchpad as ScratchpadData } from "./scratchpad/model";
import type { WorkspaceProject } from "./projects/types";
import { WorkspaceFiles, EditorFileTabs } from "./WorkspaceFiles";
import { InterviewPanel, RequirementList } from "./InterviewPanel";
import {
  getActiveFile,
  getFileSource,
  validateFilePath,
  validateProjectFiles,
} from "./files";
import { useLearningWorkspace } from "./learning/useLearningWorkspace";
import { LearningPanel } from "./learning/LearningPanel";
import { LearningHub } from "./learning/LearningHub";
import type { RunEvidence } from "./learning/types";
import "./learning/learning.css";
import { builtInExercises } from "./exercises";
import { PythonRunner } from "./runner";
import {
  formatTime,
  getDraft,
  loadSession,
  pauseTimer,
  resetTimer,
  saveSession,
  startTimer,
  timerRemaining,
} from "./session";
import type {
  Draft,
  Exercise,
  PracticeCase,
  RunnerEvent,
  RunStatus,
  SessionState,
  TestResult,
} from "./types";

const uid = () => crypto.randomUUID();
const labels: Record<RunStatus, string> = {
  idle: "Ready",
  loading: "Starting Python",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
  "timed-out": "Timed out",
  "output-limit": "Output limit reached",
};
function IconButton({
  icon: Icon,
  label,
  showLabel = false,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  showLabel?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={16} />
      {showLabel && <span>{label}</span>}
    </button>
  );
}

function QuestionDialog({
  exercise,
  onClose,
  onSave,
}: {
  exercise?: Exercise;
  onClose: () => void;
  onSave: (exercise: Exercise) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [description, setDescription] = useState(exercise?.description ?? "");
  const [starterCode, setStarterCode] = useState(
    exercise?.starterCode ?? "def solve():\n    pass\n",
  );
  const [tests, setTests] = useState<PracticeCase[]>(exercise?.tests ?? []);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const addTest = () =>
    setTests((t) => [
      ...t,
      {
        id: uid(),
        name: `Test ${t.length + 1}`,
        code: 'assert False, "Replace with your assertion"',
      },
    ]);
  return (
    <dialog
      className="question-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="dialog-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            id: exercise?.id ?? `custom-${uid()}`,
            title: title.trim(),
            description: description.trim(),
            starterCode,
            tests,
            difficulty: "Custom",
            topic: "Your question",
            examples: [],
            constraints: [],
            custom: true,
          });
        }}
      >
        <div className="dialog-heading">
          <div>
            <h2 id="dialog-title">
              {exercise ? "Edit question" : "Make it your own"}
            </h2>
            <p>Add a prompt, starter code, and assertion tests.</p>
          </div>
          <IconButton icon={X} label="Close question form" onClick={onClose} />
        </div>
        <div className="form-fields">
          <label>
            Question title
            <input
              autoFocus
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Find the missing number"
            />
          </label>
          <label>
            Question prompt
            <textarea
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Paste the problem, examples, and constraints here…"
            />
          </label>
          <label>
            Starter code
            <textarea
              className="code-input"
              rows={5}
              value={starterCode}
              onChange={(e) => setStarterCode(e.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="section-heading">
            <h3>
              Test cases <span className="muted">optional</span>
            </h3>
            <button className="text-button" type="button" onClick={addTest}>
              <Plus size={14} /> Add test
            </button>
          </div>
          <p className="field-help">
            Use Python assertions, for example{" "}
            <code>assert solve([1, 2]) == 3</code>.
          </p>
          {tests.map((test, index) => (
            <div className="custom-test" key={test.id}>
              <div className="inline-field">
                <input
                  required
                  aria-label={`Test ${index + 1} name`}
                  value={test.name}
                  onChange={(e) =>
                    setTests((t) =>
                      t.map((x) =>
                        x.id === test.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <IconButton
                  icon={Trash2}
                  label={`Remove ${test.name}`}
                  onClick={() =>
                    setTests((t) => t.filter((x) => x.id !== test.id))
                  }
                />
              </div>
              <textarea
                required
                aria-label={`Test ${index + 1} assertion`}
                className="code-input"
                rows={3}
                value={test.code}
                onChange={(e) =>
                  setTests((t) =>
                    t.map((x) =>
                      x.id === test.id ? { ...x, code: e.target.value } : x,
                    ),
                  )
                }
                spellCheck={false}
              />
            </div>
          ))}
        </div>
        <div className="dialog-footer">
          <span>
            <HardDrive size={14} /> Saved on this browser
          </span>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!title.trim() || !description.trim()}
          >
            Save question
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function App({ project }: { project?: WorkspaceProject }) {
  const [initial] = useState(() =>
    project
      ? { state: project.initial.session, warning: undefined }
      : loadSession(),
  );
  const [session, setSession] = useState<SessionState>(initial.state);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = session.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        session.theme === "light" ? "#f5f7f9" : "#14171d",
      );
  }, [session.theme]);
  const [saveWarning, setSaveWarning] = useState(initial.warning ?? "");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [questionForm, setQuestionForm] = useState<Exercise | "new" | null>(
    null,
  );
  const [tab, setTab] = useState<"console" | "tests" | "input">("console");
  const [mobileTab, setMobileTab] = useState<"question" | "workspace">(
    "workspace",
  );
  const [focusMode, setFocusMode] = useState(false);
  const [scratchpadExpanded, setScratchpadExpanded] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("45");
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState<RunStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [output, setOutput] = useState<{ stream: string; text: string }[]>([]);
  const [consoleCleared, setConsoleCleared] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [results, setResults] = useState<TestResult[]>([]);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [deletedTests, setDeletedTests] = useState<
    { test: PracticeCase; index: number }[]
  >([]);
  const [testsExecuted, setTestsExecuted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const runner = useRef<PythonRunner | null>(null);
  const currentRun = useRef("");
  const layout = useRef<HTMLDivElement>(null);
  const questionContent = useRef<HTMLDivElement>(null);
  const libraryTrigger = useRef<HTMLButtonElement>(null);
  const editorOptions = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      const options = editorOptions.current;
      if (!options?.open) return;
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        options.open = false;
        options.querySelector("summary")?.focus();
      } else if (
        event.type === "pointerdown" &&
        !options.contains(event.target as Node)
      )
        options.open = false;
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, []);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 700px)").matches,
  );
  const closeLibrary = useCallback(() => {
    setLibraryOpen(false);
    libraryTrigger.current?.focus();
  }, []);
  const learning = useLearningWorkspace(
    session,
    setSession,
    now,
    () => runner.current?.stop(),
    project,
  );
  useLayoutEffect(() => {
    project?.onSession(session);
  }, [session, project?.onSession]);
  useEffect(() => {
    project?.registerBeforeLeave(() => {
      runner.current?.stop();
      learning.cancelPreparation();
    });
    return () => project?.registerBeforeLeave(null);
  }, [project?.registerBeforeLeave, learning.cancelPreparation]);
  const { exercises, exercise, draft } = learning;
  const previousExercise = useRef(exercise.id);
  const activeFile = getActiveFile(draft);
  const projectFiles = { "main.py": draft.source, ...draft.files };
  const sidebarTab = session.sidebarTab ?? "brief";
  const sidebarCollapsed = session.sidebarCollapsed ?? false;
  const requirementUpdates = learning.currentAttempt?.requirementUpdates ?? [];
  const unreadRequirements = requirementUpdates.filter(
    (update) => !update.acknowledgedAt,
  );
  const practiceActive = !!learning.active;
  const mockActive = learning.active?.mode === "mock";
  const busy = status === "loading" || status === "running";
  const remaining = timerRemaining(session.timer, now);
  const passed = results.filter((r) => r.passed).length;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const changed = () => setIsMobile(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (project) return;
    if (initial.warning && session === initial.state) return;
    const id = setTimeout(
      () => setSaveWarning(saveSession(session) ?? ""),
      250,
    );
    return () => clearTimeout(id);
  }, [session, initial]);
  useEffect(() => {
    if (project) return;
    const persist = () => {
      if (initial.warning && session === initial.state) return;
      const warning = saveSession(session);
      if (warning) setSaveWarning(warning);
    };
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, [session, initial]);
  useEffect(() => {
    runner.current = new PythonRunner();
    return () => {
      runner.current?.destroy();
    };
  }, []);
  useEffect(() => {
    if (!libraryOpen && !timerOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (libraryOpen) closeLibrary();
        setTimerOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [libraryOpen, timerOpen, closeLibrary]);

  const updateDraft = useCallback(
    (patch: Partial<Draft>) => {
      runner.current?.stop();
      currentRun.current = "";
      runner.current?.destroy();
      setStatus("idle");
      setResults([]);
      setTestsExecuted(false);
      setRunMessage("");
      setElapsed(0);
      setSession((s) => ({
        ...s,
        drafts: {
          ...s.drafts,
          // A learning attempt can recover its project independently of the
          // workspace key. Initialize from that displayed draft, not starters.
          [exercise.id]: { ...(s.drafts[exercise.id] ?? draft), ...patch },
        },
      }));
      learning.syncDraft(patch);
    },
    [exercise, draft, learning.syncDraft],
  );
  function updateScratchpad(scratchpad: ScratchpadData) {
    // Reasoning edits do not change Python execution or invalidate test results.
    setSession((s) => ({
      ...s,
      drafts: {
        ...s.drafts,
        [exercise.id]: { ...(s.drafts[exercise.id] ?? draft), scratchpad },
      },
    }));
    learning.syncDraft({ scratchpad });
  }
  function selectFile(path: string) {
    // Viewing another module does not invalidate or interrupt execution.
    setSession((s) => ({
      ...s,
      drafts: { ...s.drafts, [exercise.id]: { ...draft, activeFile: path } },
    }));
    learning.syncDraft({ activeFile: path });
    setMobileTab("workspace");
  }
  function createFile(path: string): string | null {
    const error = validateFilePath(path);
    if (error) return error;
    if (Object.hasOwn(projectFiles, path))
      return "A file with that name already exists.";
    const files = { ...draft.files, [path]: "" };
    const projectError = validateProjectFiles(files, draft.source);
    if (projectError) return projectError;
    updateDraft({ files, activeFile: path });
    setMobileTab("workspace");
    return null;
  }
  function renameFile(oldPath: string, path: string): string | null {
    if (oldPath === "main.py")
      return "main.py is the entry point and cannot be renamed.";
    if (oldPath === path) return null;
    const error = validateFilePath(path);
    if (error) return error;
    if (Object.hasOwn(projectFiles, path))
      return "A file with that name already exists.";
    const files = { ...draft.files, [path]: draft.files?.[oldPath] ?? "" };
    delete files[oldPath];
    const projectError = validateProjectFiles(files, draft.source);
    if (projectError) return projectError;
    updateDraft({
      files,
      activeFile: activeFile === oldPath ? path : activeFile,
    });
    return null;
  }
  function deleteFile(path: string): string | null {
    if (path === "main.py")
      return "main.py is the entry point and cannot be deleted.";
    const files = { ...draft.files };
    delete files[path];
    updateDraft({
      files,
      activeFile: activeFile === path ? "main.py" : activeFile,
    });
    return null;
  }
  function openSidebar(next: "brief" | "files" | "interview" | "scratchpad") {
    if (next !== "scratchpad") setScratchpadExpanded(false);
    setSession((s) => ({ ...s, sidebarTab: next, sidebarCollapsed: false }));
    setFocusMode(false);
    setLibraryOpen(false);
  }
  const clearRun = () => {
    runner.current?.stop();
    currentRun.current = "";
    setStatus("idle");
    setOutput([]);
    setConsoleCleared(false);
    setResults([]);
    setRunMessage("");
    setElapsed(0);
    setTestsExecuted(false);
  };
  const selectExercise = (id: string) => {
    if (id !== exercise.id && !learning.beforeSwitch()) return;
    clearRun();
    setSession((s) => ({ ...s, activeId: id }));
    closeLibrary();
    setExpandedTest(null);
  };
  useEffect(() => {
    clearRun();
    setDeletedTests([]);
    if (previousExercise.current !== exercise.id) {
      setSession((s) => ({
        ...s,
        sidebarTab: learning.active?.mode === "mock" ? "interview" : "brief",
        sidebarCollapsed: false,
      }));
      previousExercise.current = exercise.id;
      if (learning.active?.mode === "mock") setMobileTab("question");
    }
    questionContent.current?.scrollTo({ top: 0 });
  }, [exercise.id]);
  const execute = useCallback(
    (withTests = false, baseline = false, finish = false) => {
      const tests =
        baseline && learning.active
          ? learning.active.question.baselineTests
          : draft.tests;
      if (project?.suspended || busy || (withTests && tests.length === 0))
        return;
      const runId = uid();
      setFinishing(finish);
      const attemptId = learning.active?.id;
      const evidence: RunEvidence = {
        id: runId,
        at: Date.now(),
        kind: baseline ? "baseline" : withTests ? "scratch" : "run",
        source: draft.source,
        files: structuredClone(draft.files ?? {}),
        activeFile,
        stdin: draft.stdin,
        tests: withTests ? structuredClone(tests) : [],
        results: [],
        status: "loading",
        elapsedMs: 0,
        output: "",
      };
      currentRun.current = runId;
      setOutput([]);
      setConsoleCleared(false);
      setResults([]);
      setRunMessage("");
      setElapsed(0);
      setTestsExecuted(withTests && !baseline);
      setTab(withTests && !baseline ? "tests" : "console");
      setStatus("loading");
      setOutputCollapsed(false);
      runner.current?.run(
        {
          runId,
          source: draft.source,
          files: draft.files,
          stdin: draft.stdin,
          ...(withTests ? { tests } : {}),
        },
        (event: RunnerEvent) => {
          if (event.runId !== currentRun.current) return;
          if (event.type === "status") setStatus(event.status);
          if (event.type === "output") {
            evidence.output += event.text;
            setOutput((o) => [
              ...o,
              { stream: event.stream, text: event.text },
            ]);
          }
          if (event.type === "test") {
            evidence.results.push(event.result);
            setResults((r) => [...r, event.result]);
            if (baseline)
              setOutput((o) => [
                ...o,
                {
                  stream: event.result.passed ? "stdout" : "stderr",
                  text: `${event.result.passed ? "PASS" : "FAIL"} · ${event.result.name}\n${event.result.error ?? ""}\n`,
                },
              ]);
          }
          if (event.type === "complete") {
            setFinishing(false);
            setStatus(event.status);
            setElapsed(event.elapsedMs);
            setRunMessage(event.message ?? "");
            if (attemptId)
              learning.recordRun(
                attemptId,
                {
                  ...evidence,
                  at: Date.now(),
                  status: event.status,
                  elapsedMs: event.elapsedMs,
                  message: event.message,
                },
                finish,
              );
          }
        },
      );
    },
    [busy, draft, learning.active, learning.recordRun, project?.suspended],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter" &&
        !questionForm &&
        !learning.view &&
        !event.defaultPrevented &&
        !(event.target as HTMLElement).closest(
          ".monaco-editor, dialog, [popover], .scratchpad, .learning-panel textarea",
        )
      ) {
        event.preventDefault();
        execute();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [execute, questionForm, learning.view]);

  function resize(event: React.PointerEvent, axis: "horizontal" | "vertical") {
    event.preventDefault();
    const start = axis === "horizontal" ? event.clientX : event.clientY;
    const original =
      axis === "horizontal" ? session.panelWidth : session.consoleHeight;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      if (axis === "horizontal") {
        const width = layout.current?.clientWidth ?? 1000;
        setSession((s) => ({
          ...s,
          panelWidth: Math.min(
            55,
            Math.max(25, original + ((e.clientX - start) / width) * 100),
          ),
        }));
      } else
        setSession((s) => ({
          ...s,
          consoleHeight: Math.min(
            500,
            Math.max(160, original - (e.clientY - start)),
          ),
        }));
    };
    const stop = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  }

  function saveQuestion(saved: Exercise) {
    if (!learning.beforeSwitch()) return;
    const existing = session.customExercises.some((x) => x.id === saved.id);
    clearRun();
    setSession((s) => ({
      ...s,
      activeId: saved.id,
      customExercises: existing
        ? s.customExercises.map((x) => (x.id === saved.id ? saved : x))
        : [...s.customExercises, saved],
      drafts: {
        ...s.drafts,
        [saved.id]: {
          ...(existing ? getDraft(s, saved) : {}),
          source: existing ? getDraft(s, saved).source : saved.starterCode,
          stdin: existing ? getDraft(s, saved).stdin : "",
          tests: saved.tests,
        },
      },
    }));
    setQuestionForm(null);
    setMobileTab("workspace");
  }
  function deleteQuestion() {
    if (
      !window.confirm(
        `Delete “${exercise.title}” and its saved code? This cannot be undone.`,
      )
    )
      return;
    clearRun();
    setSession((s) => {
      const drafts = { ...s.drafts };
      delete drafts[exercise.id];
      return {
        ...s,
        activeId: "sandbox",
        customExercises: s.customExercises.filter((x) => x.id !== exercise.id),
        drafts,
      };
    });
  }
  const testPatch = (id: string, patch: Partial<PracticeCase>) =>
    updateDraft({
      tests: draft.tests.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  function deleteTest(test: PracticeCase) {
    setDeletedTests((items) => [
      ...items,
      {
        test: { ...test },
        index: draft.tests.findIndex((item) => item.id === test.id),
      },
    ]);
    updateDraft({ tests: draft.tests.filter((item) => item.id !== test.id) });
    setExpandedTest(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(".test-delete-notice button")
        ?.focus(),
    );
  }
  function undoTestDeletion() {
    const removed = deletedTests.at(-1);
    if (!removed || busy) return;
    const tests = [...draft.tests];
    if (!tests.some((test) => test.id === removed.test.id))
      tests.splice(Math.min(removed.index, tests.length), 0, removed.test);
    updateDraft({ tests });
    setDeletedTests((items) => items.slice(0, -1));
    setExpandedTest(removed.test.id);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>(
          '.tests-panel [aria-label="Test name"]',
        )
        ?.focus(),
    );
  }
  const duration = (minutes: number) => {
    if (practiceActive) return;
    setSession((s) => ({ ...s, timer: resetTimer(s.timer, minutes * 60000) }));
    setTimerOpen(false);
    setNow(Date.now());
  };

  return (
    <div className="app-shell" inert={project?.suspended}>
      <header className="app-header">
        <div className="workspace-identity">
          <a
            className="brand"
            href="#"
            onClick={(event) => event.preventDefault()}
            aria-label="Tracepad workspace"
            title="Understand it. Build it. Explain it."
          >
            <TracepadMark size={28} />
            <span>Tracepad</span>
          </a>
          {project && (
            <>
              <span className="identity-divider" />
              <button
                className="workspace-project-title"
                onClick={() => {
                  setTimerOpen(false);
                  setLibraryOpen(false);
                  project.onOpenProjects();
                }}
                aria-label={`Switch project: ${project.project.name}`}
                aria-expanded={project.projectsOpen}
                aria-controls="project-navigation"
                title="Switch project"
              >
                <Folder size={16} />
                <strong>{project.project.name}</strong>
                <ChevronsUpDown size={14} />
              </button>
            </>
          )}
        </div>
        <div className="header-divider" />
        <button
          className="text-button practice-launch"
          disabled={finishing}
          onClick={() => {
            setTimerOpen(false);
            setLibraryOpen(false);
            learning.setView("setup");
          }}
        >
          <GraduationCap size={17} /> Practice
        </button>
        <div className="timer-area">
          <div className={`timer ${remaining <= 0 ? "timer-expired" : ""}`}>
            <button
              className="timer-display"
              aria-label="Configure timer"
              disabled={practiceActive}
              aria-expanded={timerOpen}
              onClick={() => {
                setTimerOpen(!timerOpen);
                setLibraryOpen(false);
              }}
            >
              <Clock3 size={15} />
              <span role="timer" aria-label="Session time remaining">
                {formatTime(remaining)}
              </span>
              <ChevronDown size={12} />
            </button>
            <span className="timer-rule" />
            <IconButton
              icon={session.timer.deadline !== null ? Pause : Play}
              disabled={mockActive}
              label={
                session.timer.deadline !== null
                  ? "Pause timer"
                  : session.timer.started
                    ? "Resume timer"
                    : "Start timer"
              }
              onClick={() => {
                learning.pauseEvent();
                setSession((s) => ({
                  ...s,
                  timer:
                    s.timer.deadline !== null
                      ? pauseTimer(s.timer)
                      : startTimer(s.timer),
                }));
                setNow(Date.now());
              }}
            />
            <IconButton
              icon={RotateCcw}
              label="Reset timer"
              disabled={practiceActive}
              onClick={() => {
                setSession((s) => ({ ...s, timer: resetTimer(s.timer) }));
                setNow(Date.now());
              }}
            />
          </div>
          {timerOpen && !practiceActive && (
            <div className="timer-popover">
              <h3>Practice timer</h3>
              <p>The countdown starts when you press Start.</p>
              <div className="preset-row">
                {[30, 45, 60].map((m) => (
                  <button
                    key={m}
                    className="secondary-button"
                    onClick={() => duration(m)}
                  >
                    {m} min
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const minutes = Number(customMinutes);
                  if (minutes >= 1 && minutes <= 180) duration(minutes);
                }}
              >
                <label htmlFor="minutes">Custom minutes</label>
                <div className="inline-field">
                  <input
                    id="minutes"
                    type="number"
                    min={1}
                    max={180}
                    required
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                  />
                  <button className="secondary-button">Set</button>
                </div>
              </form>
            </div>
          )}
        </div>
        <button
          type="button"
          className="icon-button theme-toggle"
          aria-label={`Switch to ${session.theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${session.theme === "dark" ? "light" : "dark"} mode`}
          onClick={() =>
            setSession((s) => ({
              ...s,
              theme: s.theme === "dark" ? "light" : "dark",
            }))
          }
        >
          {session.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      {(saveWarning || learning.saveWarning) && (
        <div className="warning-banner" role="alert">
          <CircleAlert size={16} />
          {saveWarning || learning.saveWarning}
        </div>
      )}
      {remaining <= 0 && (
        <div className="time-banner" role="status">
          <Clock3 size={15} />
          <span>
            {practiceActive
              ? "Time’s up. Keep working, or finish and review your attempt."
              : "Time’s up. Keep going, or reset the timer for another round."}
          </span>
          {practiceActive && (
            <button
              className="text-button"
              onClick={() => {
                openSidebar("interview");
                setMobileTab("question");
              }}
            >
              Open interview <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
      <div
        className="mobile-navigation"
        role="tablist"
        aria-label="Workspace views"
        onKeyDown={(event) => {
          const views = [
            "brief",
            "files",
            "workspace",
            "scratchpad",
            "interview",
          ] as const;
          const current = mobileTab === "workspace" ? "workspace" : sidebarTab;
          const index = views.indexOf(current);
          const nextIndex =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? views.length - 1
                : event.key === "ArrowRight"
                  ? (index + 1) % views.length
                  : event.key === "ArrowLeft"
                    ? (index + views.length - 1) % views.length
                    : -1;
          if (nextIndex < 0) return;
          event.preventDefault();
          const next = views[nextIndex];
          if (next === "workspace") setMobileTab("workspace");
          else {
            openSidebar(next);
            setMobileTab("question");
          }
          document.getElementById(`view-${next}`)?.focus();
        }}
      >
        {(
          [
            ["brief", "Brief", BookOpen],
            ["files", "Files", Files],
            ["workspace", "Code", Code2],
            ["scratchpad", "Scratchpad", PencilRuler],
            ["interview", "Interview", MessagesSquare],
          ] as const
        ).map(([id, label, Icon]) => {
          const selected =
            id === "workspace"
              ? mobileTab === "workspace"
              : mobileTab === "question" && sidebarTab === id;
          return (
            <button
              key={id}
              id={`view-${id}`}
              role="tab"
              aria-label={label}
              aria-description={
                id === "interview" && unreadRequirements.length
                  ? `${unreadRequirements.length} unread requirements`
                  : undefined
              }
              aria-selected={selected}
              aria-controls={
                id === "workspace" ? "coding-panel" : "question-panel"
              }
              tabIndex={selected ? 0 : -1}
              className={selected ? "active" : ""}
              onClick={() => {
                if (id === "workspace") setMobileTab("workspace");
                else {
                  openSidebar(id);
                  setMobileTab("question");
                }
              }}
            >
              <Icon size={15} />
              {label}
              {id === "interview" && unreadRequirements.length > 0 && (
                <span className="tab-count">{unreadRequirements.length}</span>
              )}
            </button>
          );
        })}
      </div>

      <main
        className={`workspace ${scratchpadExpanded && sidebarTab === "scratchpad" && !isMobile ? "scratchpad-focus" : ""} ${focusMode ? "focus-mode" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""} mobile-${mobileTab}`}
        ref={layout}
        style={
          {
            "--question-width": `${session.panelWidth}%`,
            "--console-height": `${session.consoleHeight}px`,
          } as React.CSSProperties
        }
      >
        <section
          className="question-pane"
          id="question-panel"
          role={isMobile ? "tabpanel" : undefined}
          aria-labelledby={isMobile ? `view-${sidebarTab}` : undefined}
          aria-label="Practice sidebar"
        >
          <div
            className="sidebar-tabs"
            role="tablist"
            aria-label="Practice sidebar"
            onKeyDown={(e) => {
              const tabs = [
                "brief",
                "files",
                "scratchpad",
                "interview",
              ] as const;
              if (
                ![
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(e.key)
              )
                return;
              e.preventDefault();
              const index = tabs.indexOf(sidebarTab);
              const next =
                e.key === "Home"
                  ? tabs[0]
                  : e.key === "End"
                    ? tabs[tabs.length - 1]
                    : tabs[
                        (index +
                          (e.key === "ArrowLeft" || e.key === "ArrowUp"
                            ? tabs.length - 1
                            : 1)) %
                          tabs.length
                      ];
              openSidebar(next);
              document.getElementById(`sidebar-tab-${next}`)?.focus();
            }}
          >
            {(
              [
                ["brief", "Brief", BookOpen],
                ["files", "Files", Files],
                ["scratchpad", "Scratchpad", PencilRuler],
                ["interview", "Interview", MessagesSquare],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                id={`sidebar-tab-${id}`}
                role="tab"
                aria-label={label}
                aria-selected={sidebarTab === id}
                aria-controls={`sidebar-panel-${id}`}
                tabIndex={sidebarTab === id ? 0 : -1}
                className={sidebarTab === id ? "active" : ""}
                title={label}
                onClick={() => openSidebar(id)}
              >
                <Icon size={15} />
                <span className="sidebar-tab-label">{label}</span>
                {id === "interview" && unreadRequirements.length > 0 && (
                  <span className="tab-count">{unreadRequirements.length}</span>
                )}
              </button>
            ))}
            <button
              className="sidebar-collapse icon-button"
              type="button"
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() =>
                setSession((s) => ({
                  ...s,
                  sidebarCollapsed: !s.sidebarCollapsed,
                }))
              }
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          </div>
          {libraryOpen && (
            <div className="library-popover">
              <div className="library-search">
                <Search size={16} />
                <input
                  autoFocus
                  aria-label="Search exercises"
                  placeholder="Find a question…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <IconButton
                  icon={X}
                  label="Close practice library"
                  onClick={closeLibrary}
                />
              </div>
              <div className="library-list">
                {exercises
                  .filter((e) =>
                    `${e.title} ${e.topic}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((e) => (
                    <button
                      className={e.id === exercise.id ? "selected" : ""}
                      key={e.id}
                      onClick={() => selectExercise(e.id)}
                    >
                      <span>
                        <strong>{e.title}</strong>
                        <small>{e.topic}</small>
                      </span>
                      <span
                        className={`difficulty difficulty-${e.difficulty.toLowerCase()}`}
                      >
                        {e.difficulty}
                      </span>
                    </button>
                  ))}
                {!exercises.some((e) =>
                  `${e.title} ${e.topic}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ) && (
                  <p className="library-empty">
                    No matching questions. Try another search.
                  </p>
                )}
              </div>
              <button
                className="library-create text-button"
                onClick={() => {
                  setLibraryOpen(false);
                  setQuestionForm("new");
                }}
              >
                <Plus size={15} /> Add your own question
              </button>
            </div>
          )}
          <div className="sidebar-body" hidden={sidebarCollapsed && !isMobile}>
            <div
              className="question-content"
              ref={questionContent}
              role={isMobile ? undefined : "tabpanel"}
              id="sidebar-panel-brief"
              aria-labelledby={isMobile ? undefined : "sidebar-tab-brief"}
              hidden={sidebarTab !== "brief"}
            >
              <div className="question-toolbar">
                <button
                  ref={libraryTrigger}
                  disabled={finishing}
                  className="exercise-picker"
                  aria-label="Practice library"
                  aria-expanded={libraryOpen}
                  onClick={() => {
                    setLibraryOpen(!libraryOpen);
                    setTimerOpen(false);
                  }}
                >
                  <BookOpen size={16} />
                  <span>Change question</span>
                  <ChevronDown size={13} />
                </button>
                <button
                  className="new-question secondary-button"
                  aria-label="New question"
                  onClick={() => setQuestionForm("new")}
                >
                  <Plus size={16} /> <span>New question</span>
                </button>
              </div>
              <div className="question-meta">
                <span
                  className={`difficulty difficulty-${exercise.difficulty.toLowerCase()}`}
                >
                  {exercise.difficulty}
                </span>
                <span>{exercise.topic}</span>
                {exercise.custom && (
                  <div className="custom-actions">
                    <IconButton
                      icon={Pencil}
                      label="Edit question"
                      onClick={() =>
                        setQuestionForm({ ...exercise, tests: draft.tests })
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      label="Delete question"
                      onClick={deleteQuestion}
                    />
                  </div>
                )}
              </div>
              <h1>{exercise.title}</h1>
              {mockActive && (
                <div className="mock-return">
                  <span>60-minute mock interview</span>
                  <button
                    className="text-button"
                    onClick={() => openSidebar("interview")}
                  >
                    Back to interview <ChevronRight size={13} />
                  </button>
                </div>
              )}
              <div className="question-description">{exercise.description}</div>
              <RequirementList
                updates={requirementUpdates}
                onAcknowledge={learning.acknowledgeRequirement}
                readOnly={learning.currentAttempt?.finishedAt != null}
              />
              {exercise.examples.map((example, i) => (
                <section className="example" key={i}>
                  <h2>Example {i + 1}</h2>
                  <div className="example-code">
                    <div>
                      <span>Input</span>
                      <code>{example.input}</code>
                    </div>
                    <div>
                      <span>Output</span>
                      <code>{example.output}</code>
                    </div>
                  </div>
                  {example.explanation && <p>{example.explanation}</p>}
                </section>
              ))}
              {exercise.constraints.length > 0 && (
                <section className="constraints">
                  <h2>Constraints</h2>
                  <ul>
                    {exercise.constraints.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </section>
              )}
              {learning.panelProps ? (
                <button
                  className="brief-interview-link secondary-button"
                  onClick={() => openSidebar("interview")}
                >
                  <MessagesSquare size={15} /> Notes, hints & review{" "}
                  <ChevronRight size={14} />
                </button>
              ) : (
                <div className="practice-note">
                  <span className="note-symbol">
                    <Code2 size={18} />
                  </span>
                  <div>
                    <strong>Make space for your thinking.</strong>
                    <p>
                      Talk through your approach, consider the edge cases, then
                      put it to the test.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div
              role={isMobile ? undefined : "tabpanel"}
              id="sidebar-panel-files"
              aria-labelledby={isMobile ? undefined : "sidebar-tab-files"}
              hidden={sidebarTab !== "files"}
            >
              <WorkspaceFiles
                key={exercise.id}
                workspaceName={exercise.title}
                files={projectFiles}
                activeFile={activeFile}
                onSelect={selectFile}
                onCreate={createFile}
                onRename={renameFile}
                onDelete={deleteFile}
                disabled={finishing}
              />
            </div>
            <div
              role={isMobile ? undefined : "tabpanel"}
              id="sidebar-panel-scratchpad"
              aria-labelledby={isMobile ? undefined : "sidebar-tab-scratchpad"}
              hidden={sidebarTab !== "scratchpad"}
            >
              <Scratchpad
                key={exercise.id}
                value={draft.scratchpad}
                onChange={updateScratchpad}
                title={exercise.title}
                expanded={scratchpadExpanded}
                onExpand={() => setScratchpadExpanded((value) => !value)}
                disabled={finishing || !!project?.suspended}
              />
            </div>
            <div
              role={isMobile ? undefined : "tabpanel"}
              id="sidebar-panel-interview"
              aria-labelledby={isMobile ? undefined : "sidebar-tab-interview"}
              hidden={sidebarTab !== "interview"}
            >
              <InterviewPanel
                attempt={learning.currentAttempt}
                bridgeStatus={learning.hubProps.bridgeStatus}
                lastAgentSeenAt={learning.hubProps.lastAgentSeenAt}
                pendingRequests={learning.hubProps.requests.length}
                incomingQuestions={
                  learning.hubProps.commands.filter(
                    (c) => c.type === "question",
                  ).length
                }
                onOpenCoach={() => learning.setView("ai")}
                onStartPractice={() => learning.setView("setup")}
                onToggleLive={learning.setLiveInterviewer}
                onAcknowledge={learning.acknowledgeRequirement}
              >
                {learning.panelProps && (
                  <LearningPanel
                    key={learning.currentAttempt!.id}
                    {...learning.panelProps}
                    busy={busy}
                    onAcknowledge={learning.acknowledgeRequirement}
                    onOpenTool={(tool) => {
                      if (tool === "code") {
                        setMobileTab("workspace");
                        document
                          .querySelector<HTMLElement>(
                            '[aria-label="Python code editor"]',
                          )
                          ?.focus();
                      } else {
                        openSidebar(tool);
                        setMobileTab("question");
                      }
                    }}
                    onBaseline={() => execute(true, true)}
                    onFinish={() => execute(true, true, true)}
                  />
                )}
              </InterviewPanel>
            </div>
          </div>
        </section>
        <div
          className="vertical-resizer"
          role="separator"
          aria-label="Resize question panel"
          aria-orientation="vertical"
          tabIndex={0}
          aria-valuemin={25}
          aria-valuemax={55}
          aria-valuenow={session.panelWidth}
          onPointerDown={(e) => resize(e, "horizontal")}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setSession((s) => ({
                ...s,
                panelWidth: Math.max(
                  25,
                  Math.min(
                    55,
                    s.panelWidth + (e.key === "ArrowRight" ? 2 : -2),
                  ),
                ),
              }));
            }
          }}
        />
        <section
          className={`coding-pane ${outputCollapsed ? "output-collapsed" : ""}`}
          id="coding-panel"
          role={isMobile ? "tabpanel" : undefined}
          aria-labelledby={isMobile ? "view-workspace" : undefined}
          aria-label="Python workspace"
        >
          <div className="pane-toolbar editor-toolbar">
            {focusMode && (
              <IconButton
                icon={PanelLeftOpen}
                label="Show sidebar"
                onClick={() => setFocusMode(false)}
              />
            )}
            <EditorFileTabs
              files={projectFiles}
              activeFile={activeFile}
              onSelect={selectFile}
            />
            <div className="run-actions">
              {busy ? (
                <button
                  className="stop-button"
                  onClick={() => runner.current?.stop()}
                >
                  <Square size={13} fill="currentColor" /> Stop
                </button>
              ) : (
                <>
                  <button
                    className="test-button"
                    title={
                      draft.tests.length
                        ? "Run each assertion independently"
                        : "Add an assertion in the Tests panel"
                    }
                    onClick={() => {
                      if (draft.tests.length) execute(true);
                      else {
                        setTab("tests");
                        setOutputCollapsed(false);
                        requestAnimationFrame(() =>
                          document.getElementById("add-test")?.focus(),
                        );
                      }
                    }}
                  >
                    <FlaskConical size={15} />{" "}
                    {draft.tests.length ? "Run tests" : "Add tests"}
                  </button>
                  <button
                    className="primary-button run-button"
                    title="Run Python (Ctrl/Cmd+Enter)"
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    onClick={() => execute()}
                  >
                    <Play size={14} fill="currentColor" /> Run <kbd>Ctrl ↵</kbd>
                  </button>
                </>
              )}
            </div>
            <details className="editor-options" ref={editorOptions}>
              <summary title="Editor options" aria-label="Editor options">
                <Settings2 size={17} />
              </summary>
              <div className="editor-options-panel">
                <h3>Editor options</h3>
                <div className="editor-actions">
                  <label className="font-control" title="Editor font size">
                    <span>Font size</span>
                    <select
                      aria-label="Editor font size"
                      value={session.fontSize}
                      onChange={(e) =>
                        setSession((s) => ({
                          ...s,
                          fontSize: Number(e.target.value),
                        }))
                      }
                    >
                      {Array.from({ length: 13 }, (_, i) => i + 12).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <IconButton
                    icon={RotateCcw}
                    label="Reset code"
                    showLabel
                    onClick={() => {
                      if (
                        getFileSource(draft, activeFile) ===
                          (activeFile === "main.py"
                            ? exercise.starterCode
                            : "") ||
                        window.confirm(
                          `Reset ${activeFile}${activeFile === "main.py" ? " to the starter" : " to an empty module"}? Your current edits in this file will be lost.`,
                        )
                      ) {
                        clearRun();
                        updateDraft(
                          activeFile === "main.py"
                            ? { source: exercise.starterCode }
                            : { files: { ...draft.files, [activeFile]: "" } },
                        );
                      }
                    }}
                  />
                  <IconButton
                    icon={focusMode ? Minimize2 : Maximize2}
                    label={focusMode ? "Exit focus mode" : "Focus editor"}
                    showLabel
                    onClick={() => {
                      setFocusMode(!focusMode);
                      if (editorOptions.current)
                        editorOptions.current.open = false;
                    }}
                  />
                </div>
              </div>
            </details>
          </div>
          {unreadRequirements.length > 0 && (
            <div className="interview-notice" role="status">
              <MessagesSquare size={15} />
              <span>
                {unreadRequirements.length === 1
                  ? "New requirement"
                  : `${unreadRequirements.length} new requirements`}{" "}
                · {unreadRequirements[unreadRequirements.length - 1].title}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  openSidebar("interview");
                  setMobileTab("question");
                }}
              >
                View update <ChevronRight size={13} />
              </button>
            </div>
          )}
          <div className="editor-region">
            <CodeEditor
              theme={session.theme}
              readOnly={finishing || project?.suspended}
              key={exercise.id}
              documentId={`${exercise.id}/${activeFile}`}
              documentIds={Object.keys(projectFiles).map(
                (path) => `${exercise.id}/${path}`,
              )}
              source={getFileSource(draft, activeFile)}
              fontSize={session.fontSize}
              onChange={(source) =>
                updateDraft(
                  activeFile === "main.py"
                    ? { source }
                    : { files: { ...draft.files, [activeFile]: source } },
                )
              }
              onRun={() => execute()}
            />
          </div>
          <div
            className="horizontal-resizer"
            role="separator"
            aria-label="Resize output panel"
            aria-orientation="horizontal"
            tabIndex={0}
            aria-valuemin={160}
            aria-valuemax={500}
            aria-valuenow={session.consoleHeight}
            onPointerDown={(e) => resize(e, "vertical")}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                setSession((s) => ({
                  ...s,
                  consoleHeight: Math.max(
                    160,
                    Math.min(
                      500,
                      s.consoleHeight + (e.key === "ArrowUp" ? 20 : -20),
                    ),
                  ),
                }));
              }
            }}
          >
            <GripHorizontal size={16} />
          </div>
          <section className="output-pane" aria-label="Execution output">
            <div className="output-toolbar">
              <div
                className="output-tabs"
                role="tablist"
                aria-label="Output panels"
              >
                {(["console", "tests", "input"] as const).map((t) => (
                  <button
                    key={t}
                    id={`tab-${t}`}
                    role="tab"
                    aria-selected={tab === t}
                    aria-controls={`panel-${t}`}
                    tabIndex={tab === t ? 0 : -1}
                    className={tab === t ? "active" : ""}
                    onClick={() => {
                      setTab(t);
                      setOutputCollapsed(false);
                    }}
                    onKeyDown={(e) => {
                      const tabs = ["console", "tests", "input"] as const;
                      const index = tabs.indexOf(t);
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.preventDefault();
                        const next =
                          tabs[(index + (e.key === "ArrowRight" ? 1 : 2)) % 3];
                        setTab(next);
                        setOutputCollapsed(false);
                        document.getElementById(`tab-${next}`)?.focus();
                      }
                    }}
                  >
                    {t === "console" ? (
                      <Terminal size={14} />
                    ) : t === "tests" ? (
                      <FlaskConical size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    {t === "input"
                      ? "Input"
                      : t.charAt(0).toUpperCase() + t.slice(1)}
                    {t === "tests" && (
                      <span className="tab-count">
                        {testsExecuted && results.length
                          ? `${passed}/${draft.tests.length}`
                          : draft.tests.length}
                      </span>
                    )}
                    {t === "input" && draft.stdin && (
                      <span className="input-dot" />
                    )}
                  </button>
                ))}
              </div>
              <div className="output-status" role="status">
                {busy ? (
                  <LoaderCircle size={12} className="spin" />
                ) : (
                  <span className={`status-dot status-${status}`} />
                )}
                <span title={labels[status]}>{labels[status]}</span>
                {elapsed > 0 && (
                  <span className="elapsed">
                    {(elapsed / 1000).toFixed(2)}s
                  </span>
                )}
                <IconButton
                  icon={outputCollapsed ? ChevronRight : ChevronDown}
                  label={outputCollapsed ? "Expand output" : "Collapse output"}
                  aria-expanded={!outputCollapsed}
                  onClick={() => setOutputCollapsed((value) => !value)}
                />
              </div>
            </div>
            {tab === "console" && (
              <ConsolePanel
                output={output}
                status={status}
                runId={currentRun.current}
                message={runMessage}
                cleared={consoleCleared}
                onClear={() => setConsoleCleared(true)}
                onOpenInput={() => {
                  setTab("input");
                  document.getElementById("tab-input")?.focus();
                }}
              />
            )}
            {tab === "input" && (
              <div
                className="input-panel"
                role="tabpanel"
                id="panel-input"
                aria-labelledby="tab-input"
              >
                <label htmlFor="standard-input">
                  Standard input{" "}
                  <span>
                    Read with <code>input()</code> or{" "}
                    <code>sys.stdin.read()</code>.
                  </span>
                </label>
                <textarea
                  id="standard-input"
                  disabled={finishing}
                  className="code-input"
                  value={draft.stdin}
                  onChange={(e) => updateDraft({ stdin: e.target.value })}
                  placeholder={"One value per line, for example:\n5\n1 2 3 4 5"}
                  spellCheck={false}
                />
                <p>
                  Input is supplied before each run. The same input is replayed
                  for every test.
                </p>
              </div>
            )}
            {tab === "tests" && (
              <div
                className="tests-panel"
                role="tabpanel"
                id="panel-tests"
                aria-labelledby="tab-tests"
              >
                <div className="test-summary">
                  <span>
                    {testsExecuted && results.length
                      ? `${passed} passed · ${results.length - passed} failed${results.length < draft.tests.length ? ` · ${draft.tests.length - results.length} not run` : ""}`
                      : "Named assertions run independently."}
                  </span>
                  <button
                    className="text-button"
                    id="add-test"
                    disabled={busy}
                    onClick={() => {
                      const id = uid();
                      updateDraft({
                        tests: [
                          ...draft.tests,
                          {
                            id,
                            name: `Test ${draft.tests.length + 1}`,
                            code: 'assert False, "Replace with your assertion"',
                          },
                        ],
                      });
                      setExpandedTest(id);
                    }}
                  >
                    <Plus size={14} /> Add test
                  </button>
                </div>
                {deletedTests.length > 0 && (
                  <div className="test-delete-notice" role="status">
                    <span>
                      Deleted “
                      {deletedTests.at(-1)!.test.name || "Untitled test"}”.
                    </span>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={undoTestDeletion}
                    >
                      Undo
                    </button>
                  </div>
                )}
                {draft.tests.length === 0 && (
                  <div className="tests-empty">
                    <FlaskConical size={22} />
                    <p>Add a Python assertion to check your solution.</p>
                  </div>
                )}
                {draft.tests.map((test) => {
                  const result = results.find((r) => r.id === test.id);
                  return (
                    <div className="test-case" key={test.id}>
                      <button
                        className="test-case-heading"
                        aria-expanded={expandedTest === test.id}
                        onClick={() =>
                          setExpandedTest(
                            expandedTest === test.id ? null : test.id,
                          )
                        }
                      >
                        <ChevronRight
                          size={13}
                          className={expandedTest === test.id ? "rotated" : ""}
                        />
                        {result ? (
                          result.passed ? (
                            <Check size={15} className="passed" />
                          ) : (
                            <X size={15} className="failed" />
                          )
                        ) : (
                          <span className="test-idle-dot" />
                        )}
                        <span>{test.name || "Untitled test"}</span>
                        <small
                          className={
                            result?.passed ? "passed" : result ? "failed" : ""
                          }
                        >
                          {result
                            ? result.passed
                              ? "Passed"
                              : "Failed"
                            : testsExecuted && !busy
                              ? "Not run"
                              : "Ready"}
                        </small>
                      </button>
                      {expandedTest === test.id && (
                        <div className="test-case-body">
                          <div className="inline-field">
                            <input
                              aria-label="Test name"
                              value={test.name}
                              disabled={busy}
                              onChange={(e) =>
                                testPatch(test.id, { name: e.target.value })
                              }
                            />
                            <IconButton
                              icon={Trash2}
                              label={`Delete test ${test.name}`}
                              disabled={busy}
                              onClick={() => deleteTest(test)}
                            />
                          </div>
                          <textarea
                            aria-label={`Assertion for ${test.name}`}
                            className="code-input"
                            rows={3}
                            value={test.code}
                            disabled={busy}
                            spellCheck={false}
                            onChange={(e) =>
                              testPatch(test.id, { code: e.target.value })
                            }
                          />
                          {result?.error && (
                            <pre className="test-error">{result.error}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {runMessage && (
                  <div
                    className={`run-message ${status === "completed" ? "" : "error-message"}`}
                  >
                    {runMessage}
                  </div>
                )}
              </div>
            )}
          </section>
        </section>
      </main>
      <footer className="app-footer">
        <span
          className={
            saveWarning || learning.saveWarning || project?.saveFailed
              ? "save-error"
              : ""
          }
        >
          {saveWarning || learning.saveWarning || project?.saveFailed ? (
            <CircleAlert size={12} />
          ) : (
            <Check size={12} />
          )}
          {saveWarning || learning.saveWarning
            ? "Changes are not saved"
            : project
              ? project.saveStatus
              : "Autosave on"}
        </span>

        <span>
          <span className="python-dot" /> Python 3{" "}
          <span className="footer-separator">/</span> main.py
        </span>
      </footer>
      {questionForm && (
        <QuestionDialog
          exercise={questionForm === "new" ? undefined : questionForm}
          onClose={() => setQuestionForm(null)}
          onSave={saveQuestion}
        />
      )}
      {learning.view && (
        <LearningHub
          {...learning.hubProps}
          view={learning.view}
          onView={learning.setView}
          onClose={() => {
            learning.hubProps.onCancelPreparation();
            learning.setView(null);
          }}
        />
      )}
    </div>
  );
}
