import { describe, expect, it } from "vitest";
import {
  interviewJourneySchema,
  snapshotAttemptSchema,
} from "../../server/contracts";
import { ProjectDatabase } from "../../server/projects";
import { defaultSession } from "../session";
import { generateQuestion, topics } from "./curriculum";
import {
  createAttempt,
  defaultLearning,
  finishAttempt,
  isLearning,
  acknowledgeRequirement,
} from "./state";
import {
  initialInterviewJourney,
  INTERVIEW_PHASES,
  isInterviewJourney,
  journeySummary,
  moveInterviewPhase,
  scriptedFollowup,
} from "./journey";
import type { Attempt, InterviewPhase } from "./types";

const minute = 60_000;
const question = generateQuestion(topics[0].id, "applied", 1);
const mock = () =>
  createAttempt(
    {
      ...question,
      provenance: {
        ...question.provenance,
        kind: "local-template",
        templateId: "mock.equipment-library.v1",
      },
    },
    "mock",
    60,
    1_000,
  );
const at = (minutes: number) => 1_000 + minutes * minute;

describe("mock interview journey", () => {
  it("starts new mocks at clarify, leaving drills and historical mocks compatible", () => {
    const attempt = mock();
    expect(attempt.interviewJourney).toEqual(
      initialInterviewJourney(attempt.startedAt),
    );
    expect(createAttempt(question, "drill", 15, 1_000)).not.toHaveProperty(
      "interviewJourney",
    );
    const legacy = { ...attempt, interviewJourney: undefined };
    expect(isLearning({ ...defaultLearning(), attempts: [legacy] })).toBe(true);
    expect(journeySummary(legacy, at(7))).toMatchObject({
      elapsedMs: 7 * minute,
      trackedMs: 0,
      untrackedMs: 7 * minute,
      currentPhase: null,
    });
    const moved = moveInterviewPhase(legacy, "code", at(7));
    expect(journeySummary(moved, at(10))).toMatchObject({
      trackedMs: 3 * minute,
      untrackedMs: 7 * minute,
      currentPhase: "code",
    });
    expect(legacy.interviewJourney).toBeUndefined();
  });

  it("uses wall time, sums return visits, preserves windows, and freezes at submission", () => {
    let attempt = mock();
    attempt = moveInterviewPhase(attempt, "approach", at(5));
    attempt = moveInterviewPhase(attempt, "code", at(10));
    attempt = moveInterviewPhase(attempt, "approach", at(20));
    attempt = moveInterviewPhase(attempt, "code", at(23));
    attempt = moveInterviewPhase(attempt, "followup", at(40));
    attempt = moveInterviewPhase(attempt, "wrapup", at(50));
    attempt.pauseEvents = [
      { at: at(12), action: "pause" },
      { at: at(14), action: "resume" },
    ];
    const finished = finishAttempt(attempt, "final", "", at(65));
    const summary = journeySummary(finished, at(100));
    expect(summary.elapsedMs).toBe(65 * minute);
    expect(summary.untrackedMs).toBe(0);
    expect(summary.trackedMs).toBe(summary.elapsedMs);
    expect(summary.phases.map((phase) => phase.elapsedMs / minute)).toEqual([
      5, 8, 27, 10, 15,
    ]);
    expect(
      summary.phases.map(({ elapsedMs: _elapsed, ...phase }) => phase),
    ).toEqual(INTERVIEW_PHASES);
    expect(summary.basis).toBe("self-selected phases");
    expect(summary.events.at(-1)).toMatchObject({
      kind: "finish",
      at: at(65),
      phase: "wrapup",
    });
    expect(moveInterviewPhase(finished, "code", at(70))).toBe(finished);
    expect(acknowledgeRequirement(finished, "absent", at(70))).toBe(finished);
    expect(journeySummary(finished, at(500))).toEqual(summary);
  });

  it("rejects invalid timestamps, repeated phases, drills, and overflow without losing history", () => {
    let attempt = moveInterviewPhase(mock(), "approach", at(5));
    for (const time of [
      -1,
      Number.NaN,
      Infinity,
      8_640_000_000_000_001,
      at(4),
    ]) {
      expect(moveInterviewPhase(attempt, "code", time)).toBe(attempt);
    }
    expect(moveInterviewPhase(attempt, "approach", at(6))).toBe(attempt);
    expect(
      moveInterviewPhase(attempt, "invalid" as InterviewPhase, at(6)),
    ).toBe(attempt);
    const drill = createAttempt(question, "drill", 15, 1_000);
    expect(moveInterviewPhase(drill, "code", at(6))).toBe(drill);
    const originalFirst = attempt.interviewJourney!.transitions[0];
    for (let index = 2; index < 200; index++)
      attempt = moveInterviewPhase(
        attempt,
        index % 2 ? "approach" : "code",
        at(5) + index,
      );
    expect(attempt.interviewJourney!.transitions).toHaveLength(200);
    expect(attempt.interviewJourney!.transitions[0]).toEqual(originalFirst);
    expect(moveInterviewPhase(attempt, "wrapup", at(20))).toBe(attempt);
    expect(isInterviewJourney(attempt.interviewJourney)).toBe(true);
  });

  it("validates strict bounded chronological fields in local storage and MCP schemas", () => {
    const good = initialInterviewJourney(1_000);
    const invalid: unknown[] = [
      null,
      {},
      { ...good, version: 2 },
      { ...good, extra: true },
      { ...good, clarifications: "x".repeat(6_001) },
      { ...good, followupResponse: "x".repeat(6_001) },
      { ...good, transitions: [] },
      { ...good, transitions: [{ phase: "invalid", at: 1_000 }] },
      { ...good, transitions: [{ phase: "clarify", at: 1_000, extra: 1 }] },
      ...[-1, Infinity, NaN, 8_640_000_000_000_001].map((at) => ({
        ...good,
        transitions: [{ phase: "clarify", at }],
      })),
      {
        ...good,
        transitions: [
          { phase: "clarify", at: 1_000 },
          { phase: "code", at: 999 },
        ],
      },
      {
        ...good,
        transitions: [
          { phase: "clarify", at: 1_000 },
          { phase: "clarify", at: 2_000 },
        ],
      },
      {
        ...good,
        transitions: Array.from({ length: 201 }, (_, index) => ({
          phase: index % 2 ? "code" : "clarify",
          at: index,
        })),
      },
    ];
    expect(isInterviewJourney(good)).toBe(true);
    expect(interviewJourneySchema.safeParse(good).success).toBe(true);
    for (const interviewJourney of invalid) {
      expect(isInterviewJourney(interviewJourney)).toBe(false);
      expect(interviewJourneySchema.safeParse(interviewJourney).success).toBe(
        false,
      );
      expect(
        isLearning({
          ...defaultLearning(),
          attempts: [{ ...mock(), interviewJourney }],
        }),
      ).toBe(false);
    }
    expect(
      isLearning({
        ...defaultLearning(),
        attempts: [{ ...mock(), mode: "drill" }],
      }),
    ).toBe(false);
    expect(
      isLearning({
        ...defaultLearning(),
        attempts: [
          { ...mock(), interviewJourney: initialInterviewJourney(999) },
        ],
      }),
    ).toBe(false);
    expect(
      isLearning({
        ...defaultLearning(),
        attempts: [
          {
            ...mock(),
            finishedAt: 1_001,
            interviewJourney: initialInterviewJourney(1_002),
          },
        ],
      }),
    ).toBe(false);
  });

  it("emits chronological, phase-associated evidence without reporting future evidence", () => {
    let attempt = moveInterviewPhase(mock(), "code", at(10));
    attempt.hintsUsed = [
      { at: at(12), text: "Keep loan state on each library.", source: "local" },
      { at: at(80), text: "Future event", source: "ai" },
    ];
    attempt.runs = [
      {
        id: "one",
        at: at(15),
        kind: "baseline",
        source: "source",
        stdin: "",
        tests: [],
        results: [{ id: "case", name: "normal", passed: true, elapsedMs: 1 }],
        status: "completed",
        elapsedMs: 2,
        output: "",
      },
    ];
    attempt = scriptedFollowup(attempt, at(40));
    attempt = acknowledgeRequirement(
      attempt,
      "local-script-borrower-view-v1",
      at(41),
    );
    const events = journeySummary(
      finishAttempt(attempt, "source", "", at(55)),
    ).events;
    expect(events.map((event) => event.kind)).toEqual([
      "phase",
      "phase",
      "hint",
      "run",
      "requirement",
      "acknowledgement",
      "finish",
    ]);
    expect(events.find((event) => event.kind === "hint")).toMatchObject({
      phase: "code",
      title: "Local hint",
      detail: "Keep loan state on each library.",
    });
    expect(events.find((event) => event.kind === "run")?.detail).toBe(
      "completed · 1/1 passed",
    );
  });

  it("round trips the journey through SQLite, backups, and the public attempt schema", () => {
    const database = new ProjectDatabase(":memory:");
    try {
      let attempt = moveInterviewPhase(mock(), "approach", at(5));
      attempt.interviewJourney!.clarifications =
        "Does a returned item keep its original identifier?";
      attempt.interviewJourney!.followupResponse =
        "Filter active loans and sort a new list.";
      attempt = scriptedFollowup(attempt, at(40));
      const state = {
        schemaVersion: 1 as const,
        session: defaultSession(),
        learning: {
          ...defaultLearning(),
          activeAttemptId: attempt.id,
          attempts: [attempt],
        },
      };
      const project = database.create({ name: "Journey rehearsal" }, state);
      const saved = database.get(project.project.id);
      expect(saved.state).toEqual(state);
      const imported = database.create(
        { name: "Restored journey" },
        JSON.parse(JSON.stringify(saved.state)),
      );
      expect(imported.state.learning.attempts[0]).toEqual(attempt);
      const { referenceSolution: _private, ...publicQuestion } =
        attempt.question;
      const parsed = snapshotAttemptSchema.parse({
        ...attempt,
        question: publicQuestion,
      });
      expect(parsed.interviewJourney).toEqual(attempt.interviewJourney);
      expect(parsed.question).not.toHaveProperty("referenceSolution");
      expect(
        scriptedFollowup(imported.state.learning.attempts[0], at(55)),
      ).toBe(imported.state.learning.attempts[0]);
    } finally {
      database.close();
    }
  });
});

describe("local interview follow-up", () => {
  it("reveals exactly once at 40 minutes, preserving the baseline and source", () => {
    const attempt = mock();
    attempt.source = "my solution";
    expect(scriptedFollowup(attempt, at(40) - 1)).toBe(attempt);
    const revealed = scriptedFollowup(attempt, at(40));
    expect(revealed.requirementUpdates).toHaveLength(1);
    expect(revealed.requirementUpdates![0]).toMatchObject({
      id: "local-script-borrower-view-v1",
      title: "Follow-up: borrower view",
      author: "Local interview script",
      createdAt: at(40),
    });
    expect(revealed.requirementUpdates![0].description).toContain(
      "Library.loans_for(borrower)",
    );
    expect(revealed.question).toBe(attempt.question);
    expect(revealed.source).toBe(attempt.source);
    expect(attempt.requirementUpdates).toEqual([]);
    expect(scriptedFollowup(revealed, at(60))).toBe(revealed);
    const refreshed = JSON.parse(JSON.stringify(revealed)) as Attempt;
    expect(scriptedFollowup(refreshed, at(60), true)).toBe(refreshed);
  });

  it("allows explicit early reveal and records the time a delayed reveal actually appears", () => {
    expect(
      scriptedFollowup(mock(), at(20), true).requirementUpdates![0].createdAt,
    ).toBe(at(20));
    expect(
      scriptedFollowup(mock(), at(48)).requirementUpdates![0].createdAt,
    ).toBe(at(48));
  });

  it("never injects into drills, other questions, live AI attempts, or finished attempts", () => {
    const original = mock();
    const excluded: Attempt[] = [
      { ...original, mode: "drill" },
      { ...original, liveInterviewer: true },
      finishAttempt(original, "", "", at(20)),
      {
        ...original,
        question: {
          ...original.question,
          provenance: {
            kind: "ai",
            generator: "Assistant",
            templateId: "mock.equipment-library.v1",
          },
        },
      },
      { ...original, question },
      {
        ...original,
        requirementUpdates: Array.from({ length: 50 }, (_, index) => ({
          id: `req-${index}`,
          title: "Requirement",
          description: "Text",
          author: "Coach",
          createdAt: at(10),
        })),
      },
    ];
    for (const attempt of excluded)
      expect(scriptedFollowup(attempt, at(50), true)).toBe(attempt);
    for (const time of [0, -1, NaN, Infinity])
      expect(scriptedFollowup(original, time, true)).toBe(original);
  });
});
