import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  History,
  LoaderCircle,
  Plug,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { AttemptReview } from "./LearningPanel";
import { TracepadMark } from "../TracepadMark";
import { attemptSummary } from "./state";
import { INTERVIEW_PHASES } from "./journey";
import type { SRSRecord } from "./srs";
import type {
  Attempt,
  BridgeCommand,
  Level,
  PracticeMode,
  PracticeSnapshot,
  QuestionPackage,
  Topic,
} from "./types";
import "./learning.css";
import "./practice-setup.css";

export type LearningHubView = "setup" | "history" | "ai" | "review";

export interface LearningHubProps {
  view: LearningHubView;
  onView: (view: LearningHubView) => void;
  onClose: () => void;
  topics: Topic[];
  attempts: Attempt[];
  acceptedQuestions: QuestionPackage[];
  reviewAttempt: Attempt | null;
  onReview: (id: string) => void;
  onSelfCheck: (id: string, patch: Partial<Attempt["selfCheck"]>) => void;
  onRetry: (attempt: Attempt) => void;
  onRequestReview: (id: string) => void;
  requests: PracticeSnapshot["requests"];
  onCancelRequest: (id: string) => void;
  onGenerate: (
    topicId: string,
    level: Level,
    mode: PracticeMode,
    minutes: number,
  ) => void;
  onRequestQuestion: (
    topicId: string,
    level: Level,
    mode: PracticeMode,
  ) => void;
  onStartQuestion: (question: QuestionPackage, mode: PracticeMode) => void;
  commands: BridgeCommand[];
  onAcceptQuestion: (
    command: Extract<BridgeCommand, { type: "question" }>,
  ) => void;
  onDismissCommand: (id: string) => void;
  bridgeStatus: "connecting" | "ready" | "offline";
  lastAgentSeenAt: number | null;
  preparing: boolean;
  preparationError: string;
  onCancelPreparation: () => void;
  dueRecords: SRSRecord[];
  now: number;
}

const tabs = [
  { id: "setup", label: "Practice", icon: BookOpen },
  { id: "history", label: "History", icon: History },
  { id: "ai", label: "AI coach", icon: Sparkles },
] as const;
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function LearningHub(props: LearningHubProps) {
  const {
    view,
    onView,
    onClose,
    topics,
    attempts,
    acceptedQuestions,
    reviewAttempt,
    onReview,
    onSelfCheck,
    onRetry,
    onRequestReview,
    requests,
    onCancelRequest,
    onGenerate,
    onRequestQuestion,
    onStartQuestion,
    commands,
    onAcceptQuestion,
    onDismissCommand,
    bridgeStatus,
    lastAgentSeenAt,
    preparing,
    preparationError,
    onCancelPreparation,
    dueRecords,
    now,
  } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const configField = useRef<HTMLTextAreaElement>(null);
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [level, setLevel] = useState<Level>("foundation");
  const [mode, setMode] = useState<PracticeMode>("drill");
  const [minutes, setMinutes] = useState(15);
  const [config, setConfig] = useState("");
  const [configError, setConfigError] = useState("");
  const [configLoading, setConfigLoading] = useState(false);
  const [configRetry, setConfigRetry] = useState(0);
  const [copyMessage, setCopyMessage] = useState("");
  const composition = topics.find((topic) => topic.id.includes("composition"));
  const visibleDue = dueRecords.filter((r) =>
    topics.some((t) => t.id === r.topicId),
  );
  const selectedTopic =
    mode === "mock" ? (composition?.id ?? topicId) : topicId;
  const selectedLevel = mode === "mock" ? "applied" : level;
  const selectedMinutes = mode === "mock" ? 60 : minutes;
  const navView = view === "review" ? "history" : view;
  const completed = attempts
    .filter((attempt) => attempt.finishedAt !== null)
    .sort((a, b) => b.startedAt - a.startedAt);
  const incoming = commands.filter((command) => command.type === "question");
  const duplicateRequest = requests.some(
    (request) =>
      request.kind === "question" &&
      request.topicId === selectedTopic &&
      request.level === selectedLevel &&
      request.mode === mode,
  );

  useEffect(() => {
    const element = dialog.current;
    const focused = document.activeElement;
    const opener =
      focused instanceof HTMLElement && focused !== document.body
        ? focused
        : null;
    const returnTarget =
      view === "review"
        ? ".attempt-finished .text-button"
        : view === "ai"
          ? "#approach-notes"
          : ".practice-launch";
    element?.showModal();
    return () => {
      if (element?.open) element.close();
      // React can remove a dialog before its passive cleanup; native close()
      // cannot restore focus then. Wait until removal, and ignore StrictMode's
      // cleanup rehearsal while this same dialog remains mounted.
      requestAnimationFrame(() => {
        if (element?.isConnected || document.querySelector("dialog[open]"))
          return;
        // Keep a deliberate focus change made after dismissal (for example,
        // clicking back into Monaco before this animation frame runs).
        const current = document.activeElement;
        if (
          current instanceof HTMLElement &&
          current !== document.body &&
          current.isConnected &&
          !element?.contains(current)
        )
          return;
        const target =
          opener?.isConnected && !opener.matches(":disabled")
            ? opener
            : (document.querySelector<HTMLElement>(returnTarget) ??
              document.querySelector<HTMLElement>(".practice-launch"));
        if (target?.isConnected && !target.matches(":disabled")) {
          target.focus({ preventScroll: true });
        }
      });
    };
  }, []);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [view]);
  useEffect(() => {
    if (topics.length && !topics.some((topic) => topic.id === topicId))
      setTopicId(topics[0].id);
  }, [topics, topicId]);
  useEffect(() => {
    if (view !== "ai") return;
    const controller = new AbortController();
    setConfigLoading(true);
    setConfigError("");
    void fetch("/api/localpad/connection", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Connection settings are unavailable.");
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("config" in data) ||
          !data.config ||
          typeof data.config !== "object" ||
          !("mcpServers" in data.config)
        ) {
          throw new Error("Connection settings could not be read.");
        }
        if (!controller.signal.aborted)
          setConfig(JSON.stringify(data.config, null, 2));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setConfig("");
          setConfigError(
            `${error instanceof Error ? error.message : "Connection settings are unavailable."} Keep the local server running, then retry.`,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setConfigLoading(false);
      });
    return () => controller.abort();
  }, [view, configRetry]);

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(config);
      setCopyMessage("Configuration copied.");
    } catch {
      configField.current?.focus();
      configField.current?.select();
      setCopyMessage(
        "Copy is unavailable. The configuration is selected; press Ctrl+C or Cmd+C.",
      );
    }
  }

  function requestQuestion() {
    onRequestQuestion(selectedTopic, selectedLevel, mode);
    onView("ai");
  }

  const preparationFeedback = (
    <>
      {preparing && (
        <div className="preparation-status" role="status">
          <LoaderCircle size={16} className="spin" />
          <div>
            <strong>Checking the practice question…</strong>
            <p>
              Running the reference solution and baseline tests. Your timer has
              not started.
            </p>
          </div>
          <button className="text-button" onClick={onCancelPreparation}>
            Cancel
          </button>
        </div>
      )}
      {preparationError && (
        <div
          className="learning-error preparation-error"
          role="alert"
          tabIndex={view === "setup" ? 0 : undefined}
        >
          <strong>Could not prepare this question</strong>
          <p>{preparationError}</p>
          <p>
            Choose another variation or ask your assistant to revise the
            question and tests.
          </p>
        </div>
      )}
    </>
  );

  return (
    <dialog
      className={`learning-dialog${view === "setup" ? " practice-setup-dialog" : ""}`}
      ref={dialog}
      aria-labelledby="learning-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="learning-hub-frame">
        <header className="dialog-heading learning-hub-heading">
          <div className="practice-heading-identity">
            <TracepadMark size={32} />
            <div>
              <h2 id="learning-title">Interview practice</h2>
              <p>Understand it. Build it. Explain it.</p>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close interview practice"
          >
            <X size={18} />
          </button>
        </header>
        <nav
          className="learning-tabs"
          role="tablist"
          aria-label="Interview practice"
          onKeyDown={(event) => {
            const current = tabs.findIndex((tab) => tab.id === navView);
            const next =
              event.key === "ArrowRight"
                ? (current + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (current + tabs.length - 1) % tabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              onView(tabs[next].id);
              event.currentTarget
                .querySelectorAll<HTMLButtonElement>("button")
                [next]?.focus();
            }
          }}
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`learning-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={navView === id}
              aria-controls={`learning-content-${id}`}
              tabIndex={navView === id ? 0 : -1}
              className={navView === id ? "active" : ""}
              onClick={() => onView(id)}
            >
              <Icon size={15} />
              {label}
              {id === "ai" && incoming.length > 0 && (
                <span className="tab-count">{incoming.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div
          className="learning-hub-content"
          ref={content}
          role="tabpanel"
          id={`learning-content-${navView}`}
          aria-labelledby={`learning-tab-${navView}`}
          tabIndex={0}
        >
          {view === "setup" && (
            <div className="learning-setup">
              {visibleDue.length > 0 && (
                <section className="srs-due-section">
                  <div className="hub-section-heading">
                    <h3>
                      <RefreshCw size={15} /> Due for review
                    </h3>
                    <span>
                      {visibleDue.length} topic
                      {visibleDue.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="srs-due-list">
                    {visibleDue.map((record) => {
                      const topic = topics.find(
                        (t) => t.id === record.topicId,
                      )!;
                      const overdueDays = Math.max(
                        0,
                        Math.floor((now - record.nextReview) / 86_400_000),
                      );
                      return (
                        <div className="srs-due-row" key={record.topicId}>
                          <div className="srs-due-info">
                            <strong>{topic.title}</strong>
                            <span>
                              {overdueDays === 0
                                ? "Due today"
                                : `${overdueDays}d overdue`}
                              {" · last score "}
                              {record.lastQuality}/5
                            </span>
                          </div>
                          <button
                            className="secondary-button"
                            aria-label={`Review ${topic.title} now`}
                            disabled={preparing}
                            onClick={() =>
                              onGenerate(
                                record.topicId,
                                record.lastLevel,
                                "drill",
                                record.lastRecommendedMinutes,
                              )
                            }
                          >
                            <RefreshCw size={13} aria-hidden="true" />
                            Review now
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              <fieldset className="practice-mode-choice">
                <legend>How do you want to practice?</legend>
                <label className={mode === "drill" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="practice-mode"
                    value="drill"
                    checked={mode === "drill"}
                    disabled={preparing}
                    onChange={() => setMode("drill")}
                  />
                  <span>
                    <strong>Topic practice</strong>
                    <small>
                      Focus on one concept, with starter code and checks.
                    </small>
                  </span>
                </label>
                <label className={mode === "mock" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="practice-mode"
                    value="mock"
                    checked={mode === "mock"}
                    disabled={preparing}
                    onChange={() => setMode("mock")}
                  />
                  <span>
                    <strong>60-minute mock interview</strong>
                    <small>
                      A blank editor, one integrated problem, and time to
                      explain.
                    </small>
                  </span>
                </label>
              </fieldset>
              {mode === "drill" ? (
                <div className="practice-settings">
                  <label className="practice-topic-field">
                    Topic
                    <select
                      value={topicId}
                      onChange={(event) => setTopicId(event.target.value)}
                      disabled={preparing}
                    >
                      {topics.map((topic) => (
                        <option value={topic.id} key={topic.id}>
                          {topic.title}
                        </option>
                      ))}
                    </select>
                    <small>
                      {
                        topics.find((topic) => topic.id === topicId)
                          ?.description
                      }
                    </small>
                  </label>
                  <label>
                    Challenge
                    <select
                      value={level}
                      onChange={(event) =>
                        setLevel(event.target.value as Level)
                      }
                      disabled={preparing}
                    >
                      <option value="foundation">Foundation</option>
                      <option value="applied">Applied</option>
                    </select>
                  </label>
                  <label>
                    Time limit
                    <select
                      value={minutes}
                      onChange={(event) =>
                        setMinutes(Number(event.target.value))
                      }
                      disabled={preparing}
                    >
                      <option value={15}>15 minutes</option>
                      <option value={20}>20 minutes</option>
                    </select>
                  </label>
                  <p className="learning-help practice-setting-help">
                    {level === "foundation"
                      ? "Work through a focused contract and build confidence with the basics."
                      : "Handle additional requirements, object interactions, and edge cases."}
                  </p>
                </div>
              ) : (
                <div className="mock-outline">
                  <h3>Work through a problem from scratch</h3>
                  <p>
                    A practical composition task brings together Python
                    fundamentals, classes, testing, and your explanation.
                    Suggestions stay off. Mark your stages, explain your
                    reasoning aloud, and write your own tests. The local script
                    adds a follow-up at 40 minutes; original baseline checks run
                    on submission.
                  </p>
                  <ol className="mock-checkpoints">
                    {INTERVIEW_PHASES.map((phase) => (
                      <li key={phase.id}>
                        <span>
                          {phase.fromMinute}–{phase.toMinute} min
                        </span>
                        {phase.title}
                      </li>
                    ))}
                  </ol>
                  <p className="learning-help">
                    The timer cannot pause or reset. Hints are optional and
                    recorded; stage timing includes time away. Your debrief
                    keeps your code, scratchpad, help, and requirement changes.
                    You can continue into overtime. AI participation requires an
                    external MCP-connected assistant.
                  </p>
                </div>
              )}
              <p className="learning-help">
                Start uses an offline question template with varied
                requirements.
              </p>
            </div>
          )}

          {view === "history" && (
            <section className="learning-history">
              <div className="hub-section-heading">
                <h3>Your completed attempts</h3>
                <span>{completed.length} saved</span>
              </div>
              {completed.length === 0 ? (
                <div className="learning-empty">
                  <History size={24} />
                  <h4>Your practice record starts here</h4>
                  <p>
                    Finish a timed attempt to save its code, tests, notes, and
                    review.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => onView("setup")}
                  >
                    Choose a practice session
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="attempt-history-list">
                  {completed.map((attempt) => {
                    const summary = attemptSummary(attempt);
                    return (
                      <button
                        className="attempt-history-row"
                        key={attempt.id}
                        onClick={() => onReview(attempt.id)}
                      >
                        <div>
                          <strong>{attempt.question.title}</strong>
                          <span>
                            {attempt.mode === "mock"
                              ? "Mock interview"
                              : "Topic practice"}{" "}
                            · {dateFormat.format(attempt.startedAt)}
                          </span>
                        </div>
                        <div className="attempt-history-evidence">
                          <strong>
                            {Math.floor(summary.elapsedMs / 60_000)}m{" "}
                            {Math.floor(summary.elapsedMs / 1_000) % 60}s
                          </strong>
                          <span>
                            {summary.baseline
                              ? `${summary.baseline.passed}/${summary.baseline.total} baseline${summary.baseline.current ? "" : " · stale"}`
                              : "No baseline run"}{" "}
                            · {summary.hintCount} hints
                          </span>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {view === "review" &&
            (reviewAttempt ? (
              <>
                <button
                  className="text-button back-to-history"
                  onClick={() => onView("history")}
                >
                  Back to attempt history
                </button>
                <AttemptReview
                  attempt={reviewAttempt}
                  onSelfCheck={(patch) => onSelfCheck(reviewAttempt.id, patch)}
                  onRetry={() => onRetry(reviewAttempt)}
                  onRequestReview={() => onRequestReview(reviewAttempt.id)}
                  reviewPending={requests.some(
                    (request) =>
                      request.kind === "review" &&
                      request.attemptId === reviewAttempt.id,
                  )}
                />
              </>
            ) : (
              <div className="learning-empty">
                <h4>This attempt is no longer in your history</h4>
                <p>Open a saved attempt or start a new practice session.</p>
                <button
                  className="secondary-button"
                  onClick={() => onView("history")}
                >
                  View history
                </button>
              </div>
            ))}

          {view === "ai" && (
            <div className="ai-coach-content">
              <section className="ai-connection">
                <div className="hub-section-heading">
                  <h3>
                    <Plug size={17} /> Connect an assistant
                  </h3>
                  <span className={`bridge-state bridge-${bridgeStatus}`}>
                    {bridgeStatus === "ready"
                      ? "Local bridge ready"
                      : bridgeStatus === "connecting"
                        ? "Connecting to local bridge…"
                        : "Local bridge offline"}
                  </span>
                </div>
                <p className="ai-connection-copy">
                  An MCP-capable assistant can read your question, code, notes,
                  and test results, then send questions, hints, and feedback.
                  Tracepad runs the Python; your assistant supplies the
                  coaching.
                </p>
                <p className="assistant-seen">
                  {lastAgentSeenAt === null
                    ? "No assistant activity yet. A ready bridge does not mean an AI is answering."
                    : `Last assistant activity: ${dateFormat.format(lastAgentSeenAt)}.`}
                </p>
                <details
                  className="connection-instructions"
                  open={lastAgentSeenAt === null}
                >
                  <summary>MCP connection settings</summary>
                  <p>
                    Add this configuration to your assistant’s MCP settings.
                    Keep Tracepad and its local server open, then ask the
                    assistant to read your instance and answer your requests.
                  </p>
                  {configLoading ? (
                    <p className="learning-loading" role="status">
                      <LoaderCircle size={15} className="spin" />
                      Loading connection settings…
                    </p>
                  ) : configError ? (
                    <div className="learning-error" role="alert">
                      <p>{configError}</p>
                      <button
                        className="secondary-button"
                        onClick={() => setConfigRetry((value) => value + 1)}
                      >
                        Retry connection settings
                      </button>
                    </div>
                  ) : (
                    <>
                      <label
                        className="config-label"
                        htmlFor="mcp-configuration"
                      >
                        MCP server configuration
                      </label>
                      <textarea
                        ref={configField}
                        id="mcp-configuration"
                        className="mcp-configuration code-input"
                        readOnly
                        value={config}
                        rows={9}
                        spellCheck={false}
                      />
                      <div className="config-actions">
                        <button
                          className="secondary-button"
                          disabled={!config}
                          onClick={() => void copyConfig()}
                        >
                          <Copy size={14} />
                          Copy configuration
                        </button>
                        <span role="status">{copyMessage}</span>
                      </div>
                    </>
                  )}
                </details>
              </section>

              {requests.length > 0 && (
                <section className="ai-pending">
                  <div className="hub-section-heading">
                    <h3>Waiting for your assistant</h3>
                    <span>{requests.length} pending</span>
                  </div>
                  <p className="learning-help">
                    Requests wait here until your connected assistant picks them
                    up. You can continue practicing.
                  </p>
                  {requests.map((request) => (
                    <div className="pending-request" key={request.id}>
                      <div>
                        <strong>
                          {request.kind === "question"
                            ? "New question"
                            : request.kind === "hint"
                              ? "Hint"
                              : "Attempt review"}
                        </strong>
                        <span>
                          {topics.find((topic) => topic.id === request.topicId)
                            ?.title ?? request.topicId}{" "}
                          · {request.mode === "mock" ? "Mock" : "Practice"} ·{" "}
                          {dateFormat.format(request.createdAt)}
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => onCancelRequest(request.id)}
                      >
                        Cancel
                        <span className="sr-only"> {request.kind} request</span>
                      </button>
                    </div>
                  ))}
                </section>
              )}

              {incoming.length > 0 && (
                <section className="incoming-questions">
                  <div className="hub-section-heading">
                    <h3>Questions from your assistant</h3>
                    <span>{incoming.length} to review</span>
                  </div>
                  <p className="learning-help">
                    Review the question, then validate its reference solution
                    against the supplied tests before adding it.
                  </p>
                  {incoming.map((command) => (
                    <article className="incoming-question" key={command.id}>
                      <div className="hub-section-heading">
                        <h4>{command.question.title}</h4>
                        <span>
                          AI · {command.question.provenance.generator}
                        </span>
                      </div>
                      <p className="question-preview">
                        {command.question.prompt}
                      </p>
                      <div className="question-package-meta">
                        <span>
                          {command.question.level === "foundation"
                            ? "Foundation"
                            : "Applied"}
                        </span>
                        <span>
                          {command.question.baselineTests.length} baseline tests
                        </span>
                        <span>
                          {command.question.recommendedMinutes} minutes
                        </span>
                      </div>
                      <details>
                        <summary>Inspect starter code and test cases</summary>
                        <pre>
                          {command.question.starterCode || "Blank editor"}
                        </pre>
                        {command.question.baselineTests.map((test) => (
                          <div key={test.id}>
                            <strong>{test.name}</strong>
                            <pre>{test.code}</pre>
                          </div>
                        ))}
                      </details>
                      <div className="incoming-actions">
                        <button
                          className="primary-button"
                          disabled={preparing}
                          onClick={() => onAcceptQuestion(command)}
                        >
                          <Check size={14} />
                          Validate & add
                        </button>
                        <button
                          className="secondary-button"
                          disabled={preparing}
                          onClick={() => onDismissCommand(command.id)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              )}

              <section className="accepted-questions">
                <div className="hub-section-heading">
                  <h3>Your AI question library</h3>
                  <button
                    className="text-button"
                    onClick={() => onView("setup")}
                  >
                    Request a question
                    <ChevronRight size={14} />
                  </button>
                </div>
                {acceptedQuestions.length === 0 ? (
                  <p className="learning-help">
                    Validated questions will appear here. Choose a topic in
                    Practice and request a question from your assistant.
                  </p>
                ) : (
                  [...acceptedQuestions].reverse().map((question) => (
                    <div className="accepted-question" key={question.id}>
                      <div>
                        <strong>{question.title}</strong>
                        <span>
                          {topics.find((topic) => topic.id === question.topicId)
                            ?.title ?? question.topicId}{" "}
                          ·{" "}
                          {question.level === "foundation"
                            ? "Foundation"
                            : "Applied"}
                        </span>
                      </div>
                      <div className="accepted-question-actions">
                        <button
                          className="secondary-button"
                          disabled={preparing}
                          onClick={() => onStartQuestion(question, "drill")}
                        >
                          Start practice
                          <ArrowRight size={14} />
                        </button>
                        <button
                          className="secondary-button"
                          disabled={preparing}
                          onClick={() => onStartQuestion(question, "mock")}
                        >
                          <Clock3 size={14} />
                          Start 60-minute mock
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>
          )}

          {view !== "setup" && preparationFeedback}
        </div>
        {view === "setup" && (
          <footer
            className={`practice-setup-footer${preparing ? " is-preparing" : ""}`}
            aria-label="Start practice"
          >
            {preparationFeedback}
            <div className="practice-setup-actions">
              <div className="practice-start-option">
                <button
                  className="primary-button"
                  aria-describedby="practice-start-help"
                  disabled={preparing || !selectedTopic}
                  onClick={() =>
                    onGenerate(
                      selectedTopic,
                      selectedLevel,
                      mode,
                      selectedMinutes,
                    )
                  }
                >
                  <Clock3 size={15} />
                  {mode === "mock"
                    ? "Start 60-minute mock"
                    : `Start ${minutes}-minute practice`}
                  <ArrowRight size={15} />
                </button>
                <p id="practice-start-help">
                  Your timer begins after the question is ready.
                </p>
              </div>
              <div className="practice-ai-option">
                <button
                  className="secondary-button"
                  aria-describedby="practice-ai-help"
                  disabled={preparing || !selectedTopic || duplicateRequest}
                  onClick={requestQuestion}
                >
                  <Sparkles size={14} />
                  {duplicateRequest
                    ? "AI question requested"
                    : "Request an AI question"}
                </button>
                <p id="practice-ai-help">
                  Requires an external MCP-connected assistant.{" "}
                  {lastAgentSeenAt === null
                    ? "No assistant activity yet."
                    : `Last activity: ${dateFormat.format(lastAgentSeenAt)}.`}{" "}
                  <button
                    className="text-button practice-connection-link"
                    disabled={preparing}
                    onClick={() => {
                      onView("ai");
                      requestAnimationFrame(() =>
                        document.getElementById("learning-tab-ai")?.focus(),
                      );
                    }}
                  >
                    Connection settings
                  </button>
                </p>
              </div>
            </div>
          </footer>
        )}
      </div>
    </dialog>
  );
}

export default LearningHub;
