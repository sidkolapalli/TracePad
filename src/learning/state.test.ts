import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt, QuestionPackage, RunEvidence } from "./types";
import { defaultScratchpad } from "../scratchpad/model";
import {
  LEARNING_KEY,
  appendRun,
  appendRequirement,
  acknowledgeRequirement,
  attemptSummary,
  createAttempt,
  defaultLearning,
  finishAttempt,
  loadLearning,
  saveLearning,
} from "./state";

const question: QuestionPackage = {
  schemaVersion: 1,
  id: "counter-1",
  topicId: "python.oop.instance-state",
  level: "foundation",
  title: "Independent counters",
  prompt: "Implement Counter with an independent count for every instance.",
  starterCode: "class Counter:\n    pass\n",
  examples: [{ input: "Counter().value", output: "0" }],
  constraints: ["Start each counter at zero."],
  baselineTests: [
    {
      id: "initial",
      name: "Initial state",
      code: "assert Counter().value == 0",
    },
    {
      id: "separate",
      name: "Independent state",
      code: "assert Counter() is not Counter()",
    },
  ],
  hints: ["Initialize state on self."],
  referenceSolution:
    "class Counter:\n    def __init__(self):\n        self.value = 0\n",
  learningObjectives: ["Initialize independent object state."],
  recommendedMinutes: 15,
  provenance: {
    kind: "local-template",
    generator: "Tracepad",
    templateId: "counter",
    seed: 1,
  },
};

function baseline(
  attempt: Attempt,
  changes: Partial<RunEvidence> = {},
): RunEvidence {
  return {
    id: "run-1",
    at: attempt.startedAt + 15_000,
    kind: "baseline",
    source: attempt.source,
    stdin: attempt.stdin,
    tests: structuredClone(attempt.question.baselineTests),
    results: attempt.question.baselineTests.map((test) => ({
      id: test.id,
      name: test.name,
      passed: true,
      elapsedMs: 1,
    })),
    status: "completed",
    elapsedMs: 2,
    output: "",
    ...changes,
  };
}

let entries: Map<string, string>;
beforeEach(() => {
  entries = new Map();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("learning attempts", () => {
  it("retains scratchpad reasoning across submission and saved history without altering Python evidence", () => {
    const attempt = createAttempt(question, "mock", 60, 1_000);
    attempt.scratchpad = defaultScratchpad();
    attempt.scratchpad.notes = "Store count on each instance.";
    attempt.scratchpad.trace.rows[0].cells.variables =
      "a.count = 0, b.count = 0";
    const run = baseline(attempt);
    const recorded = appendRun(attempt, run);
    const finished = finishAttempt(
      recorded,
      attempt.source,
      attempt.stdin,
      50_000,
    );
    expect(finished.scratchpad).toEqual(attempt.scratchpad);
    expect(finished.runs[0]).toEqual(run);
    expect(attemptSummary(finished).baseline?.current).toBe(true);
    const state = {
      ...defaultLearning(),
      activeAttemptId: finished.id,
      attempts: [finished],
    };
    expect(saveLearning(state)).toBeNull();
    expect(loadLearning().state).toEqual(state);
    expect(finishAttempt(finished, "later", "", 100_000)).toBe(finished);
  });

  it("applies live requirements once only to opted-in unfinished mocks without replacing source or question", () => {
    const original = createAttempt(question, "mock", 60, 1_000);
    const update = {
      id: "req-1",
      title: "Add validation",
      description: "Reject negative amounts with ValueError.",
      author: "Interview coach",
      createdAt: 2_000,
    };
    expect(appendRequirement(original, update)).toBe(original);
    const enabled = {
      ...original,
      liveInterviewer: true,
      source: "from counter import Counter",
      files: { "counter.py": "class Counter: pass" },
    };
    const applied = appendRequirement(enabled, update);
    expect(applied.requirementUpdates).toEqual([update]);
    expect(applied.source).toBe(enabled.source);
    expect(applied.files).toEqual(enabled.files);
    expect(applied.question).toEqual(original.question);
    expect(enabled.requirementUpdates).toEqual([]);
    expect(
      appendRequirement(applied, {
        ...update,
        description: "A changed duplicate",
      }),
    ).toBe(applied);
    expect(
      appendRequirement({ ...enabled, mode: "drill" }, update)
        .requirementUpdates,
    ).toEqual([]);
    expect(
      appendRequirement({ ...enabled, finishedAt: 3_000 }, update)
        .requirementUpdates,
    ).toEqual([]);
    expect(attemptSummary(applied).observations.join(" ")).toContain(
      "do not assess these added requirements",
    );
  });
  it("persists multi-file evidence, live requirements, and an idempotent seen acknowledgement", () => {
    const attempt = {
      ...createAttempt(question, "mock", 60, 1_000),
      liveInterviewer: true,
      files: { "helpers.py": "ANSWER = 42" },
      activeFile: "helpers.py",
    };
    const update = {
      id: "req-1",
      title: "Add validation",
      description: "Reject negative values.",
      author: "Coach",
      createdAt: 2_000,
    };
    const applied = appendRequirement(attempt, update);
    const acknowledged = acknowledgeRequirement(applied, update.id, 2_500);
    expect(
      acknowledgeRequirement(acknowledged, update.id, 3_000)
        .requirementUpdates![0].acknowledgedAt,
    ).toBe(2_500);
    expect(applied.requirementUpdates![0].acknowledgedAt).toBeUndefined();
    const withRun = appendRun(
      acknowledged,
      baseline(acknowledged, {
        files: { ...attempt.files },
        activeFile: "helpers.py",
      }),
    );
    const state = {
      ...defaultLearning(),
      activeAttemptId: withRun.id,
      attempts: [withRun],
    };
    expect(saveLearning(state)).toBeNull();
    expect(loadLearning().state).toEqual(state);
    expect(attemptSummary(withRun).baseline?.current).toBe(true);
    expect(
      attemptSummary({ ...withRun, files: { "helpers.py": "ANSWER = 0" } })
        .baseline?.current,
    ).toBe(false);
    expect(attemptSummary({ ...withRun, files: {} }).baseline?.current).toBe(
      false,
    );
  });
  it("clones the question, creates distinct IDs, and starts the selected deadline", () => {
    const attempt = createAttempt(question, "drill", 15, 1_000);
    expect(attempt).toMatchObject({
      mode: "drill",
      source: question.starterCode,
      stdin: "",
      scratchTests: [],
      startedAt: 1_000,
      finishedAt: null,
      durationMs: 900_000,
      deadline: 901_000,
      notes: "",
      runs: [],
      hintsUsed: [],
      pauseEvents: [],
      feedback: [],
      selfCheck: {
        clarified: false,
        explained: false,
        respondedToHints: false,
      },
    });
    expect(attempt.id).not.toBe(createAttempt(question, "drill", 15, 1_000).id);
    attempt.question.baselineTests[0].code = "changed";
    attempt.question.examples[0].input = "changed";
    expect(question.baselineTests[0].code).toBe("assert Counter().value == 0");
    expect(question.examples[0].input).toBe("Counter().value");
  });

  it("starts mock interviews with an empty editor, retaining the question contract", () => {
    const attempt = createAttempt(question, "mock", 60, 1_000);
    expect(attempt.source).toBe("");
    expect(attempt.question.starterCode).toBe(question.starterCode);
    expect(attempt.deadline).toBe(3_601_000);
    expect(attempt.durationMs).toBe(3_600_000);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid duration %s",
    (minutes) => {
      expect(() => createAttempt(question, "drill", minutes, 1_000)).toThrow(
        RangeError,
      );
    },
  );

  it("records a final snapshot, counts overtime, and does not finish twice", () => {
    const attempt = createAttempt(question, "mock", 60, 1_000);
    const finished = finishAttempt(attempt, "final code", "input", 3_721_000);
    expect(finished).toMatchObject({
      source: "final code",
      stdin: "input",
      finishedAt: 3_721_000,
    });
    expect(attempt.finishedAt).toBeNull();
    expect(attempt.source).toBe("");
    expect(finishAttempt(finished, "later code", "", 4_000_000)).toBe(finished);
    expect(attemptSummary(finished).elapsedMs).toBe(3_720_000);
    expect(attemptSummary(finished).observations.join(" ")).toContain(
      "2 minute(s) of overtime",
    );
  });

  it("uses real wall time while an attempt is active and includes pauses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(121_000);
    const attempt = createAttempt(question, "drill", 15, 1_000);
    attempt.pauseEvents = [
      { at: 20_000, action: "pause" },
      { at: 80_000, action: "resume" },
    ];
    expect(attemptSummary(attempt)).toMatchObject({
      elapsedMs: 120_000,
      pauses: 1,
    });
    expect(attemptSummary(attempt).observations.join(" ")).toContain(
      "includes pauses",
    );
    expect(finishAttempt(attempt, "", "", 0).finishedAt).toBe(
      attempt.startedAt,
    );
  });
});

describe("run evidence and review", () => {
  it("retains immutable evidence with bounded output, errors, and latest 20 runs", () => {
    let attempt = createAttempt(question, "drill", 15, 1_000);
    const original = attempt;
    const evidence = baseline(attempt, {
      output: "o".repeat(9_000),
      message: "m".repeat(3_000),
    });
    evidence.results[0].error = "e".repeat(3_000);
    attempt = appendRun(attempt, evidence);
    expect(original.runs).toHaveLength(0);
    expect(evidence.output).toHaveLength(9_000);
    expect(attempt.runs[0].output).toHaveLength(8_000);
    expect(attempt.runs[0].message).toHaveLength(2_000);
    expect(attempt.runs[0].results[0].error).toHaveLength(2_000);
    evidence.tests[0].code = "changed";
    expect(attempt.runs[0].tests[0].code).toBe(question.baselineTests[0].code);
    for (let i = 2; i <= 25; i++) {
      attempt = appendRun(
        attempt,
        baseline(attempt, { id: `run-${i}`, at: i * 1_000 }),
      );
    }
    expect(attempt.runs).toHaveLength(20);
    expect(attempt.runs[0].id).toBe("run-6");
    expect(attempt.runs[19].id).toBe("run-25");
    attempt = appendRun(
      attempt,
      baseline(attempt, { id: "run-25", status: "failed" }),
    );
    expect(attempt.runs).toHaveLength(20);
    expect(attempt.runs[19].status).toBe("failed");
  });

  it("reports a current complete baseline and the earliest successful execution", () => {
    let attempt = createAttempt(question, "drill", 15, 1_000);
    attempt = appendRun(
      attempt,
      baseline(attempt, { id: "failed", at: 5_000, status: "failed" }),
    );
    attempt = appendRun(
      attempt,
      baseline(attempt, {
        id: "ordinary",
        at: 10_000,
        kind: "run",
        tests: [],
        results: [],
      }),
    );
    attempt = appendRun(attempt, baseline(attempt, { at: 15_000 }));
    attempt = finishAttempt(attempt, attempt.source, attempt.stdin, 20_000);
    expect(attemptSummary(attempt)).toMatchObject({
      elapsedMs: 19_000,
      firstRunnableMs: 9_000,
      baseline: { passed: 2, total: 2, current: true, status: "completed" },
      hintCount: 0,
      pauses: 0,
    });
    expect(attemptSummary(attempt).observations.join(" ")).toContain("2 of 2");
  });

  it("never counts scratch runs as supplied baseline evidence", () => {
    const attempt = createAttempt(question, "drill", 15, 1_000);
    const scratch = appendRun(attempt, baseline(attempt, { kind: "scratch" }));
    expect(attemptSummary(scratch).baseline).toBeNull();
    expect(attemptSummary(attempt).firstRunnableMs).toBeNull();
  });

  it.each(["source", "stdin"] as const)(
    "marks baseline stale after %s changes",
    (field) => {
      const attempt = createAttempt(question, "drill", 15, 1_000);
      const ran = appendRun(attempt, baseline(attempt));
      expect(
        attemptSummary({ ...ran, [field]: "changed" }).baseline?.current,
      ).toBe(false);
      expect(attemptSummary(ran).baseline?.current).toBe(true);
    },
  );

  it("requires original baseline IDs, code, and every distinct result", () => {
    const attempt = createAttempt(question, "drill", 15, 1_000);
    const evidence = baseline(attempt);
    const changes: Partial<RunEvidence>[] = [
      {
        tests: evidence.tests.slice(0, 1),
        results: evidence.results.slice(0, 1),
      },
      {
        tests: [
          { ...evidence.tests[0], code: "assert True" },
          evidence.tests[1],
        ],
      },
      {
        tests: [{ ...evidence.tests[0], id: "replacement" }, evidence.tests[1]],
      },
      { tests: [evidence.tests[0], evidence.tests[0]] },
      { results: evidence.results.slice(0, 1) },
      { results: [evidence.results[0], evidence.results[0]] },
      {
        results: [
          { ...evidence.results[0], id: "replacement" },
          evidence.results[1],
        ],
      },
      { status: "running" },
      { status: "timed-out" },
    ];
    for (const change of changes) {
      expect(
        attemptSummary(appendRun(attempt, { ...evidence, ...change })).baseline
          ?.current,
      ).toBe(false);
    }
    const reordered = {
      ...evidence,
      tests: [...evidence.tests].reverse(),
      results: [...evidence.results].reverse(),
    };
    expect(
      attemptSummary(appendRun(attempt, reordered)).baseline?.current,
    ).toBe(true);
  });

  it("distinguishes current failing cases from stale or partial evidence", () => {
    const attempt = createAttempt(question, "drill", 15, 1_000);
    const evidence = baseline(attempt, { status: "failed" });
    evidence.results[0] = {
      ...evidence.results[0],
      passed: false,
      error: "AssertionError",
    };
    const summary = attemptSummary(appendRun(attempt, evidence));
    expect(summary.baseline).toEqual({
      passed: 1,
      total: 2,
      current: true,
      status: "failed",
    });
    expect(summary.nextSteps.join(" ")).toContain("Inspect a failing case");
    const partial = attemptSummary(
      appendRun(attempt, { ...evidence, results: [] }),
    );
    expect(partial.baseline?.current).toBe(false);
    expect(partial.nextSteps.join(" ")).toContain("Rerun the complete");
  });

  it("cannot certify an empty baseline or an older passing run over a newer partial run", () => {
    let attempt = createAttempt(question, "drill", 15, 1_000);
    attempt = appendRun(attempt, baseline(attempt));
    attempt = appendRun(
      attempt,
      baseline(attempt, { id: "new", status: "stopped", results: [] }),
    );
    expect(attemptSummary(attempt).baseline).toMatchObject({
      passed: 0,
      current: false,
      status: "stopped",
    });
    const empty = createAttempt(
      { ...question, baselineTests: [] },
      "drill",
      15,
      1_000,
    );
    expect(
      attemptSummary(appendRun(empty, baseline(empty))).baseline?.current,
    ).toBe(false);
  });

  it("labels hints and communication as recorded or self-reported evidence", () => {
    const attempt = createAttempt(question, "mock", 60, 1_000);
    attempt.hintsUsed = [{ at: 10_000, source: "local", text: "Use self." }];
    attempt.selfCheck.explained = true;
    attempt.notes = "Clarify whether instances share state.";
    const summary = attemptSummary(finishAttempt(attempt, "", "", 20_000));
    expect(summary.hintCount).toBe(1);
    expect(summary.observations.join(" ")).toContain("self-reported");
    expect(summary.observations.join(" ")).toContain(
      "spoken reasoning was not recorded or evaluated",
    );
    expect(summary.observations.join(" ")).toContain("Written approach notes");
    expect(summary).not.toHaveProperty("score");
    expect(summary).not.toHaveProperty("mastery");
  });
});

describe("separate learning persistence", () => {
  it("opens an independent empty learning state and never touches existing session data", () => {
    entries.set("localpad.session.v1", "original workspace");
    expect(loadLearning()).toEqual({ state: defaultLearning() });
    expect(saveLearning(defaultLearning())).toBeNull();
    expect(entries.get("localpad.session.v1")).toBe("original workspace");
    expect([...entries.keys()]).toEqual(["localpad.session.v1", LEARNING_KEY]);
  });

  it("round trips an active attempt, full evidence, questions and processed commands", () => {
    let attempt = createAttempt(question, "drill", 15, 1_000);
    attempt.notes = "Consider independent instances.";
    attempt = appendRun(attempt, baseline(attempt));
    attempt.feedback = [
      {
        id: "review-1",
        attemptId: attempt.id,
        reviewer: "Test coach",
        createdAt: 20_000,
        summary: "Review against supplied tests",
        strengths: ["State is independent"],
        improvements: ["Add a reset test"],
        nextPractice: "Composition",
        evidenceRunIds: ["run-1"],
      },
    ];
    const state = {
      ...defaultLearning(),
      activeAttemptId: attempt.id,
      attempts: [attempt],
      acceptedQuestions: [question],
      processedCommandIds: ["command-1"],
    };
    expect(saveLearning(state)).toBeNull();
    expect(loadLearning()).toEqual({ state });
  });

  it("bounds saved history without mutating memory or evicting the active attempt", () => {
    const state = defaultLearning();
    state.attempts = Array.from({ length: 35 }, (_, i) =>
      createAttempt(question, "drill", 15, i * 1_000),
    );
    state.activeAttemptId = state.attempts[0].id;
    state.acceptedQuestions = Array.from({ length: 25 }, (_, i) => ({
      ...question,
      id: `question-${i}`,
    }));
    state.processedCommandIds = Array.from(
      { length: 110 },
      (_, i) => `command-${i}`,
    );
    const snapshot = JSON.stringify(state);
    expect(saveLearning(state)).toBeNull();
    expect(JSON.stringify(state)).toBe(snapshot);
    const saved = loadLearning().state;
    expect(saved.attempts).toHaveLength(30);
    expect(
      saved.attempts.some((attempt) => attempt.id === state.activeAttemptId),
    ).toBe(true);
    expect(
      saved.attempts.some((attempt) => attempt.id === state.attempts[34].id),
    ).toBe(true);
    expect(
      saved.attempts.some((attempt) => attempt.id === state.attempts[1].id),
    ).toBe(false);
    expect(saved.acceptedQuestions).toHaveLength(20);
    expect(saved.acceptedQuestions[0].id).toBe("question-5");
    expect(saved.processedCommandIds).toHaveLength(100);
    expect(saved.processedCommandIds[0]).toBe("command-10");
  });

  it("also bounds run history loaded from an older oversized valid entry", () => {
    const attempt = createAttempt(question, "drill", 15, 1_000);
    attempt.runs = Array.from({ length: 25 }, (_, i) =>
      baseline(attempt, {
        id: `run-${i}`,
        output: "x".repeat(9_000),
        message: "m".repeat(3_000),
      }),
    );
    const raw = JSON.stringify({ ...defaultLearning(), attempts: [attempt] });
    entries.set(LEARNING_KEY, raw);
    const loaded = loadLearning();
    expect(loaded.warning).toBeUndefined();
    expect(loaded.state.attempts[0].runs).toHaveLength(20);
    expect(loaded.state.attempts[0].runs[0].output).toHaveLength(8_000);
    expect(loaded.state.attempts[0].runs[0].message).toHaveLength(2_000);
    expect(entries.get(LEARNING_KEY)).toBe(raw);
  });

  it.each([
    "not JSON",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...defaultLearning(), schemaVersion: 2 }),
  ])("preserves malformed raw storage: %s", (raw) => {
    entries.set(LEARNING_KEY, raw);
    expect(loadLearning()).toMatchObject({
      state: defaultLearning(),
      warning: expect.any(String),
    });
    expect(entries.get(LEARNING_KEY)).toBe(raw);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("rejects malformed nested data, duplicate IDs, and dangling active IDs", () => {
    const attempt = createAttempt(question, "drill", 15, 1_000);
    const malformed = [
      { ...defaultLearning(), activeAttemptId: "missing" },
      { ...defaultLearning(), attempts: [attempt, attempt] },
      { ...defaultLearning(), processedCommandIds: ["same", "same"] },
      { ...defaultLearning(), acceptedQuestions: [question, question] },
      { ...defaultLearning(), attempts: [{ ...attempt, source: 3 }] },
      { ...defaultLearning(), attempts: [{ ...attempt, startedAt: -1 }] },
      { ...defaultLearning(), attempts: [{ ...attempt, finishedAt: 0 }] },
      { ...defaultLearning(), attempts: [{ ...attempt, durationMs: 0 }] },
      {
        ...defaultLearning(),
        attempts: [{ ...attempt, pauseEvents: [{ at: 1, action: "restart" }] }],
      },
      {
        ...defaultLearning(),
        attempts: [{ ...attempt, question: { ...question, provenance: {} } }],
      },
      {
        ...defaultLearning(),
        attempts: [
          { ...attempt, runs: [{ ...baseline(attempt), results: [null] }] },
        ],
      },
      {
        ...defaultLearning(),
        attempts: [
          { ...attempt, runs: [{ ...baseline(attempt), status: "invented" }] },
        ],
      },
      {
        ...defaultLearning(),
        attempts: [{ ...attempt, selfCheck: { clarified: "yes" } }],
      },
    ];
    for (const state of malformed) {
      const raw = JSON.stringify(state);
      entries.set(LEARNING_KEY, raw);
      expect(loadLearning().warning).toBeTruthy();
      expect(entries.get(LEARNING_KEY)).toBe(raw);
    }
  });

  it("reports storage failures and preserves current code and evidence in memory", () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadLearning().warning).toBeTruthy();
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const attempt = createAttempt(question, "drill", 15, 1_000);
    attempt.source = "valuable code";
    attempt.notes = "valuable notes";
    const state = {
      ...defaultLearning(),
      attempts: [appendRun(attempt, baseline(attempt))],
    };
    const snapshot = JSON.stringify(state);
    expect(saveLearning(state)).toContain("Your work is still here");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
