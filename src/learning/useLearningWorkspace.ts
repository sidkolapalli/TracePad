import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WorkspaceProject } from "../projects/types";
import type { Dispatch, SetStateAction } from "react";
import type { Draft, Exercise, SessionState } from "../types";
import { builtInExercises, sandboxExercise } from "../exercises";
import {
  getDraft,
  pauseTimer,
  resetTimer,
  startTimer,
  timerRemaining,
} from "../session";
import { PythonRunner } from "../runner";
import { topics, generateQuestion } from "./curriculum";
import {
  appendRun,
  appendRequirement,
  acknowledgeRequirement as markRequirementAcknowledged,
  createAttempt,
  finishAttempt,
  loadLearning,
  saveLearning,
} from "./state";
import { getInstanceId, usePracticeBridge } from "./bridge";
import { validateQuestion } from "./validation";
import { boundSnapshot } from "./snapshot";
import { moveInterviewPhase, scriptedFollowup } from "./journey";
import type { InterviewPhase } from "./types";
import type {
  Attempt,
  BridgeCommand,
  Level,
  PracticeMode,
  PracticeSnapshot,
  QuestionPackage,
  RunEvidence,
} from "./types";

export function attemptExercise(attempt: Attempt): Exercise {
  const q = attempt.question;
  return {
    id: `attempt-${attempt.id}`,
    title: q.title,
    topic: topics.find((t) => t.id === q.topicId)?.title ?? q.topicId,
    description: q.prompt,
    difficulty: q.level === "foundation" ? "Easy" : "Medium",
    examples: q.examples,
    constraints: q.constraints,
    starterCode: attempt.mode === "mock" ? "" : q.starterCode,
    tests: [],
  };
}

export function useLearningWorkspace(
  session: SessionState,
  setSession: Dispatch<SetStateAction<SessionState>>,
  now: number,
  stopRun: () => void,
  project?: WorkspaceProject,
) {
  const [initial] = useState(() =>
    project
      ? { state: project.initial.learning, warning: undefined }
      : loadLearning(),
  );
  const [state, setState] = useState(initial.state);
  const [saveWarning, setSaveWarning] = useState(initial.warning ?? "");
  const [view, setView] = useState<
    "setup" | "history" | "ai" | "review" | null
  >(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [requests, setRequests] = useState<PracticeSnapshot["requests"]>([]);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState("");
  const [instanceId] = useState(getInstanceId);
  const validator = useRef<PythonRunner | null>(null);
  const preparationLock = useRef(false);
  const attempts = state.attempts;
  const exercises = [
    sandboxExercise,
    ...builtInExercises,
    ...session.customExercises,
    ...attempts.map(attemptExercise),
  ];
  const exercise =
    exercises.find((e) => e.id === session.activeId) ?? builtInExercises[0];
  const currentAttempt =
    attempts.find((a) => `attempt-${a.id}` === exercise.id) ?? null;
  const draft =
    session.drafts[exercise.id] ??
    (currentAttempt
      ? {
          source: currentAttempt.source,
          files: currentAttempt.files,
          activeFile: currentAttempt.activeFile,
          scratchpad: currentAttempt.scratchpad,
          stdin: currentAttempt.stdin,
          tests: currentAttempt.scratchTests,
        }
      : getDraft(session, exercise));
  const active =
    currentAttempt && currentAttempt.finishedAt === null
      ? currentAttempt
      : null;
  const latest = useRef({ state, session, draft, active });
  latest.current = { state, session, draft, active };

  // Deadline-based release catches up after background tabs or refreshes.
  useEffect(() => {
    if (!active || project?.suspended) return;
    setState((current) => {
      let changed = false;
      const attempts = current.attempts.map((attempt) => {
        if (attempt.id !== active.id) return attempt;
        const next = scriptedFollowup(attempt, now);
        changed ||= next !== attempt;
        return next;
      });
      return changed ? { ...current, attempts } : current;
    });
  }, [active?.id, active?.liveInterviewer, now, project?.suspended]);

  useLayoutEffect(() => {
    project?.onLearning(state);
  }, [state, project?.onLearning]);

  useEffect(() => {
    if (project) return;
    if (initial.warning && state === initial.state) return;
    const id = setTimeout(() => setSaveWarning(saveLearning(state) ?? ""), 250);
    const persist = () => {
      const warning = saveLearning(state);
      if (warning) setSaveWarning(warning);
    };
    window.addEventListener("pagehide", persist);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pagehide", persist);
    };
  }, [state, initial]);
  useEffect(() => () => validator.current?.destroy(), []);

  // Snapshots omit reference solutions and bound retained evidence for the local bridge.
  const truncatedFields: string[] = [];
  const sanitize = (
    a: Attempt,
    runCount: number,
  ): NonNullable<PracticeSnapshot["activeAttempt"]> => {
    const { referenceSolution: _reference, ...question } = a.question;
    if (a.runs.length > runCount) truncatedFields.push(`${a.id}.runs`);
    return {
      ...a,
      question,
      runs: a.runs.slice(-runCount),
    };
  };
  const snapshot: PracticeSnapshot = {
    schemaVersion: 1,
    instanceId,
    project: project
      ? { id: project.project.id, name: project.project.name }
      : undefined,
    updatedAt: now,
    app: "localpad",
    activeExercise: {
      id: exercise.id,
      title: exercise.title,
      prompt: exercise.description,
      topic: exercise.topic,
    },
    source: draft.source,
    files: draft.files,
    activeFile: draft.activeFile,
    scratchpad: draft.scratchpad,
    stdin: draft.stdin,
    notes: currentAttempt?.notes ?? "",
    timer: {
      remainingMs: timerRemaining(session.timer, now),
      running: session.timer.deadline !== null,
    },
    activeAttempt: currentAttempt ? sanitize(currentAttempt, 5) : null,
    recentAttempts: attempts
      .filter(
        (a) =>
          a.finishedAt !== null &&
          a.id !== currentAttempt?.id &&
          a.id !== reviewId,
      )
      .slice(-4)
      .concat(
        attempts.filter(
          (a) => a.id === reviewId && a.id !== currentAttempt?.id,
        ),
      )
      .map((a) => sanitize(a, 3)),
    history: attempts.slice(-30).map((a) => ({
      id: a.id,
      title: a.question.title,
      topicId: a.question.topicId,
      mode: a.mode,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      hintCount: a.hintsUsed.length,
    })),
    requests,
    truncatedFields: truncatedFields.slice(0, 100),
  };
  const bridge = usePracticeBridge(
    boundSnapshot(snapshot),
    state.processedCommandIds,
    project?.suspended === true,
  );
  const ack = (id: string) =>
    setState((s) => ({
      ...s,
      processedCommandIds: [...s.processedCommandIds, id].slice(-100),
    }));
  useEffect(() => {
    if (project?.suspended) return;
    for (const command of bridge.commands) {
      if (project && command.projectId !== project.project.id) continue;
      if (
        state.processedCommandIds.includes(command.id) ||
        command.type === "question"
      )
        continue;
      if (command.type === "hint") {
        const requested = requests.some(
          (r) =>
            r.id === command.requestId &&
            r.kind === "hint" &&
            r.attemptId === command.attemptId,
        );
        if (requested && active?.id === command.attemptId)
          setState((s) => ({
            ...s,
            attempts: s.attempts.map((a) =>
              a.id === command.attemptId && a.finishedAt === null
                ? {
                    ...a,
                    hintsUsed: [
                      ...a.hintsUsed,
                      {
                        text: command.text,
                        at: Date.now(),
                        source: "ai" as const,
                      },
                    ],
                  }
                : a,
            ),
          }));
      } else if (command.type === "requirement") {
        if (active?.id === command.attemptId)
          setState((s) => ({
            ...s,
            attempts: s.attempts.map((a) =>
              a.id === command.attemptId
                ? appendRequirement(a, command.update)
                : a,
            ),
          }));
      } else {
        setState((s) => ({
          ...s,
          attempts: s.attempts.map((a) =>
            a.id === command.feedback.attemptId &&
            a.finishedAt !== null &&
            !a.feedback.some((f) => f.id === command.feedback.id)
              ? { ...a, feedback: [...a.feedback, command.feedback].slice(-20) }
              : a,
          ),
        }));
      }
      if ("requestId" in command && command.requestId)
        setRequests((rs) => rs.filter((r) => r.id !== command.requestId));
      ack(command.id);
    }
  }, [
    bridge.commands,
    state.processedCommandIds,
    requests,
    active?.id,
    project?.suspended,
  ]);

  function updateAttempt(id: string, update: (a: Attempt) => Attempt) {
    setState((s) => ({
      ...s,
      attempts: s.attempts.map((a) => (a.id === id ? update(a) : a)),
    }));
  }
  function syncDraft(patch: Partial<Draft>) {
    if (!active) return;
    updateAttempt(active.id, (a) =>
      a.finishedAt !== null
        ? a
        : {
            ...a,
            ...(patch.source !== undefined ? { source: patch.source } : {}),
            ...(patch.files !== undefined
              ? { files: structuredClone(patch.files) }
              : {}),
            ...(patch.activeFile !== undefined
              ? { activeFile: patch.activeFile }
              : {}),
            ...(patch.scratchpad !== undefined
              ? { scratchpad: structuredClone(patch.scratchpad) }
              : {}),
            ...(patch.stdin !== undefined ? { stdin: patch.stdin } : {}),
            ...(patch.tests ? { scratchTests: patch.tests } : {}),
          },
    );
  }
  function review(id: string) {
    setReviewId(id);
    setView("review");
  }
  function recordRun(attemptId: string, evidence: RunEvidence, finish = false) {
    updateAttempt(attemptId, (a) => {
      if (a.finishedAt !== null) return a;
      const recorded = appendRun(a, evidence);
      return finish
        ? finishAttempt(
            {
              ...recorded,
              files: structuredClone(evidence.files ?? {}),
              activeFile: evidence.activeFile ?? "main.py",
            },
            evidence.source,
            evidence.stdin,
          )
        : recorded;
    });
    if (finish && latest.current.active?.id === attemptId) {
      setSession((s) => ({ ...s, timer: pauseTimer(s.timer) }));
      review(attemptId);
    }
  }
  function beforeSwitch(): boolean {
    const { active: a, draft: d } = latest.current;
    if (!a) {
      stopRun();
      return true;
    }
    if (
      !window.confirm(
        "Finish this attempt and save your current work before switching? Baseline checks will be marked as not run unless you checked them already.",
      )
    )
      return false;
    stopRun();
    updateAttempt(a.id, (x) =>
      finishAttempt(
        {
          ...x,
          files: structuredClone(d.files ?? {}),
          activeFile: d.activeFile ?? "main.py",
          ...(d.scratchpad === undefined
            ? {}
            : { scratchpad: structuredClone(d.scratchpad) }),
        },
        d.source,
        d.stdin,
      ),
    );
    setSession((s) => ({ ...s, timer: pauseTimer(s.timer) }));
    return true;
  }
  function startQuestion(
    question: QuestionPackage,
    mode: PracticeMode,
    minutes = question.recommendedMinutes,
  ) {
    if (!beforeSwitch()) return;
    const attempt = createAttempt(
      question,
      mode,
      mode === "mock" ? 60 : minutes,
    );
    const id = `attempt-${attempt.id}`;
    setState((s) => ({
      ...s,
      activeAttemptId: attempt.id,
      attempts: [...s.attempts, attempt].slice(-30),
    }));
    setSession((s) => ({
      ...s,
      activeId: id,
      drafts: {
        ...s.drafts,
        [id]: {
          source: attempt.source,
          files: {},
          activeFile: "main.py",
          stdin: "",
          tests: [],
        },
      },
      timer: startTimer(resetTimer(s.timer, attempt.durationMs)),
    }));
    setView(null);
    setPreparationError("");
  }
  async function prepare(question: QuestionPackage, done: () => void) {
    if (preparationLock.current) return;
    preparationLock.current = true;
    setPreparing(true);
    setPreparationError("");
    validator.current = new PythonRunner();
    try {
      await validateQuestion(question, validator.current);
      done();
    } catch (e) {
      setPreparationError(
        e instanceof Error ? e.message : "Question validation failed.",
      );
    } finally {
      preparationLock.current = false;
      setPreparing(false);
    }
  }
  function generate(
    topicId: string,
    level: Level,
    mode: PracticeMode,
    minutes: number,
  ) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const question = generateQuestion(topicId, level, seed, mode);
    void prepare(question, () => startQuestion(question, mode, minutes));
  }
  function requestQuestion(topicId: string, level: Level, mode: PracticeMode) {
    setRequests((rs) =>
      [
        ...rs.filter((r) => r.kind !== "question"),
        {
          id: crypto.randomUUID(),
          kind: "question" as const,
          topicId: mode === "mock" ? "python.oop.composition" : topicId,
          level,
          mode,
          instructions:
            mode === "mock"
              ? "Generate an integrated 60-minute Python OOP interview: explicit contracts, blank starter, composition and edge cases."
              : "Generate a new focused practice problem at this level. Include explicit contracts, named assertions, progressive hints, and a reference solution.",
          createdAt: Date.now(),
        },
      ].slice(-30),
    );
    setView("ai");
  }
  function requestHelp(kind: "hint" | "review", id: string) {
    const a = attempts.find((x) => x.id === id);
    if (!a || (kind === "hint" && a.finishedAt !== null)) return;
    setRequests((rs) =>
      [
        ...rs.filter((r) => !(r.kind === kind && r.attemptId === id)),
        {
          id: crypto.randomUUID(),
          kind,
          topicId: a.question.topicId,
          level: a.question.level,
          mode: a.mode,
          attemptId: id,
          instructions:
            kind === "hint"
              ? "Give one small nudge based on the current code and notes. Do not provide the solution."
              : "Review the submitted code, notes and available execution evidence. Distinguish observed facts from self-reported communication. Cite run IDs and suggest the next practice.",
          createdAt: Date.now(),
        },
      ].slice(-30),
    );
    if (kind === "hint" && a.mode !== "mock") setView("ai");
  }
  function acceptQuestion(command: BridgeCommand) {
    if (command.type !== "question") return;
    void prepare(command.question, () => {
      setState((s) => ({
        ...s,
        acceptedQuestions: [
          ...s.acceptedQuestions.filter((q) => q.id !== command.question.id),
          command.question,
        ].slice(-20),
        processedCommandIds: [...s.processedCommandIds, command.id].slice(-100),
      }));
      setRequests((rs) => rs.filter((r) => r.id !== command.requestId));
    });
  }
  function pauseEvent() {
    if (active)
      updateAttempt(active.id, (a) => ({
        ...a,
        pauseEvents: [
          ...a.pauseEvents,
          {
            at: Date.now(),
            action: session.timer.deadline === null ? "resume" : "pause",
          },
        ],
      }));
  }
  function setLiveInterviewer(enabled: boolean) {
    if (!active || active.mode !== "mock") return;
    updateAttempt(active.id, (a) =>
      a.finishedAt === null && a.mode === "mock"
        ? { ...a, liveInterviewer: enabled }
        : a,
    );
  }
  function acknowledgeRequirement(id: string) {
    if (currentAttempt)
      updateAttempt(currentAttempt.id, (a) =>
        markRequirementAcknowledged(a, id),
      );
  }
  const requirementUpdates = currentAttempt?.requirementUpdates ?? [];
  return {
    exercise,
    exercises,
    draft,
    currentAttempt,
    active,
    view,
    setView,
    saveWarning,
    preparing,
    cancelPreparation: () => validator.current?.stop(),
    preparationError,
    syncDraft,
    recordRun,
    beforeSwitch,
    pauseEvent,
    review,
    bridgeStatus: bridge.status,
    lastAgentSeenAt: bridge.lastAgentSeenAt,
    requirementUpdates,
    pendingRequirements: requirementUpdates.filter(
      (update) => update.acknowledgedAt === undefined,
    ),
    setLiveInterviewer,
    acknowledgeRequirement,
    panelProps: currentAttempt
      ? {
          attempt: currentAttempt,
          now,
          hintPending: requests.some(
            (r) => r.kind === "hint" && r.attemptId === currentAttempt.id,
          ),
          onNotes: (notes: string) =>
            updateAttempt(currentAttempt.id, (a) =>
              a.finishedAt === null ? { ...a, notes } : a,
            ),
          onPhase: (phase: InterviewPhase) =>
            updateAttempt(currentAttempt.id, (a) =>
              moveInterviewPhase(a, phase),
            ),
          onJourneyNotes: (
            field: "clarifications" | "followupResponse",
            value: string,
          ) =>
            updateAttempt(currentAttempt.id, (a) => {
              if (a.finishedAt !== null || a.mode !== "mock") return a;
              const initialized = a.interviewJourney
                ? a
                : moveInterviewPhase(a, "clarify");
              return initialized.interviewJourney
                ? {
                    ...initialized,
                    interviewJourney: {
                      ...initialized.interviewJourney,
                      [field]: value.slice(0, 6000),
                    },
                  }
                : initialized;
            }),
          onRevealFollowup: () =>
            updateAttempt(currentAttempt.id, (a) =>
              scriptedFollowup(a, Date.now(), true),
            ),
          onCancelHint: () =>
            setRequests((rs) =>
              rs.filter(
                (r) =>
                  !(r.kind === "hint" && r.attemptId === currentAttempt.id),
              ),
            ),
          onHint: () =>
            updateAttempt(currentAttempt.id, (a) => {
              if (a.finishedAt !== null) return a;
              const text =
                a.question.hints[
                  a.hintsUsed.filter((h) => h.source === "local").length
                ];
              return text
                ? {
                    ...a,
                    hintsUsed: [
                      ...a.hintsUsed,
                      { text, at: Date.now(), source: "local" },
                    ],
                  }
                : a;
            }),
          onAIHint: () => requestHelp("hint", currentAttempt.id),
          onReview: () => review(currentAttempt.id),
        }
      : null,
    hubProps: {
      topics,
      attempts,
      acceptedQuestions: state.acceptedQuestions,
      reviewAttempt: attempts.find((a) => a.id === reviewId) ?? null,
      onReview: review,
      onSelfCheck: (id: string, patch: Partial<Attempt["selfCheck"]>) =>
        updateAttempt(id, (a) => ({
          ...a,
          selfCheck: { ...a.selfCheck, ...patch },
        })),
      onRetry: (a: Attempt) =>
        generate(
          a.question.topicId,
          a.question.level,
          a.mode,
          a.durationMs / 60000,
        ),
      onRequestReview: (id: string) => requestHelp("review", id),
      requests,
      onCancelRequest: (id: string) =>
        setRequests((rs) => rs.filter((r) => r.id !== id)),
      onGenerate: generate,
      onRequestQuestion: requestQuestion,
      onStartQuestion: (q: QuestionPackage, m: PracticeMode) =>
        startQuestion(q, m),
      commands: bridge.commands.filter(
        (c) =>
          !state.processedCommandIds.includes(c.id) &&
          (!project || c.projectId === project.project.id),
      ),
      onAcceptQuestion: acceptQuestion,
      onDismissCommand: ack,
      bridgeStatus: bridge.status,
      lastAgentSeenAt: bridge.lastAgentSeenAt,
      preparing,
      preparationError,
      onCancelPreparation: () => validator.current?.stop(),
    },
  };
}
