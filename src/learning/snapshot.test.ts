import { describe, expect, it } from "vitest";
import { snapshotSchema } from "../../server/contracts";
import { generateQuestion, topics } from "./curriculum";
import { createAttempt } from "./state";
import { boundSnapshot } from "./snapshot";
import type { PracticeSnapshot, QuestionPackage, RunEvidence } from "./types";
import { defaultScratchpad, isScratchpad } from "../scratchpad/model";
import { initialInterviewJourney } from "./journey";

function makeSnapshot(): PracticeSnapshot {
  const question = generateQuestion(topics[0].id, "applied", 0);
  const original = createAttempt(question, "drill", 20, 1_000);
  const { referenceSolution: _reference, ...publicQuestion } = question;
  const attempt = { ...original, question: publicQuestion };
  attempt.source = "class Example:\n    pass\n";
  attempt.scratchTests = [
    { id: "scratch", name: "My check", code: "assert True" },
  ];
  attempt.notes = "Use one list per instance.";
  const run: RunEvidence = {
    id: "run-1",
    at: 2_000,
    kind: "baseline",
    source: attempt.source,
    stdin: "",
    tests: structuredClone(question.baselineTests),
    results: question.baselineTests.map((test) => ({
      id: test.id,
      name: test.name,
      passed: true,
      elapsedMs: 1,
    })),
    status: "completed",
    elapsedMs: 10,
    output: "Done.\n",
  };
  attempt.runs = [run];
  return {
    schemaVersion: 1,
    instanceId: "instance-1",
    updatedAt: 2_100,
    app: "localpad",
    activeExercise: {
      id: `attempt-${attempt.id}`,
      title: question.title,
      prompt: question.prompt,
      topic: topics[0].title,
    },
    source: attempt.source,
    stdin: "",
    notes: attempt.notes,
    timer: { remainingMs: 10_000, running: true },
    activeAttempt: attempt,
    recentAttempts: [],
    history: [
      {
        id: attempt.id,
        title: question.title,
        topicId: question.topicId,
        mode: "drill",
        startedAt: 1_000,
        finishedAt: null,
        hintCount: 0,
      },
    ],
    requests: [
      {
        id: "request-1",
        kind: "hint",
        topicId: question.topicId,
        level: question.level,
        mode: "drill",
        attemptId: attempt.id,
        instructions: "Give one small hint.",
        createdAt: 2_000,
      },
    ],
  };
}
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
function validAndBounded(snapshot: PracticeSnapshot) {
  expect(snapshotSchema.safeParse(snapshot)).toMatchObject({ success: true });
  expect(bytes(snapshot)).toBeLessThanOrEqual(850_000);
  expect(snapshot.truncatedFields?.length ?? 0).toBeLessThanOrEqual(100);
  expect(
    snapshot.truncatedFields?.every((path) => path.length <= 300) ?? true,
  ).toBe(true);
}

describe("boundSnapshot", () => {
  it("keeps pacing evidence intact and discloses shortened journey notes under byte pressure", () => {
    const original = makeSnapshot();
    const attempt = original.activeAttempt!;
    attempt.mode = "mock";
    attempt.interviewJourney = initialInterviewJourney(attempt.startedAt);
    attempt.interviewJourney.transitions.push({ phase: "code", at: 2_000 });
    attempt.interviewJourney.clarifications =
      "Does returning an item end its loan?";
    attempt.interviewJourney.followupResponse =
      "Sort a new list of active loans.";
    expect(boundSnapshot(original)).toEqual(original);
    validAndBounded(boundSnapshot(original));

    attempt.interviewJourney.clarifications = "\u0001".repeat(6_000);
    attempt.interviewJourney.followupResponse = "\u0001".repeat(6_000);
    attempt.question.baselineTests = Array.from({ length: 30 }, (_, index) => ({
      id: `baseline-${index}`,
      name: "Large assertion",
      code: "\u0001".repeat(100_000),
    }));
    const stored = JSON.stringify(original);
    const bounded = boundSnapshot(original);
    validAndBounded(bounded);
    expect(bounded.activeAttempt!.interviewJourney!.transitions).toEqual(
      attempt.interviewJourney.transitions,
    );
    expect(
      bounded.activeAttempt!.interviewJourney!.clarifications.length,
    ).toBeLessThan(6_000);
    expect(bounded.truncatedFields).toContain(
      "activeAttempt.interviewJourney.clarifications",
    );
    expect(bounded.truncatedFields).toContain(
      "activeAttempt.interviewJourney.followupResponse",
    );
    expect(JSON.stringify(original)).toBe(stored);
    expect(bounded.activeAttempt!.question).not.toHaveProperty(
      "referenceSolution",
    );
  });

  it("exposes scratchpad reasoning without mutating it or changing run evidence", () => {
    const original = makeSnapshot();
    original.scratchpad = defaultScratchpad();
    original.scratchpad.notes = "Use a dictionary and check the complement.";
    original.scratchpad.trace.rows[0].cells = {
      step: "1",
      variables: "seen = {}",
    };
    original.activeAttempt!.scratchpad = structuredClone(original.scratchpad);
    const bounded = boundSnapshot(original);
    validAndBounded(bounded);
    expect(bounded).toEqual(original);
    bounded.scratchpad!.notes = "Transport copy";
    expect(original.scratchpad.notes).toBe(
      "Use a dictionary and check the complement.",
    );
  });

  it("bounds dense Unicode scratchpads and truthfully identifies omitted reasoning", () => {
    const original = makeSnapshot();
    const scratchpad = defaultScratchpad();
    scratchpad.notes = "界".repeat(50_000);
    scratchpad.trace.columns = Array.from({ length: 12 }, (_, index) => ({
      id: `${index}${"\u0001".repeat(75)}`,
      name: "Variable",
    }));
    scratchpad.trace.rows = Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index}`,
      cells: Object.fromEntries(
        scratchpad.trace.columns.map((column) => [
          column.id,
          "\u0001".repeat(2_000),
        ]),
      ),
    }));
    scratchpad.flow.nodes = Array.from({ length: 60 }, (_, index) => ({
      id: `node-${index}`,
      type: "process",
      label: "界".repeat(160),
      x: index,
      y: index,
    }));
    scratchpad.flow.edges = Array.from({ length: 120 }, (_, index) => ({
      id: `edge-${index}`,
      source: `node-${index % 60}`,
      target: `node-${(index + 1) % 60}`,
      label: "界".repeat(80),
    }));
    expect(isScratchpad(scratchpad)).toBe(true);
    original.scratchpad = scratchpad;
    original.activeAttempt!.scratchpad = structuredClone(scratchpad);
    const stored = JSON.stringify(original);
    const bounded = boundSnapshot(original);
    validAndBounded(bounded);
    expect(isScratchpad(bounded.scratchpad)).toBe(true);
    expect(
      bounded.truncatedFields?.some((path) => path.startsWith("scratchpad.")),
    ).toBe(true);
    expect(
      bounded.truncatedFields?.some((path) =>
        path.startsWith("activeAttempt.scratchpad."),
      ),
    ).toBe(true);
    expect(bounded.activeAttempt!.runs).toEqual(original.activeAttempt!.runs);
    expect(JSON.stringify(original)).toBe(stored);
  });
  it("preserves multi-file workspace and requirement acknowledgements, bounding only transport copies", () => {
    const original = makeSnapshot();
    original.files = { "helpers.py": "ANSWER = 42" };
    original.activeFile = "helpers.py";
    original.activeAttempt!.files = { ...original.files };
    original.activeAttempt!.activeFile = "helpers.py";
    original.activeAttempt!.liveInterviewer = true;
    original.activeAttempt!.requirementUpdates = [
      {
        id: "req-1",
        title: "Add a boundary",
        description: "Handle zero without mutation.",
        author: "Coach",
        createdAt: 2_000,
        acknowledgedAt: 2_050,
      },
    ];
    original.activeAttempt!.runs[0].files = { ...original.files };
    expect(boundSnapshot(original)).toEqual(original);
    const hugeFiles = Object.fromEntries(
      Array.from({ length: 32 }, (_, index) => [
        `module_${index}.py`,
        "界".repeat(100_000),
      ]),
    );
    original.files = hugeFiles;
    original.activeAttempt!.files = hugeFiles;
    original.activeAttempt!.runs[0].files = hugeFiles;
    const bounded = boundSnapshot(original);
    validAndBounded(bounded);
    expect(
      bounded.truncatedFields?.some((path) => path.includes("files.")),
    ).toBe(true);
    expect(original.files["module_0.py"].length).toBe(100_000);
    expect(bounded.activeAttempt!.requirementUpdates![0].acknowledgedAt).toBe(
      2_050,
    );
  });
  it("preserves normal code, canonical assertions, results and selected review evidence without mutating input", () => {
    const original = makeSnapshot();
    const oldReview = structuredClone(original.activeAttempt!);
    oldReview.id = "reviewed-old-attempt";
    oldReview.startedAt = 100;
    oldReview.finishedAt = 200;
    original.recentAttempts = [oldReview];
    const before = structuredClone(original);
    const bounded = boundSnapshot(original);
    expect(bounded).toEqual(before);
    expect(original).toEqual(before);
    expect(bounded).not.toBe(original);
    expect(bounded.activeAttempt!.question.baselineTests).not.toBe(
      original.activeAttempt!.question.baselineTests,
    );
    validAndBounded(bounded);
  });

  it("redacts reference solutions defensively from active and recent questions", () => {
    const original = makeSnapshot();
    (original.activeAttempt!.question as QuestionPackage).referenceSolution =
      "DO_NOT_SEND_THE_REFERENCE";
    original.recentAttempts = [structuredClone(original.activeAttempt!)];
    const bounded = boundSnapshot(original);
    expect(JSON.stringify(bounded)).not.toContain("DO_NOT_SEND_THE_REFERENCE");
    expect(bounded.truncatedFields).toContain(
      "activeAttempt.question.referenceSolution",
    );
    expect(
      (original.activeAttempt!.question as QuestionPackage).referenceSolution,
    ).toBe("DO_NOT_SEND_THE_REFERENCE");
    validAndBounded(bounded);
  });

  it("clips user-controlled scratch names and output/error fields to transport schema limits", () => {
    const original = makeSnapshot();
    original.activeAttempt!.scratchTests[0].name = "x".repeat(500);
    original.activeAttempt!.scratchTests[0].code = "assert True\n".repeat(500);
    original.activeAttempt!.runs[0].results[0].name = "x".repeat(800);
    original.activeAttempt!.runs[0].results[0].error = "traceback\n".repeat(
      2_000,
    );
    original.activeAttempt!.runs[0].output = "out\n".repeat(5_000);
    const bounded = boundSnapshot(original);
    expect(bounded.activeAttempt!.scratchTests[0].name).toHaveLength(300);
    expect(bounded.activeAttempt!.scratchTests[0].code).toHaveLength(2_000);
    expect(bounded.activeAttempt!.runs[0].results[0].error).toHaveLength(2_000);
    expect(bounded.truncatedFields).toContain(
      "activeAttempt.scratchTests[0].name",
    );
    expect(bounded.activeAttempt!.question.baselineTests).toEqual(
      original.activeAttempt!.question.baselineTests,
    );
    validAndBounded(bounded);
  });

  it("drops the oldest recent attempt only when bytes exceed the budget", () => {
    const original = makeSnapshot();
    const latest = structuredClone(original.activeAttempt!);
    latest.id = "latest";
    latest.startedAt = 500;
    latest.finishedAt = 700;
    const oldest = structuredClone(latest);
    oldest.id = "oldest";
    oldest.startedAt = 50;
    oldest.finishedAt = 100;
    oldest.question.baselineTests = Array.from({ length: 10 }, (_, i) => ({
      id: `test-${i}`,
      name: "Large assertion",
      code: "界".repeat(30_000),
    }));
    original.recentAttempts = [latest, oldest];
    const bounded = boundSnapshot(original);
    expect(bounded.recentAttempts!.map((attempt) => attempt.id)).toEqual([
      "latest",
    ]);
    expect(bounded.activeAttempt!.runs).toEqual(original.activeAttempt!.runs);
    expect(bounded.truncatedFields).toContain("recentAttempts");
    validAndBounded(bounded);
  });

  it("drops oldest active run evidence before shortening its question", () => {
    const original = makeSnapshot();
    const older = structuredClone(original.activeAttempt!.runs[0]);
    older.id = "old-run";
    older.at = 1_000;
    older.tests = Array.from({ length: 10 }, (_, i) => ({
      id: `test-${i}`,
      name: "Long baseline",
      code: "界".repeat(30_000),
    }));
    original.activeAttempt!.runs.push(older);
    const bounded = boundSnapshot(original);
    expect(bounded.activeAttempt!.runs.map((run) => run.id)).toEqual(["run-1"]);
    expect(bounded.activeAttempt!.question).toEqual(
      original.activeAttempt!.question,
    );
    expect(bounded.truncatedFields).toContain("activeAttempt.runs");
    validAndBounded(bounded);
  });

  it("bounds a single huge Unicode question without erasing the attempt or losing truncation disclosure", () => {
    const original = makeSnapshot();
    const huge = "🧑‍💻".repeat(20_000);
    original.activeAttempt!.question.baselineTests = Array.from(
      { length: 30 },
      (_, i) => ({ id: `baseline-${i}`, name: `Case ${i}`, code: huge }),
    );
    original.activeAttempt!.question.examples = Array.from(
      { length: 12 },
      () => ({ input: huge, output: huge, explanation: huge }),
    );
    original.activeAttempt!.question.hints = Array(10).fill(huge);
    original.activeAttempt!.question.constraints = Array(30).fill(huge);
    original.activeAttempt!.runs[0].tests = structuredClone(
      original.activeAttempt!.question.baselineTests,
    );
    const bounded = boundSnapshot(original);
    expect(bounded.activeAttempt!.id).toBe(original.activeAttempt!.id);
    expect(bounded.activeAttempt!.question.baselineTests).toHaveLength(30);
    expect(
      bounded.activeAttempt!.question.baselineTests[0].code.length,
    ).toBeLessThan(100_000);
    expect(bounded.truncatedFields).toContain(
      "activeAttempt.question.baselineTests[0].code",
    );
    expect(original.activeAttempt!.question.baselineTests[0].code).toBe(huge);
    validAndBounded(bounded);
  });

  it("counts encoded JSON bytes, including control-character escapes, and caps pending requests", () => {
    const original = makeSnapshot();
    const escaped = "\u0000".repeat(30_000);
    original.requests = Array.from({ length: 40 }, (_, i) => ({
      ...original.requests[0],
      id: `request-${i}`,
      instructions: escaped,
    }));
    original.source = "\u0000".repeat(100_000);
    original.notes = escaped;
    original.activeAttempt!.source = original.source;
    original.activeAttempt!.notes = escaped;
    const bounded = boundSnapshot(original);
    expect(bounded.requests).toHaveLength(30);
    expect(bounded.requests[0].id).toBe("request-10");
    expect(bounded.truncatedFields).toContain("requests");
    expect(bounded.truncatedFields).toContain("source");
    validAndBounded(bounded);
  });

  it("bounds oversized nested feedback, hints, pause history and existing truncation metadata", () => {
    const original = makeSnapshot();
    const attempt = original.activeAttempt!;
    const text = "界".repeat(30_000);
    attempt.feedback = Array.from({ length: 55 }, (_, i) => ({
      id: `feedback-${i}`,
      attemptId: attempt.id,
      reviewer: "Coach",
      createdAt: i,
      summary: text,
      strengths: Array(20).fill(text),
      improvements: Array(20).fill(text),
      nextPractice: text,
      evidenceRunIds: ["run-1"],
    }));
    attempt.hintsUsed = Array.from({ length: 105 }, (_, i) => ({
      text,
      at: i,
      source: "ai" as const,
    }));
    attempt.pauseEvents = Array.from({ length: 1_005 }, (_, i) => ({
      at: i,
      action: "pause" as const,
    }));
    original.truncatedFields = Array.from(
      { length: 105 },
      (_, i) => `${i}-${"x".repeat(310)}`,
    );
    const bounded = boundSnapshot(original);
    expect(bounded.activeAttempt!.feedback.length).toBeLessThanOrEqual(5);
    expect(bounded.activeAttempt!.hintsUsed.length).toBeLessThanOrEqual(20);
    expect(bounded.activeAttempt!.pauseEvents.length).toBeLessThanOrEqual(100);
    expect(
      bounded.truncatedFields!.some((path) =>
        path.includes("additional fields"),
      ),
    ).toBe(true);
    validAndBounded(bounded);
  });
});
