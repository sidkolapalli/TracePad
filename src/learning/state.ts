import type { PracticeCase, RunStatus, TestResult } from "../types";
import { MAX_MODULE_FILES, validateFilePath } from "../files";
import { isScratchpad } from "../scratchpad/model";
import { initialInterviewJourney, isInterviewJourney } from "./journey";
import type {
  Attempt,
  CoachingFeedback,
  LearningState,
  PracticeMode,
  QuestionPackage,
  RequirementUpdate,
  RunEvidence,
} from "./types";

export const LEARNING_KEY = "localpad.learning.v1";
const MAX_ATTEMPTS = 30;
const MAX_QUESTIONS = 20;
const MAX_COMMANDS = 100;
const MAX_RUNS = 20;
const MAX_OUTPUT = 8_000;
const MAX_ERROR = 2_000;
const statuses: RunStatus[] = [
  "idle",
  "loading",
  "running",
  "completed",
  "failed",
  "stopped",
  "timed-out",
  "output-limit",
];

export function defaultLearning(): LearningState {
  return {
    schemaVersion: 1,
    activeAttemptId: null,
    attempts: [],
    acceptedQuestions: [],
    processedCommandIds: [],
    srsCheckpoint: {},
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const string = (value: unknown): value is string => typeof value === "string";
const id = (value: unknown): value is string =>
  string(value) && value.length > 0;
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number =>
  number(value) && value >= 0;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(string);
function uniqueIds<T extends { id: string }>(items: T[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}
function isCase(value: unknown): value is PracticeCase {
  return (
    record(value) && id(value.id) && string(value.name) && string(value.code)
  );
}
function isCases(value: unknown): value is PracticeCase[] {
  return Array.isArray(value) && value.every(isCase) && uniqueIds(value);
}
function isFiles(value: unknown): value is Record<string, string> {
  return (
    record(value) &&
    Object.keys(value).length <= MAX_MODULE_FILES &&
    Object.entries(value).every(
      ([name, code]) => validateFilePath(name) === null && string(code),
    )
  );
}
function isRequirement(value: unknown): value is RequirementUpdate {
  return (
    record(value) &&
    id(value.id) &&
    id(value.title) &&
    id(value.description) &&
    id(value.author) &&
    nonnegative(value.createdAt) &&
    value.createdAt <= 8_640_000_000_000_000 &&
    (value.acknowledgedAt === undefined || nonnegative(value.acknowledgedAt))
  );
}
function sameFiles(
  a: Record<string, string> = {},
  b: Record<string, string> = {},
): boolean {
  const names = Object.keys(a);
  return (
    names.length === Object.keys(b).length &&
    names.every((name) => Object.hasOwn(b, name) && a[name] === b[name])
  );
}
function isQuestion(value: unknown): value is QuestionPackage {
  return (
    record(value) &&
    value.schemaVersion === 1 &&
    id(value.id) &&
    id(value.topicId) &&
    (value.level === "foundation" || value.level === "applied") &&
    string(value.title) &&
    string(value.prompt) &&
    string(value.starterCode) &&
    Array.isArray(value.examples) &&
    value.examples.every(
      (example) =>
        record(example) &&
        string(example.input) &&
        string(example.output) &&
        (example.explanation === undefined || string(example.explanation)),
    ) &&
    strings(value.constraints) &&
    isCases(value.baselineTests) &&
    strings(value.hints) &&
    string(value.referenceSolution) &&
    strings(value.learningObjectives) &&
    number(value.recommendedMinutes) &&
    value.recommendedMinutes > 0 &&
    record(value.provenance) &&
    (value.provenance.kind === "local-template" ||
      value.provenance.kind === "ai") &&
    id(value.provenance.generator) &&
    (value.provenance.templateId === undefined ||
      string(value.provenance.templateId)) &&
    (value.provenance.seed === undefined || number(value.provenance.seed))
  );
}
function isResult(value: unknown): value is TestResult {
  return (
    record(value) &&
    id(value.id) &&
    string(value.name) &&
    typeof value.passed === "boolean" &&
    nonnegative(value.elapsedMs) &&
    (value.error === undefined || string(value.error))
  );
}
function isRun(value: unknown): value is RunEvidence {
  return (
    record(value) &&
    id(value.id) &&
    nonnegative(value.at) &&
    ["run", "scratch", "baseline"].includes(value.kind as string) &&
    string(value.source) &&
    (value.files === undefined || isFiles(value.files)) &&
    (value.activeFile === undefined || id(value.activeFile)) &&
    string(value.stdin) &&
    isCases(value.tests) &&
    Array.isArray(value.results) &&
    value.results.every(isResult) &&
    uniqueIds(value.results) &&
    statuses.includes(value.status as RunStatus) &&
    nonnegative(value.elapsedMs) &&
    string(value.output) &&
    (value.message === undefined || string(value.message))
  );
}
function isFeedback(value: unknown): value is CoachingFeedback {
  return (
    record(value) &&
    id(value.id) &&
    id(value.attemptId) &&
    string(value.reviewer) &&
    nonnegative(value.createdAt) &&
    string(value.summary) &&
    strings(value.strengths) &&
    strings(value.improvements) &&
    string(value.nextPractice) &&
    strings(value.evidenceRunIds)
  );
}
function isAttempt(value: unknown): value is Attempt {
  return (
    record(value) &&
    id(value.id) &&
    isQuestion(value.question) &&
    (value.mode === "drill" || value.mode === "mock") &&
    number(value.durationMs) &&
    value.durationMs > 0 &&
    nonnegative(value.startedAt) &&
    (value.finishedAt === null ||
      (number(value.finishedAt) && value.finishedAt >= value.startedAt)) &&
    number(value.deadline) &&
    value.deadline >= value.startedAt &&
    string(value.source) &&
    (value.files === undefined || isFiles(value.files)) &&
    (value.activeFile === undefined || id(value.activeFile)) &&
    (value.liveInterviewer === undefined ||
      typeof value.liveInterviewer === "boolean") &&
    (value.scratchpad === undefined || isScratchpad(value.scratchpad)) &&
    (value.interviewJourney === undefined ||
      (value.mode === "mock" &&
        isInterviewJourney(value.interviewJourney) &&
        value.interviewJourney.transitions.every(
          (transition) =>
            transition.at >= Number(value.startedAt) &&
            (value.finishedAt === null ||
              transition.at <= Number(value.finishedAt)),
        ))) &&
    (value.requirementUpdates === undefined ||
      (Array.isArray(value.requirementUpdates) &&
        value.requirementUpdates.every(isRequirement) &&
        uniqueIds(value.requirementUpdates))) &&
    string(value.stdin) &&
    isCases(value.scratchTests) &&
    string(value.notes) &&
    Array.isArray(value.hintsUsed) &&
    value.hintsUsed.every(
      (hint) =>
        record(hint) &&
        string(hint.text) &&
        nonnegative(hint.at) &&
        (hint.source === "local" || hint.source === "ai"),
    ) &&
    Array.isArray(value.pauseEvents) &&
    value.pauseEvents.every(
      (pause) =>
        record(pause) &&
        nonnegative(pause.at) &&
        (pause.action === "pause" || pause.action === "resume"),
    ) &&
    Array.isArray(value.runs) &&
    value.runs.every(isRun) &&
    uniqueIds(value.runs) &&
    record(value.selfCheck) &&
    typeof value.selfCheck.clarified === "boolean" &&
    typeof value.selfCheck.explained === "boolean" &&
    typeof value.selfCheck.respondedToHints === "boolean" &&
    Array.isArray(value.feedback) &&
    value.feedback.every(
      (feedback) => isFeedback(feedback) && feedback.attemptId === value.id,
    ) &&
    uniqueIds(value.feedback as CoachingFeedback[])
  );
}
function isSRSRecord(value: unknown): boolean {
  return (
    record(value) &&
    id(value.topicId) &&
    nonnegative(value.n) &&
    number(value.ef) &&
    nonnegative(value.intervalDays) &&
    nonnegative(value.nextReview) &&
    nonnegative(value.lastAttemptAt) &&
    nonnegative(value.lastQuality) &&
    (value.lastLevel === "foundation" || value.lastLevel === "applied") &&
    number(value.lastRecommendedMinutes) &&
    (value.lastRecommendedMinutes as number) > 0
  );
}

export function isLearning(value: unknown): value is LearningState {
  return (
    record(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.attempts) &&
    value.attempts.every(isAttempt) &&
    uniqueIds(value.attempts) &&
    (value.activeAttemptId === null ||
      (id(value.activeAttemptId) &&
        value.attempts.some(
          (attempt) => attempt.id === value.activeAttemptId,
        ))) &&
    Array.isArray(value.acceptedQuestions) &&
    value.acceptedQuestions.every(isQuestion) &&
    uniqueIds(value.acceptedQuestions) &&
    strings(value.processedCommandIds) &&
    value.processedCommandIds.every(id) &&
    new Set(value.processedCommandIds).size ===
      value.processedCommandIds.length &&
    (value.srsCheckpoint === undefined ||
      (record(value.srsCheckpoint) &&
        Object.values(value.srsCheckpoint as Record<string, unknown>).every(
          isSRSRecord,
        )))
  );
}

function boundedRun(run: RunEvidence): RunEvidence {
  const copy = structuredClone(run);
  copy.output = copy.output.slice(0, MAX_OUTPUT);
  if (copy.message !== undefined)
    copy.message = copy.message.slice(0, MAX_ERROR);
  copy.results = copy.results.map((result) => ({
    ...result,
    ...(result.error !== undefined
      ? { error: result.error.slice(0, MAX_ERROR) }
      : {}),
  }));
  return copy;
}

/** Keep bounded recent history without evicting an unfinished active attempt. */
function boundedLearning(state: LearningState): LearningState {
  const ordered = [...state.attempts].sort((a, b) => b.startedAt - a.startedAt);
  const keep = new Set(
    ordered.slice(0, MAX_ATTEMPTS).map((attempt) => attempt.id),
  );
  if (state.activeAttemptId && !keep.has(state.activeAttemptId)) {
    const oldestKept = ordered[MAX_ATTEMPTS - 1];
    if (oldestKept) keep.delete(oldestKept.id);
    keep.add(state.activeAttemptId);
  }
  return {
    ...state,
    attempts: state.attempts
      .filter((attempt) => keep.has(attempt.id))
      .map((attempt) => ({
        ...attempt,
        runs: attempt.runs.slice(-MAX_RUNS).map(boundedRun),
      })),
    acceptedQuestions: state.acceptedQuestions.slice(-MAX_QUESTIONS),
    processedCommandIds: state.processedCommandIds.slice(-MAX_COMMANDS),
  };
}

/** An unreadable entry is left untouched; callers control when a new save occurs. */
export function loadLearning(): { state: LearningState; warning?: string } {
  try {
    const raw = localStorage.getItem(LEARNING_KEY);
    if (raw === null) return { state: defaultLearning() };
    const parsed: unknown = JSON.parse(raw);
    if (!isLearning(parsed)) {
      return {
        state: defaultLearning(),
        warning:
          "Saved learning history could not be read. The original saved data has not been changed.",
      };
    }
    return { state: boundedLearning(parsed) };
  } catch {
    return {
      state: defaultLearning(),
      warning:
        "Learning history is unavailable or unreadable. You can keep practicing, but new work may not survive a refresh.",
    };
  }
}

/** Never mutate in-memory work, including when storage is full or inaccessible. */
export function saveLearning(state: LearningState): string | null {
  try {
    if (!isLearning(state)) throw new Error("Invalid learning state");
    localStorage.setItem(LEARNING_KEY, JSON.stringify(boundedLearning(state)));
    return null;
  } catch {
    return "Could not save learning history. Your work is still here; copy important code and notes before closing or refreshing.";
  }
}

export function createAttempt(
  question: QuestionPackage,
  mode: PracticeMode,
  durationMinutes: number,
  now = Date.now(),
): Attempt {
  const durationMs = durationMinutes * 60_000;
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(now) ||
    now < 0 ||
    !Number.isFinite(now + durationMs) ||
    now + durationMs > 8_640_000_000_000_000
  ) {
    throw new RangeError(
      "An attempt needs a positive duration and a valid start time.",
    );
  }
  return {
    id: crypto.randomUUID(),
    question: structuredClone(question),
    mode,
    durationMs,
    startedAt: now,
    finishedAt: null,
    deadline: now + durationMs,
    source: mode === "mock" ? "" : question.starterCode,
    files: {},
    activeFile: "main.py",
    liveInterviewer: false,
    ...(mode === "mock"
      ? { interviewJourney: initialInterviewJourney(now) }
      : {}),
    requirementUpdates: [],
    stdin: "",
    scratchTests: [],
    notes: "",
    hintsUsed: [],
    pauseEvents: [],
    runs: [],
    selfCheck: { clarified: false, explained: false, respondedToHints: false },
    feedback: [],
  };
}

export function appendRun(attempt: Attempt, evidence: RunEvidence): Attempt {
  return {
    ...attempt,
    runs: [
      ...attempt.runs.filter((run) => run.id !== evidence.id),
      boundedRun(evidence),
    ].slice(-MAX_RUNS),
  };
}

/** Append accepted interview changes without rewriting the original question or solution. */
export function appendRequirement(
  attempt: Attempt,
  update: Omit<RequirementUpdate, "acknowledgedAt">,
): Attempt {
  if (
    attempt.finishedAt !== null ||
    attempt.mode !== "mock" ||
    !attempt.liveInterviewer ||
    (attempt.requirementUpdates?.length ?? 0) >= 50 ||
    attempt.requirementUpdates?.some((item) => item.id === update.id)
  )
    return attempt;
  return {
    ...attempt,
    requirementUpdates: [
      ...(attempt.requirementUpdates ?? []),
      structuredClone(update),
    ],
  };
}

export function acknowledgeRequirement(
  attempt: Attempt,
  id: string,
  now = Date.now(),
): Attempt {
  if (
    attempt.finishedAt !== null ||
    !Number.isFinite(now) ||
    now < attempt.startedAt
  )
    return attempt;
  return {
    ...attempt,
    requirementUpdates: (attempt.requirementUpdates ?? []).map((update) =>
      update.id === id && update.acknowledgedAt === undefined
        ? { ...update, acknowledgedAt: now }
        : update,
    ),
  };
}

export function finishAttempt(
  attempt: Attempt,
  source: string,
  stdin: string,
  now = Date.now(),
): Attempt {
  if (attempt.finishedAt !== null) return attempt;
  return {
    ...attempt,
    source,
    stdin,
    finishedAt: Number.isFinite(now)
      ? Math.max(
          attempt.startedAt,
          attempt.interviewJourney?.transitions.at(-1)?.at ?? 0,
          now,
        )
      : Date.now(),
  };
}

export interface AttemptSummary {
  elapsedMs: number;
  firstRunnableMs: number | null;
  baseline: {
    passed: number;
    total: number;
    current: boolean;
    status: string;
  } | null;
  hintCount: number;
  pauses: number;
  observations: string[];
  nextSteps: string[];
}

export function attemptSummary(attempt: Attempt): AttemptSummary {
  const end = attempt.finishedAt ?? Date.now();
  const elapsedMs = Math.max(0, end - attempt.startedAt);
  const successful = attempt.runs.filter((run) => run.status === "completed");
  const firstRunnableMs = successful.length
    ? Math.max(
        0,
        Math.min(...successful.map((run) => run.at)) - attempt.startedAt,
      )
    : null;
  const latest = [...attempt.runs]
    .reverse()
    .find((run) => run.kind === "baseline");
  const canonical = attempt.question.baselineTests;
  const baseline = latest
    ? {
        passed: latest.results.filter(
          (result) =>
            result.passed &&
            canonical.some(
              (test) =>
                test.id === result.id &&
                latest.tests.some(
                  (ran) => ran.id === test.id && ran.code === test.code,
                ),
            ),
        ).length,
        total: canonical.length,
        current:
          canonical.length > 0 &&
          latest.source === attempt.source &&
          sameFiles(latest.files, attempt.files) &&
          latest.stdin === attempt.stdin &&
          latest.tests.length === canonical.length &&
          latest.results.length === canonical.length &&
          uniqueIds(latest.tests) &&
          uniqueIds(latest.results) &&
          canonical.every(
            (test) =>
              latest.tests.some(
                (ran) => ran.id === test.id && ran.code === test.code,
              ) && latest.results.some((result) => result.id === test.id),
          ) &&
          (latest.status === "completed" || latest.status === "failed"),
        status: latest.status,
      }
    : null;
  const pauses = attempt.pauseEvents.filter(
    (event) => event.action === "pause",
  ).length;
  const observations: string[] = [];
  const nextSteps: string[] = [];
  if (attempt.requirementUpdates?.length) {
    observations.push(
      `${attempt.requirementUpdates.length} interviewer requirement update(s) were added. The original baseline tests do not assess these added requirements.`,
    );
    nextSteps.push(
      "Check each added requirement and explain the tests you wrote for it.",
    );
  }

  if (!baseline) {
    observations.push("No supplied baseline test results have been recorded.");
    nextSteps.push(
      "Run the supplied baseline tests against your current solution.",
    );
  } else if (!baseline.current) {
    observations.push(
      "The latest baseline results are incomplete or do not match the current code, input, and supplied tests.",
    );
    nextSteps.push(
      "Rerun the complete supplied baseline suite before evaluating this solution.",
    );
  } else {
    observations.push(
      `${baseline.passed} of ${baseline.total} supplied baseline tests passed.`,
    );
    nextSteps.push(
      baseline.passed < baseline.total
        ? "Inspect a failing case, explain the cause, and rerun the baseline suite after your change."
        : "Add an edge case of your own, then practice a new variation of this topic.",
    );
  }
  if (end > attempt.deadline) {
    observations.push(
      `The attempt reached ${Math.ceil((end - attempt.deadline) / 60_000)} minute(s) of overtime.`,
    );
    nextSteps.push(
      "Repeat with a smaller first implementation, reserving the final ten minutes for tests.",
    );
  }
  if (pauses)
    observations.push(
      `The timer was paused ${pauses} time(s); elapsed time includes pauses.`,
    );
  if (attempt.hintsUsed.length) {
    observations.push(
      `${attempt.hintsUsed.length} requested hint(s) were recorded.`,
    );
  }
  if (attempt.notes.trim())
    observations.push("Written approach notes were recorded.");
  else
    nextSteps.push(
      "Write a brief approach and one edge case before starting the next solution.",
    );
  if (Object.values(attempt.selfCheck).some(Boolean)) {
    observations.push(
      "Communication checkmarks are self-reported; spoken reasoning was not recorded or evaluated.",
    );
  }
  if (attempt.runs.length >= MAX_RUNS) {
    observations.push(
      "Run history retains the latest 20 runs; a successful execution may predate this retained evidence.",
    );
  }
  return {
    elapsedMs,
    firstRunnableMs,
    baseline,
    hintCount: attempt.hintsUsed.length,
    pauses,
    observations,
    nextSteps,
  };
}
