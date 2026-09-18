import type { Attempt, InterviewJourney, InterviewPhase } from "./types";

export type { InterviewJourney, InterviewPhase } from "./types";

export const INTERVIEW_PHASES = [
  {
    id: "clarify",
    title: "Clarify",
    fromMinute: 0,
    toMinute: 5,
    prompt: "Read the contract and explain any assumptions before coding.",
  },
  {
    id: "approach",
    title: "Approach",
    fromMinute: 5,
    toMinute: 10,
    prompt:
      "Explain your objects, state, and first test. Use the scratchpad if it helps.",
  },
  {
    id: "code",
    title: "Code & test",
    fromMinute: 10,
    toMinute: 40,
    prompt: "Build a small working solution, then test normal and edge cases.",
  },
  {
    id: "followup",
    title: "Follow-up",
    fromMinute: 40,
    toMinute: 50,
    prompt:
      "Read the added requirement, explain what changes, and test the new behavior.",
  },
  {
    id: "wrapup",
    title: "Wrap up",
    fromMinute: 50,
    toMinute: 60,
    prompt:
      "Run your final checks and explain remaining limitations before submitting.",
  },
] as const satisfies readonly {
  id: InterviewPhase;
  title: string;
  fromMinute: number;
  toMinute: number;
  prompt: string;
}[];

export const JOURNEY_LIMITS = { transitions: 200, text: 6_000 } as const;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const isTime = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_TIMESTAMP;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, names: string[]) {
  return (
    Object.keys(value).length === names.length &&
    names.every((name) => Object.hasOwn(value, name))
  );
}
export function isInterviewPhase(value: unknown): value is InterviewPhase {
  return INTERVIEW_PHASES.some((phase) => phase.id === value);
}

/** Additive versioned data: older attempts may omit this object entirely. */
export function isInterviewJourney(value: unknown): value is InterviewJourney {
  if (
    !record(value) ||
    !exactKeys(value, [
      "version",
      "transitions",
      "clarifications",
      "followupResponse",
    ]) ||
    value.version !== 1 ||
    typeof value.clarifications !== "string" ||
    value.clarifications.length > JOURNEY_LIMITS.text ||
    typeof value.followupResponse !== "string" ||
    value.followupResponse.length > JOURNEY_LIMITS.text ||
    !Array.isArray(value.transitions) ||
    value.transitions.length < 1 ||
    value.transitions.length > JOURNEY_LIMITS.transitions
  )
    return false;
  let previous = -1;
  let previousPhase: InterviewPhase | undefined;
  for (const transition of value.transitions) {
    if (
      !record(transition) ||
      !exactKeys(transition, ["phase", "at"]) ||
      !isInterviewPhase(transition.phase) ||
      !isTime(transition.at) ||
      transition.at < previous ||
      transition.phase === previousPhase
    )
      return false;
    previous = transition.at;
    previousPhase = transition.phase;
  }
  return true;
}

export function initialInterviewJourney(now: number): InterviewJourney {
  return {
    version: 1,
    transitions: [{ phase: "clarify", at: now }],
    clarifications: "",
    followupResponse: "",
  };
}

/** Selections describe the learner's pacing; they never advance or pause the clock. */
export function moveInterviewPhase(
  attempt: Attempt,
  phase: InterviewPhase,
  now = Date.now(),
): Attempt {
  if (
    attempt.mode !== "mock" ||
    attempt.finishedAt !== null ||
    !isInterviewPhase(phase) ||
    !isTime(now) ||
    now < attempt.startedAt
  )
    return attempt;
  const journey = attempt.interviewJourney;
  if (
    journey &&
    (!isInterviewJourney(journey) ||
      journey.transitions.length >= JOURNEY_LIMITS.transitions)
  )
    return attempt;
  const last = journey?.transitions.at(-1);
  if (last && (last.phase === phase || now < last.at)) return attempt;
  return {
    ...attempt,
    interviewJourney: {
      version: 1,
      clarifications: journey?.clarifications ?? "",
      followupResponse: journey?.followupResponse ?? "",
      transitions: [...(journey?.transitions ?? []), { phase, at: now }],
    },
  };
}

export interface JourneyEvent {
  at: number;
  title: string;
  detail: string;
  kind: "phase" | "hint" | "run" | "requirement" | "acknowledgement" | "finish";
  phase: InterviewPhase | null;
}
export interface JourneySummary {
  elapsedMs: number;
  trackedMs: number;
  untrackedMs: number;
  currentPhase: InterviewPhase | null;
  phases: {
    id: InterviewPhase;
    title: string;
    fromMinute: number;
    toMinute: number;
    prompt: string;
    elapsedMs: number;
  }[];
  events: JourneyEvent[];
  basis: "self-selected phases";
}

/** Wall-clock accounting includes inactive tabs and overtime; it is not speech/activity detection. */
export function journeySummary(
  attempt: Attempt,
  now = Date.now(),
): JourneySummary {
  const end = Math.max(
    attempt.startedAt,
    attempt.finishedAt ?? (isTime(now) ? now : attempt.startedAt),
  );
  const elapsedMs = end - attempt.startedAt;
  const transitions =
    attempt.mode === "mock" && isInterviewJourney(attempt.interviewJourney)
      ? attempt.interviewJourney.transitions.filter(
          (item) => item.at >= attempt.startedAt && item.at <= end,
        )
      : [];
  const phases: JourneySummary["phases"] = INTERVIEW_PHASES.map((phase) => ({
    ...phase,
    elapsedMs: 0,
  }));
  for (let index = 0; index < transitions.length; index++) {
    const item = transitions[index];
    phases.find((phase) => phase.id === item.phase)!.elapsedMs +=
      (transitions[index + 1]?.at ?? end) - item.at;
  }
  const phaseAt = (at: number): InterviewPhase | null =>
    [...transitions].reverse().find((item) => item.at <= at)?.phase ?? null;
  const events: JourneyEvent[] = [];
  const add = (
    at: number,
    kind: JourneyEvent["kind"],
    title: string,
    detail: string,
    phase: InterviewPhase | null = phaseAt(at),
  ) => {
    if (isTime(at) && at >= attempt.startedAt && at <= end)
      events.push({ at, kind, title, detail, phase });
  };
  for (const item of transitions)
    add(
      item.at,
      "phase",
      INTERVIEW_PHASES.find((phase) => phase.id === item.phase)!.title,
      "Self-selected phase",
      item.phase,
    );
  for (const hint of attempt.hintsUsed)
    add(
      hint.at,
      "hint",
      hint.source === "ai" ? "Assistant hint" : "Local hint",
      hint.text,
    );
  for (const run of attempt.runs) {
    const title =
      run.kind === "baseline"
        ? "Baseline tests"
        : run.kind === "scratch"
          ? "Custom tests"
          : "Python run";
    const results = run.results.length
      ? ` · ${run.results.filter((result) => result.passed).length}/${run.results.length} passed`
      : "";
    add(run.at, "run", title, `${run.status}${results}`);
  }
  for (const update of attempt.requirementUpdates ?? []) {
    add(
      update.createdAt,
      "requirement",
      update.title,
      `${update.author}: ${update.description}`,
    );
    if (update.acknowledgedAt !== undefined)
      add(
        update.acknowledgedAt,
        "acknowledgement",
        "Requirement acknowledged",
        update.title,
      );
  }
  if (attempt.finishedAt !== null)
    add(
      attempt.finishedAt,
      "finish",
      "Submitted",
      "Solution and reasoning saved for review",
    );
  events.sort((a, b) => a.at - b.at);
  const trackedMs = phases.reduce((sum, phase) => sum + phase.elapsedMs, 0);
  return {
    elapsedMs,
    trackedMs,
    untrackedMs: elapsedMs - trackedMs,
    currentPhase: transitions.at(-1)?.phase ?? null,
    phases,
    events,
    basis: "self-selected phases",
  };
}

/** Deterministic local rehearsal, separate from the assistant's explicitly opted-in live channel. */
export function scriptedFollowup(
  attempt: Attempt,
  now = Date.now(),
  early = false,
): Attempt {
  const id = "local-script-borrower-view-v1";
  if (
    attempt.mode !== "mock" ||
    attempt.finishedAt !== null ||
    attempt.liveInterviewer ||
    attempt.question.provenance.kind !== "local-template" ||
    attempt.question.provenance.templateId !== "mock.equipment-library.v1" ||
    !isTime(now) ||
    now < attempt.startedAt ||
    (!early && now - attempt.startedAt < 40 * 60_000) ||
    (attempt.requirementUpdates?.length ?? 0) >= 50 ||
    attempt.requirementUpdates?.some((item) => item.id === id)
  )
    return attempt;
  return {
    ...attempt,
    requirementUpdates: [
      ...(attempt.requirementUpdates ?? []),
      {
        id,
        title: "Follow-up: borrower view",
        description:
          "Add Library.loans_for(borrower). Return a new list of active Loan objects for that exact borrower, sorted by (loan.due_day, loan.item.item_id). Return [] for an unknown borrower. Once an item is returned, its loan must no longer appear. Preserve the original behavior and add tests for this requirement.",
        author: "Local interview script",
        createdAt: now,
      },
    ],
  };
}
