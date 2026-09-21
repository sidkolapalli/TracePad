import { describe, expect, it } from "vitest";
import type { Attempt, QuestionPackage, RunEvidence } from "./types";
import {
  buildSRSMap,
  dueTopics,
  scoreAttempt,
  updateSRS,
  type SRSMap,
  type SRSRecord,
} from "./srs";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

const question: QuestionPackage = {
  schemaVersion: 1,
  id: "q1",
  topicId: "python.oop.instance-state",
  level: "foundation",
  title: "Counter",
  prompt: "Implement a counter.",
  starterCode: "class Counter:\n    pass\n",
  examples: [],
  constraints: [],
  baselineTests: [
    { id: "t1", name: "Initial state", code: "assert Counter().value == 0" },
    { id: "t2", name: "Independent", code: "assert Counter() is not Counter()" },
  ],
  hints: ["Initialize on self."],
  referenceSolution: "class Counter:\n    def __init__(self):\n        self.value = 0\n",
  learningObjectives: ["Instance state"],
  recommendedMinutes: 15,
  provenance: { kind: "local-template", generator: "Tracepad", templateId: "counter", seed: 1 },
};

/** Build a minimal finished attempt. Override any field as needed. */
function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "a1",
    question,
    mode: "drill",
    durationMs: 15 * 60_000,
    startedAt: NOW,
    finishedAt: NOW + 10 * 60_000,
    deadline: NOW + 15 * 60_000,
    source: "class Counter:\n    def __init__(self):\n        self.value = 0\n",
    files: {},
    activeFile: "main.py",
    liveInterviewer: false,
    stdin: "",
    scratchTests: [],
    notes: "",
    hintsUsed: [],
    pauseEvents: [],
    runs: [],
    selfCheck: { clarified: false, explained: false, respondedToHints: false },
    feedback: [],
    ...overrides,
  };
}

/**
 * Build a baseline RunEvidence against a given question.
 * Pass `source` and `stdin` explicitly to match the attempt being scored.
 * `passed` is a boolean array aligned with q.baselineTests.
 */
function baselineRun(
  q: QuestionPackage,
  passed: boolean[],
  {
    id = "run-1",
    at = NOW + 5_000,
    source = "class Counter:\n    def __init__(self):\n        self.value = 0\n",
    stdin = "",
    ...rest
  }: Partial<RunEvidence> = {},
): RunEvidence {
  return {
    id,
    at,
    kind: "baseline",
    source,
    stdin,
    tests: structuredClone(q.baselineTests),
    results: q.baselineTests.map((test, i) => ({
      id: test.id,
      name: test.name,
      passed: passed[i] ?? false,
      elapsedMs: 1,
    })),
    status: "completed",
    elapsedMs: 2,
    output: "",
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// scoreAttempt
// ---------------------------------------------------------------------------

describe("scoreAttempt", () => {
  it("returns null when no baseline run exists", () => {
    expect(scoreAttempt(makeAttempt())).toBeNull();
  });

  it("returns 5 for all passing, no hints, no overtime", () => {
    const attempt = makeAttempt({ runs: [baselineRun(question, [true, true])] });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  it("reduces quality by 1 per two hints used", () => {
    const attempt = makeAttempt({
      runs: [baselineRun(question, [true, true])],
      hintsUsed: [
        { text: "hint 1", at: NOW + 1000, source: "local" },
        { text: "hint 2", at: NOW + 2000, source: "local" },
      ],
    });
    expect(scoreAttempt(attempt)).toBe(4);
  });

  it("one hint does not penalise quality", () => {
    const attempt = makeAttempt({
      runs: [baselineRun(question, [true, true])],
      hintsUsed: [{ text: "hint", at: NOW + 1000, source: "local" }],
    });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  it("reduces quality by 1 for overtime > 5 minutes", () => {
    const attempt = makeAttempt({
      deadline: NOW + 15 * 60_000,
      finishedAt: NOW + 21 * 60_000,
      runs: [baselineRun(question, [true, true])],
    });
    expect(scoreAttempt(attempt)).toBe(4);
  });

  it("does not penalise for overtime within 5 minutes", () => {
    const attempt = makeAttempt({
      deadline: NOW + 15 * 60_000,
      finishedAt: NOW + 19 * 60_000, // 4 min over
      runs: [baselineRun(question, [true, true])],
    });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  it("does not penalise for overtime at exactly 5 minutes", () => {
    const attempt = makeAttempt({
      deadline: NOW + 15 * 60_000,
      finishedAt: NOW + 20 * 60_000, // exactly 5 min over — boundary is strict >
      runs: [baselineRun(question, [true, true])],
    });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  it("penalises for overtime at 5 minutes and 1 ms", () => {
    const attempt = makeAttempt({
      deadline: NOW + 15 * 60_000,
      finishedAt: NOW + 20 * 60_000 + 1, // one ms past the threshold
      runs: [baselineRun(question, [true, true])],
    });
    expect(scoreAttempt(attempt)).toBe(4);
  });

  // Pass-rate bands — verified for 2-test and 5-test suites

  it("returns 0 for 2-test suite with 0/2 passing", () => {
    const attempt = makeAttempt({ runs: [baselineRun(question, [false, false])] });
    expect(scoreAttempt(attempt)).toBe(0);
  });

  it("returns 2 for 2-test suite with 1/2 passing (50% < 60% threshold)", () => {
    // With 2 tests the 60% band is unreachable (1/2 = 50%).
    // Score should be 2 (not 1 as the naive threshold would give), so EF
    // damage is proportionate to partial success.
    const attempt = makeAttempt({ runs: [baselineRun(question, [true, false])] });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("returns 3 for 5-test suite with 3/5 passing (60% threshold)", () => {
    const q5 = {
      ...question,
      baselineTests: [
        { id: "t1", name: "a", code: "" },
        { id: "t2", name: "b", code: "" },
        { id: "t3", name: "c", code: "" },
        { id: "t4", name: "d", code: "" },
        { id: "t5", name: "e", code: "" },
      ],
    };
    const attempt = makeAttempt({
      question: q5,
      runs: [baselineRun(q5, [true, true, true, false, false])],
    });
    expect(scoreAttempt(attempt)).toBe(3);
  });

  it("returns 4 for 5-test suite with 4/5 passing (80% threshold)", () => {
    const q5 = {
      ...question,
      baselineTests: [
        { id: "t1", name: "a", code: "" },
        { id: "t2", name: "b", code: "" },
        { id: "t3", name: "c", code: "" },
        { id: "t4", name: "d", code: "" },
        { id: "t5", name: "e", code: "" },
      ],
    };
    const attempt = makeAttempt({
      question: q5,
      runs: [baselineRun(q5, [true, true, true, true, false])],
    });
    expect(scoreAttempt(attempt)).toBe(4);
  });

  it("returns 1 for a low pass rate (1 of 4 tests, 25%)", () => {
    const q4 = {
      ...question,
      baselineTests: [
        { id: "t1", name: "a", code: "" },
        { id: "t2", name: "b", code: "" },
        { id: "t3", name: "c", code: "" },
        { id: "t4", name: "d", code: "" },
      ],
    };
    const attempt = makeAttempt({
      question: q4,
      runs: [baselineRun(q4, [true, false, false, false])],
    });
    expect(scoreAttempt(attempt)).toBe(1);
  });

  it("clamps quality to minimum 0", () => {
    const attempt = makeAttempt({
      runs: [baselineRun(question, [false, false])],
      hintsUsed: [
        { text: "h1", at: NOW + 1000, source: "local" },
        { text: "h2", at: NOW + 2000, source: "local" },
        { text: "h3", at: NOW + 3000, source: "local" },
      ],
    });
    expect(scoreAttempt(attempt)).toBe(0);
  });

  it("returns 3 when no baseline tests are defined", () => {
    const noTests = { ...question, baselineTests: [] };
    const run: RunEvidence = {
      ...baselineRun(noTests, []),
      tests: [],
      results: [],
    };
    const attempt = makeAttempt({ question: noTests, runs: [run] });
    expect(scoreAttempt(attempt)).toBe(3);
  });

  it("applies hint penalty to 0-test quality (3 − 1 hint-pair = 2)", () => {
    // total === 0 → quality starts at 3. Two hints → floor(2/2)=1 penalty → 2.
    // Verifies hint/overtime penalties are applied even on the zero-test path.
    const noTests = { ...question, baselineTests: [] };
    const run: RunEvidence = {
      ...baselineRun(noTests, []),
      tests: [],
      results: [],
    };
    const attempt = makeAttempt({
      question: noTests,
      runs: [run],
      hintsUsed: [
        { text: "h1", at: NOW + 1000, source: "local" },
        { text: "h2", at: NOW + 2000, source: "local" },
      ],
    });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  // Baseline run ordering

  it("uses the last baseline run by array position, not by timestamp", () => {
    // The passing run has a later `at` but is first in the array.
    // The failing run has an earlier `at` but is last in the array.
    // scoreAttempt must pick the last-in-array run (the failing one).
    const passRunFirst = baselineRun(question, [true, true], { id: "run-1", at: NOW + 10_000 });
    const failRunLast = baselineRun(question, [false, false], { id: "run-2", at: NOW + 5_000 });
    const attempt = makeAttempt({ runs: [passRunFirst, failRunLast] });
    expect(scoreAttempt(attempt)).toBe(0);
  });

  it("uses the last baseline run when multiple baseline runs exist in order", () => {
    const failFirst = baselineRun(question, [false, false], { id: "run-1" });
    const passLast = baselineRun(question, [true, true], { id: "run-2", at: NOW + 10_000 });
    const attempt = makeAttempt({ runs: [failFirst, passLast] });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  // Stale baseline detection

  it("caps quality at 2 when the baseline run source does not match submitted code", () => {
    // Run was against old source; attempt.source has the final code.
    const staleRun = baselineRun(question, [true, true], { source: "old source" });
    const attempt = makeAttempt({
      source: "class Counter:\n    def __init__(self):\n        self.value = 0\n",
      runs: [staleRun],
    });
    // Computed quality would be 5, but stale cap brings it to 2.
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("caps quality at 2 when the baseline run stdin differs from submitted stdin", () => {
    const staleRun = baselineRun(question, [true, true], { stdin: "different input" });
    const attempt = makeAttempt({ stdin: "", runs: [staleRun] });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("does not cap quality when the baseline run matches the submitted code", () => {
    const currentRun = baselineRun(question, [true, true]);
    const attempt = makeAttempt({ runs: [currentRun] });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  it("caps a stale run at min(quality, 2) — quality 0 or 1 can still occur when already below the cap", () => {
    const q4 = {
      ...question,
      baselineTests: [
        { id: "t1", name: "a", code: "" },
        { id: "t2", name: "b", code: "" },
        { id: "t3", name: "c", code: "" },
        { id: "t4", name: "d", code: "" },
      ],
    };
    // 1/4 tests pass → passRate 25% → quality 1.
    // Stale cap is min(1, 2) = 1: cap has no additional effect since quality
    // is already below 2. Stale runs can produce quality 0 or 1, not only 2.
    const staleRun = baselineRun(q4, [true, false, false, false], { source: "old" });
    const attempt = makeAttempt({ question: q4, runs: [staleRun] });
    expect(scoreAttempt(attempt)).toBe(1);
  });

  it("caps quality at 2 when only files differ between run and submitted attempt", () => {
    const currentRun = baselineRun(question, [true, true], {
      files: { "helper.py": "def add(a, b): return a + b" },
    });
    const attempt = makeAttempt({
      files: { "helper.py": "def add(a, b): return a - b" }, // edited after running
      runs: [currentRun],
    });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("does not cap quality when files match between run and submitted attempt", () => {
    const sharedFiles = { "helper.py": "def add(a, b): return a + b" };
    const currentRun = baselineRun(question, [true, true], { files: sharedFiles });
    const attempt = makeAttempt({ files: { ...sharedFiles }, runs: [currentRun] });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  it("caps quality at 2 when results are incomplete (mid-run crash)", () => {
    // 5-test question, but only 3 results returned (runner crashed).
    // isBaselineCurrent detects results.length !== canonical.length and treats
    // the run as unverified, capping quality at 2.
    const q5 = {
      ...question,
      baselineTests: [
        { id: "t1", name: "a", code: "" },
        { id: "t2", name: "b", code: "" },
        { id: "t3", name: "c", code: "" },
        { id: "t4", name: "d", code: "" },
        { id: "t5", name: "e", code: "" },
      ],
    };
    const partialRun: RunEvidence = {
      id: "run-1",
      at: NOW + 5_000,
      kind: "baseline",
      source: "class Counter:\n    def __init__(self):\n        self.value = 0\n",
      stdin: "",
      tests: structuredClone(q5.baselineTests),
      results: [
        { id: "t1", name: "a", passed: true, elapsedMs: 1 },
        { id: "t2", name: "b", passed: true, elapsedMs: 1 },
        { id: "t3", name: "c", passed: true, elapsedMs: 1 },
        // t4 and t5 never ran
      ],
      status: "failed",
      elapsedMs: 2,
      output: "",
    };
    const attempt = makeAttempt({ question: q5, runs: [partialRun] });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("does not count results whose IDs are not in the canonical test list", () => {
    // run.results contains an extra result with id "t-extra" that is not in
    // baselineTests. Only t1 and t2 (the canonical tests) should be counted.
    // Both t1 and t2 pass, so quality should be 5, not inflated by t-extra.
    const runWithExtra: RunEvidence = {
      ...baselineRun(question, [true, true]),
      results: [
        { id: "t1", name: "Initial state", passed: true, elapsedMs: 1 },
        { id: "t2", name: "Independent", passed: true, elapsedMs: 1 },
        { id: "t-extra", name: "ghost", passed: true, elapsedMs: 1 },
      ],
      // results.length (3) !== canonical.length (2) → stale cap applies
    };
    const attempt = makeAttempt({ runs: [runWithExtra] });
    // isBaselineCurrent: results.length (3) !== canonical.length (2) → cap at 2
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("caps quality at 2 when results contain an ID not in canonical (isBaselineCurrent rejects it)", () => {
    // results has the right count (2) but one ID is "t-wrong" instead of "t2".
    // isBaselineCurrent: run.results.every(r => canonical.some(c => c.id === r.id))
    // fails because "t-wrong" is not in canonical. The stale cap min(quality, 2)
    // applies. The numeric result (2) coincides with the 50% pass-rate band but
    // comes from the stale cap — this test is not a test of the pass-rate filter.
    const runWithWrongId: RunEvidence = {
      ...baselineRun(question, [true, true]),
      results: [
        { id: "t1", name: "Initial state", passed: true, elapsedMs: 1 },
        { id: "t-wrong", name: "different", passed: true, elapsedMs: 1 },
      ],
    };
    const attempt = makeAttempt({ runs: [runWithWrongId] });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("caps quality at 2 when source is stale on a 0-test question", () => {
    // total === 0 used to early-return 3 before the stale check, so a
    // mismatched source would silently earn quality 3 and grow the interval.
    // Now the stale cap applies: min(3, 2) = 2.
    const noTests = { ...question, baselineTests: [] };
    const staleRun: RunEvidence = {
      ...baselineRun(noTests, []),
      source: "stale source",
      tests: [],
      results: [],
    };
    const attempt = makeAttempt({ question: noTests, runs: [staleRun] });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("caps quality at 2 when results contain a duplicate ID (inflation prevention)", () => {
    // run.results has t1 twice instead of t1+t2. Length matches but t1 is
    // duplicated — without the uniqueness guard in isBaselineCurrent, both
    // copies of t1 would be counted as passed, giving quality 5 instead of 2.
    const runWithDupe: RunEvidence = {
      ...baselineRun(question, [true, true]),
      results: [
        { id: "t1", name: "Initial state", passed: true, elapsedMs: 1 },
        { id: "t1", name: "Initial state dupe", passed: true, elapsedMs: 1 },
      ],
    };
    const attempt = makeAttempt({ runs: [runWithDupe] });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("caps quality at 2 when baseline run status is stopped (partial/cancelled results)", () => {
    // "stopped" means the user cancelled the run — results may be incomplete.
    // isBaselineCurrent only accepts "completed" and "failed".
    const stoppedRun = baselineRun(question, [true, true], {
      status: "stopped",
    });
    const attempt = makeAttempt({ runs: [stoppedRun] });
    expect(scoreAttempt(attempt)).toBe(2);
  });

  it("returns quality without overtime penalty when finishedAt is null (unfinished attempt)", () => {
    // finishedAt === null: attempt is still in progress. The overtime check
    // is guarded by attempt.finishedAt !== null, so it is skipped.
    // buildSRSMap pre-filters finished attempts, so null-finishedAt never
    // reaches buildSRSMap; but this test documents the contract explicitly.
    const attempt = makeAttempt({
      finishedAt: null,
      runs: [baselineRun(question, [true, true])],
    });
    expect(scoreAttempt(attempt)).toBe(5);
  });

  it("stale cap on a quality-0 run returns 0, not a negative value", () => {
    // All tests fail → quality 0 before penalties. Stale source → cap applies:
    // min(0, 2) = 0. Verifies cap does not elevate 0 and clamp holds at 0.
    const staleRun = baselineRun(question, [false, false], { source: "old" });
    const attempt = makeAttempt({ runs: [staleRun] });
    expect(scoreAttempt(attempt)).toBe(0);
  });

  it("stale cap applies after hint and overtime penalties (3→2)", () => {
    // quality: 5 (all pass) − 1 (2 hints) − 1 (6 min over) = 3 → min(3,2) = 2
    const staleRun = baselineRun(question, [true, true], { source: "old" });
    const attempt = makeAttempt({
      deadline: NOW + 15 * 60_000,
      finishedAt: NOW + 21 * 60_000,
      hintsUsed: [
        { text: "h1", at: NOW + 1000, source: "local" },
        { text: "h2", at: NOW + 2000, source: "local" },
      ],
      runs: [staleRun],
    });
    expect(scoreAttempt(attempt)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// updateSRS
// ---------------------------------------------------------------------------

describe("updateSRS", () => {
  const initial: SRSRecord = {
    topicId: "python.oop.instance-state",
    n: 0,
    ef: 2.5,
    intervalDays: 0,
    nextReview: 0,
    lastAttemptAt: 0,
    lastQuality: 0,
    lastLevel: "foundation",
    lastRecommendedMinutes: 15,
  };

  it("first success schedules 1-day interval", () => {
    const result = updateSRS(initial, 5, NOW);
    expect(result.intervalDays).toBe(1);
    expect(result.n).toBe(1);
    expect(result.nextReview).toBe(NOW + DAY);
  });

  it("second success schedules 6-day interval", () => {
    const after1 = updateSRS(initial, 5, NOW);
    const after2 = updateSRS(after1, 5, NOW + DAY);
    expect(after2.intervalDays).toBe(6);
    expect(after2.n).toBe(2);
  });

  it("third success uses EF multiplier", () => {
    const after1 = updateSRS(initial, 5, NOW);
    const after2 = updateSRS(after1, 5, NOW + DAY);
    const after3 = updateSRS(after2, 5, NOW + 7 * DAY);
    expect(after3.intervalDays).toBe(Math.round(6 * after2.ef));
    expect(after3.n).toBe(3);
  });

  it("intervalDays=0 with n>=2 produces intervalDays>=1 (Math.max guard)", () => {
    // A record with n=2 but intervalDays=0 would produce nextReview=at without
    // the Math.max(1,...) guard, making the topic instantly due again every tick.
    const corrupt: SRSRecord = { ...initial, n: 2, intervalDays: 0, ef: 2.5 };
    const result = updateSRS(corrupt, 5, NOW);
    expect(result.intervalDays).toBeGreaterThanOrEqual(1);
    expect(result.nextReview).toBeGreaterThan(NOW);
  });

  it("quality < 3 resets interval to 1 day and n to 0", () => {
    const after1 = updateSRS(initial, 5, NOW);
    const after2 = updateSRS(after1, 5, NOW + DAY);
    const reset = updateSRS(after2, 1, NOW + 7 * DAY);
    expect(reset.n).toBe(0);
    expect(reset.intervalDays).toBe(1);
    expect(reset.nextReview).toBe(NOW + 7 * DAY + DAY);
  });

  it("quality exactly 2 resets interval to 1 day and n to 0 (reset boundary)", () => {
    // quality=2 is < 3, so it must reset, not advance the interval.
    // Tests that the reset boundary is at 3, not 2.
    const after1 = updateSRS(initial, 5, NOW);
    const after2 = updateSRS(after1, 5, NOW + DAY);
    const reset = updateSRS(after2, 2, NOW + 7 * DAY);
    expect(reset.n).toBe(0);
    expect(reset.intervalDays).toBe(1);
    expect(reset.nextReview).toBe(NOW + 7 * DAY + DAY);
  });

  it("EF never drops below 1.3", () => {
    let record = initial;
    for (let i = 0; i < 20; i++) {
      record = updateSRS(record, 0, NOW + i * DAY);
    }
    expect(record.ef).toBeGreaterThanOrEqual(1.3);
  });

  it("quality 5 increases EF, quality 4 is EF-neutral, quality 3 decreases EF", () => {
    const perfect = updateSRS(initial, 5, NOW);
    const neutral = updateSRS(initial, 4, NOW);
    const reduced = updateSRS(initial, 3, NOW);
    expect(perfect.ef).toBeGreaterThan(2.5);
    expect(neutral.ef).toBeCloseTo(2.5, 5);
    expect(reduced.ef).toBeLessThan(2.5);
  });
});

// ---------------------------------------------------------------------------
// buildSRSMap
// ---------------------------------------------------------------------------

describe("buildSRSMap", () => {
  it("returns empty map for no attempts", () => {
    expect(buildSRSMap([])).toEqual({});
  });

  it("ignores unfinished attempts", () => {
    const attempt = makeAttempt({ finishedAt: null });
    expect(buildSRSMap([attempt])).toEqual({});
  });

  it("does not create an SRS record for a finished attempt with no runs at all", () => {
    const attempt = makeAttempt({ runs: [] });
    expect(buildSRSMap([attempt])).toEqual({});
  });

  it("does not create an SRS record for a finished attempt with only non-baseline runs", () => {
    // A run with kind "run" (scratch/validation) is not a baseline run.
    // scoreAttempt returns null → buildSRSMap must skip rather than inserting
    // a quality-0 record that would reset any earned SRS interval.
    const scratchRun: RunEvidence = {
      ...baselineRun(question, [true, true]),
      kind: "run",
    };
    const attempt = makeAttempt({ runs: [scratchRun] });
    expect(buildSRSMap([attempt])).toEqual({});
  });

  it("builds a record for a finished attempt's topic", () => {
    const attempt = makeAttempt({ runs: [baselineRun(question, [true, true])] });
    const map = buildSRSMap([attempt]);
    expect(Object.keys(map)).toEqual(["python.oop.instance-state"]);
    expect(map["python.oop.instance-state"].n).toBe(1);
  });

  it("accumulates multiple attempts on the same topic in chronological order regardless of input order", () => {
    const a1 = makeAttempt({
      id: "a1",
      startedAt: NOW,
      finishedAt: NOW + 10 * 60_000,
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + 2 * DAY,
      finishedAt: NOW + 2 * DAY + 10 * 60_000,
      runs: [baselineRun(question, [true, true])],
    });
    const map = buildSRSMap([a2, a1]); // intentionally out of order
    expect(map["python.oop.instance-state"].n).toBe(2);
    expect(map["python.oop.instance-state"].intervalDays).toBe(6);
  });

  it("stores the level from the most recent attempt", () => {
    const a1 = makeAttempt({
      question: { ...question, level: "foundation" },
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + DAY,
      finishedAt: NOW + DAY + 10 * 60_000,
      question: { ...question, level: "applied" },
      runs: [baselineRun(question, [true, true])],
    });
    const map = buildSRSMap([a1, a2]);
    expect(map["python.oop.instance-state"].lastLevel).toBe("applied");
  });

  it("sorts by finishedAt, not startedAt, so nextReview timestamps are consistent", () => {
    // a1 starts first but finishes second; a2 starts second but finishes first.
    // Processing should follow finishedAt order (a2, then a1) so that each
    // nextReview is anchored to the actual completion time.
    const a1 = makeAttempt({
      id: "a1",
      startedAt: NOW,
      finishedAt: NOW + 2 * DAY, // finishes later
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + 1 * 60_000, // starts a minute later
      finishedAt: NOW + 1 * DAY,   // but finishes first
      runs: [baselineRun(question, [true, true])],
    });
    const map = buildSRSMap([a1, a2]);
    const record = map["python.oop.instance-state"];
    // After processing a2 (n=0→1, interval=1d, nextReview=NOW+1d+1d=NOW+2d),
    // then a1 (n=1→2, interval=6d, nextReview=NOW+2d+6d=NOW+8d).
    expect(record.n).toBe(2);
    expect(record.nextReview).toBe(NOW + 2 * DAY + 6 * DAY);
  });

  it("uses attempt id as secondary sort key when finishedAt timestamps are equal", () => {
    // When two attempts finish at exactly the same millisecond, the secondary
    // sort by id (localeCompare) makes the order deterministic — "a1" < "a2"
    // alphabetically, so a1 is processed first.
    const sameFinish = NOW + 10 * 60_000;
    const a1 = makeAttempt({
      id: "a1",
      finishedAt: sameFinish,
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + 1000,
      finishedAt: sameFinish,
      runs: [baselineRun(question, [true, true])],
    });
    // Both pass. a1 (n=0→1, interval=1d), then a2 (n=1→2, interval=6d).
    const map = buildSRSMap([a2, a1]); // reversed input order — sort must fix it
    expect(map["python.oop.instance-state"].n).toBe(2);
    expect(map["python.oop.instance-state"].intervalDays).toBe(6);
  });

  it("stores lastRecommendedMinutes from the most recent attempt", () => {
    const a1 = makeAttempt({
      question: { ...question, recommendedMinutes: 15 },
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + DAY,
      finishedAt: NOW + DAY + 10 * 60_000,
      question: { ...question, recommendedMinutes: 20 },
      runs: [baselineRun(question, [true, true])],
    });
    const map = buildSRSMap([a1, a2]);
    expect(map["python.oop.instance-state"].lastRecommendedMinutes).toBe(20);
  });

  it("lastRecommendedMinutes is not updated when a later attempt is skipped (null quality)", () => {
    // a1: baseline run present → scored → lastRecommendedMinutes = 20
    // a2: no baseline run → scoreAttempt returns null → skipped by buildSRSMap
    // The final record must still reflect a1's recommendedMinutes (20), not a2's (99).
    const a1 = makeAttempt({
      question: { ...question, recommendedMinutes: 20 },
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + DAY,
      finishedAt: NOW + DAY + 10 * 60_000,
      question: { ...question, recommendedMinutes: 99 },
      runs: [],
    });
    const map = buildSRSMap([a1, a2]);
    expect(map["python.oop.instance-state"].lastRecommendedMinutes).toBe(20);
  });

  it("resets n and intervalDays when a later attempt scores quality 2", () => {
    // a1: all pass → quality 5 → n=1, intervalDays=1
    // a2: 1/2 pass (50% → quality 2) → reset → n=0, intervalDays=1
    const a1 = makeAttempt({
      id: "a1",
      finishedAt: NOW + 10 * 60_000,
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + 2 * DAY,
      finishedAt: NOW + 2 * DAY + 10 * 60_000,
      deadline: NOW + 2 * DAY + 15 * 60_000, // finish within allotted time
      runs: [baselineRun(question, [true, false])],
    });
    const map = buildSRSMap([a1, a2]);
    const record = map["python.oop.instance-state"];
    expect(record.n).toBe(0);
    expect(record.intervalDays).toBe(1);
    expect(record.lastQuality).toBe(2);
  });

  it("builds separate records for different topics", () => {
    const q2 = { ...question, topicId: "python.oop.validation" };
    const a1 = makeAttempt({ runs: [baselineRun(question, [true, true])] });
    const a2 = makeAttempt({
      id: "a2",
      question: q2,
      runs: [baselineRun(q2, [true, true])],
    });
    const map = buildSRSMap([a1, a2]);
    expect(Object.keys(map).sort()).toEqual([
      "python.oop.instance-state",
      "python.oop.validation",
    ]);
  });

  it("seeds from checkpoint so an evicted attempt's contribution is not lost", () => {
    // In startQuestion, only the evicted attempt goes into the checkpoint.
    // Checkpoint = buildSRSMap([a1_evicted], {}); retained = [a2].
    // Without the checkpoint, a2 alone gives n=1. With it, a1's contribution
    // (via checkpoint) stacks so n=2.
    const a1 = makeAttempt({
      id: "a1",
      startedAt: NOW,
      finishedAt: NOW + 10 * 60_000,
      deadline: NOW + 15 * 60_000,
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + DAY,
      finishedAt: NOW + DAY + 10 * 60_000,
      deadline: NOW + DAY + 15 * 60_000,
      runs: [baselineRun(question, [true, true], { id: "run-2", at: NOW + DAY + 5_000 })],
    });

    const checkpoint = buildSRSMap([a1], {}); // only evicted attempt

    const mapWithout = buildSRSMap([a2], {});
    expect(mapWithout["python.oop.instance-state"].n).toBe(1);

    const mapWith = buildSRSMap([a2], checkpoint);
    expect(mapWith["python.oop.instance-state"].n).toBe(2);
    expect(mapWith["python.oop.instance-state"].intervalDays).toBe(6);
  });

  it("skips retained attempts that are strictly older than the checkpoint's lastAttemptAt", () => {
    // If an older attempt somehow appears in the retained list after a newer one
    // was checkpointed, it should be skipped (lastAttemptAt > at → skip).
    const a1 = makeAttempt({
      id: "a1",
      startedAt: NOW,
      finishedAt: NOW + 10 * 60_000,
      deadline: NOW + 15 * 60_000,
      runs: [baselineRun(question, [true, true])],
    });
    const a2 = makeAttempt({
      id: "a2",
      startedAt: NOW + DAY,
      finishedAt: NOW + DAY + 10 * 60_000,
      deadline: NOW + DAY + 15 * 60_000,
      runs: [baselineRun(question, [true, true], { id: "run-2", at: NOW + DAY + 5_000 })],
    });

    // Checkpoint has a2 already incorporated (lastAttemptAt = a2.finishedAt).
    const checkpoint = buildSRSMap([a1, a2], {});

    // Processing [a1] against this checkpoint: a1.finishedAt < lastAttemptAt → skipped.
    const map = buildSRSMap([a1], checkpoint);
    expect(map["python.oop.instance-state"]).toEqual(
      checkpoint["python.oop.instance-state"],
    );
  });

  it("preserves the SRS record when the topic's only attempt is evicted by the 30-entry cap", () => {
    // Regression: when a topic's last attempt is evicted by MAX_ATTEMPTS,
    // its SRS record must survive via the checkpoint.
    // startQuestion evicts [firstAttempt] → checkpoint = buildSRSMap([firstAttempt], {}).
    // retained = 29 filler attempts on a different topic.
    const other = { ...question, topicId: "python.oop.validation" };
    const firstAttempt = makeAttempt({
      id: "a0",
      startedAt: NOW,
      finishedAt: NOW + 10 * 60_000,
      deadline: NOW + 15 * 60_000,
      runs: [baselineRun(question, [true, true], { id: "run-0" })],
    });
    const fillers = Array.from({ length: 29 }, (_, i) =>
      makeAttempt({
        id: `f${i}`,
        question: other,
        startedAt: NOW + (i + 1) * DAY,
        finishedAt: NOW + (i + 1) * DAY + 10 * 60_000,
        deadline: NOW + (i + 1) * DAY + 15 * 60_000,
        runs: [baselineRun(other, [true, true], { id: `run-f${i}` })],
      }),
    );

    // Checkpoint captures only the evicted attempt.
    const checkpoint = buildSRSMap([firstAttempt], {});

    // Without checkpoint: firstAttempt's topic is gone.
    expect(buildSRSMap(fillers, {})["python.oop.instance-state"]).toBeUndefined();

    // With checkpoint: record is preserved and matches what a full recompute gives.
    const mapWith = buildSRSMap(fillers, checkpoint);
    expect(mapWith["python.oop.instance-state"]).toBeDefined();
    expect(mapWith["python.oop.instance-state"].n).toBe(1);
    expect(mapWith["python.oop.instance-state"].lastQuality).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// dueTopics
// ---------------------------------------------------------------------------

describe("dueTopics", () => {
  it("returns nothing when no records exist", () => {
    expect(dueTopics({}, NOW)).toEqual([]);
  });

  it("excludes records with nextReview === 0 (defaultRecord sentinel)", () => {
    // nextReview=0 means the record was never scored (bootstrapped from a
    // pre-seeded store). It must not appear as due since 0 <= any real now.
    const record: SRSRecord = {
      topicId: "python.oop.instance-state",
      n: 0, ef: 2.5, intervalDays: 0,
      nextReview: 0,
      lastAttemptAt: 0,
      lastQuality: 0, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    expect(dueTopics({ "python.oop.instance-state": record }, NOW)).toHaveLength(0);
  });

  it("returns records whose nextReview is in the past", () => {
    const record: SRSRecord = {
      topicId: "python.oop.instance-state",
      n: 1, ef: 2.5, intervalDays: 1,
      nextReview: NOW - DAY,
      lastAttemptAt: NOW - 2 * DAY,
      lastQuality: 5, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    const result = dueTopics({ "python.oop.instance-state": record }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].topicId).toBe("python.oop.instance-state");
  });

  it("includes records due exactly now", () => {
    const record: SRSRecord = {
      topicId: "python.oop.instance-state",
      n: 1, ef: 2.5, intervalDays: 1,
      nextReview: NOW,
      lastAttemptAt: NOW - DAY,
      lastQuality: 5, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    expect(dueTopics({ "python.oop.instance-state": record }, NOW)).toHaveLength(1);
  });

  it("excludes records whose nextReview is in the future", () => {
    const record: SRSRecord = {
      topicId: "python.oop.instance-state",
      n: 1, ef: 2.5, intervalDays: 6,
      nextReview: NOW + 5 * DAY,
      lastAttemptAt: NOW,
      lastQuality: 5, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    expect(dueTopics({ "python.oop.instance-state": record }, NOW)).toHaveLength(0);
  });

  it("excludes a record due exactly 1 ms in the future", () => {
    const record: SRSRecord = {
      topicId: "python.oop.instance-state",
      n: 1, ef: 2.5, intervalDays: 1,
      nextReview: NOW + 1,
      lastAttemptAt: NOW - DAY,
      lastQuality: 5, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    expect(dueTopics({ "python.oop.instance-state": record }, NOW)).toHaveLength(0);
  });

  it("includes a record that became due exactly 1 ms ago", () => {
    const record: SRSRecord = {
      topicId: "python.oop.instance-state",
      n: 1, ef: 2.5, intervalDays: 1,
      nextReview: NOW - 1,
      lastAttemptAt: NOW - DAY,
      lastQuality: 5, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    expect(dueTopics({ "python.oop.instance-state": record }, NOW)).toHaveLength(1);
  });

  it("sorts by nextReview ascending — most overdue first", () => {
    const older: SRSRecord = {
      topicId: "python.oop.validation",
      n: 1, ef: 2.5, intervalDays: 1,
      nextReview: NOW - 3 * DAY,
      lastAttemptAt: NOW - 4 * DAY,
      lastQuality: 5, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    const newer: SRSRecord = {
      topicId: "python.oop.instance-state",
      n: 1, ef: 2.5, intervalDays: 1,
      nextReview: NOW - DAY,
      lastAttemptAt: NOW - 2 * DAY,
      lastQuality: 5, lastLevel: "foundation", lastRecommendedMinutes: 15,
    };
    const result = dueTopics({
      "python.oop.instance-state": newer,
      "python.oop.validation": older,
    }, NOW);
    expect(result[0].topicId).toBe("python.oop.validation");
    expect(result[1].topicId).toBe("python.oop.instance-state");
  });

  it("sorts by topicId when nextReview values are equal", () => {
    const base = {
      n: 1, ef: 2.5, intervalDays: 1,
      nextReview: NOW - DAY,
      lastAttemptAt: NOW - 2 * DAY,
      lastQuality: 5, lastLevel: "foundation" as const, lastRecommendedMinutes: 15,
    };
    const map: SRSMap = {
      "b.topic": { topicId: "b.topic", ...base },
      "a.topic": { topicId: "a.topic", ...base },
    };
    const result = dueTopics(map, NOW);
    expect(result[0].topicId).toBe("a.topic");
    expect(result[1].topicId).toBe("b.topic");
  });
});
