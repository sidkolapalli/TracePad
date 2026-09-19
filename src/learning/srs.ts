import type { Attempt, Level, RunEvidence } from "./types";

export interface SRSRecord {
  topicId: string;
  n: number;
  ef: number;
  intervalDays: number;
  nextReview: number;
  lastAttemptAt: number;
  lastQuality: number;
  lastLevel: Level;
  lastRecommendedMinutes: number;
}

export type SRSMap = Record<string, SRSRecord>;

function filesMatch(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const af = a ?? {};
  const bf = b ?? {};
  const keys = new Set([...Object.keys(af), ...Object.keys(bf)]);
  return [...keys].every((k) => af[k] === bf[k]);
}

/**
 * Returns true when the baseline run reflects the code and tests that were
 * actually submitted. A stale run (code, stdin, or files changed after
 * running, or results incomplete) must not be trusted as evidence of the
 * final solution's correctness.
 *
 * Defense in depth: all four sets are checked — run.tests must cover every
 * canonical test by id+code; run.results must have the same count and every
 * result ID must belong to the canonical set. scoreAttempt also filters the
 * passed count by canonical IDs independently, so a wrong-ID result can
 * never inflate the pass rate even if this check were to miss it.
 */
function isBaselineCurrent(run: RunEvidence, attempt: Attempt): boolean {
  const canonical = attempt.question.baselineTests;
  return (
    // Only "completed" and "failed" mean the runner finished the full test
    // suite. "stopped" (user cancelled), "timed-out", and "output-limit"
    // produce partial results and must be treated as stale.
    (run.status === "completed" || run.status === "failed") &&
    run.source === attempt.source &&
    run.stdin === attempt.stdin &&
    filesMatch(run.files, attempt.files) &&
    run.tests.length === canonical.length &&
    run.results.length === canonical.length &&
    canonical.every((test) =>
      run.tests.some((ran) => ran.id === test.id && ran.code === test.code),
    ) &&
    run.results.every((r) => canonical.some((c) => c.id === r.id)) &&
    // Duplicate result IDs would inflate the pass count in scoreAttempt.
    new Set(run.results.map((r) => r.id)).size === run.results.length
  );
}

/**
 * Quality 0-5 derived from the last baseline run of a finished attempt.
 * Matches SM-2 semantics: ≥3 means "remembered" (interval grows), <3 resets.
 *
 * Returns null when no baseline run exists — the attempt carries no run
 * evidence and must not influence the SRS record.
 *
 * "Last baseline run" means last by array position in `attempt.runs`, which
 * assumes runs are appended in chronological order. Hint penalties count all
 * hintsUsed entries regardless of source ("local" or "ai"). The overtime check
 * uses wall-clock time and does not subtract paused intervals. When
 * `finishedAt` is null the overtime penalty is skipped — callers that want
 * only completed attempts should pre-filter (as buildSRSMap does).
 *
 * Pass rate is mapped continuously so the quality bands are reachable at any
 * test count. Only results whose IDs appear in the canonical test list are
 * counted — extra results from a different run configuration are ignored.
 * A stale run (code/files/stdin changed after running, or results incomplete
 * due to a mid-run crash) is capped at 2 — it forces a reset since we cannot
 * confirm the final solution actually passes all tests. The stale cap also
 * applies to 0-test questions so source/file changes are never silently ignored.
 *
 * Note: mock attempts share the "python.oop.composition" topicId with
 * composition drills; that is intentional — mock success is strong evidence
 * of composition competency and advances the same SRS record.
 */
export function scoreAttempt(attempt: Attempt): number | null {
  const baselineRun = [...attempt.runs]
    .reverse()
    .find((r) => r.kind === "baseline");
  if (!baselineRun) return null;

  const canonical = attempt.question.baselineTests;
  const total = canonical.length;

  // Continuous bands so quality 3–4 are reachable at any test count ≥ 3.
  // Only results whose IDs match canonical tests are counted — guards against
  // extra results injected by a different run configuration inflating the count.
  let quality: number;
  if (total === 0) {
    quality = 3;
  } else {
    const passed = baselineRun.results.filter(
      (r) => canonical.some((c) => c.id === r.id) && r.passed,
    ).length;
    const passRate = passed / total;
    if (passRate >= 1.0) quality = 5;
    else if (passRate >= 0.8) quality = 4;
    else if (passRate >= 0.6) quality = 3;
    else if (passRate >= 0.3) quality = 2;
    else if (passRate > 0) quality = 1;
    else quality = 0;
  }

  // Two hints costs one quality point.
  quality -= Math.floor(attempt.hintsUsed.length / 2);

  // Going overtime by more than 5 minutes costs one quality point.
  if (
    attempt.finishedAt !== null &&
    attempt.finishedAt > attempt.deadline + 5 * 60_000
  ) {
    quality -= 1;
  }

  quality = Math.max(0, Math.min(5, quality));

  // If the run does not match the final submitted state (stale code, changed
  // files/stdin, or incomplete results from a mid-run crash), cap at 2. We
  // cannot confirm the submitted solution passes, so the interval must not
  // grow beyond a reset threshold. Note: quality 0 or 1 is still possible when
  // hints/overtime push the score below 2 before the cap applies.
  if (!isBaselineCurrent(baselineRun, attempt)) {
    quality = Math.min(quality, 2);
  }

  return quality;
}

/**
 * SM-2 interval update. `at` is the finish timestamp of the attempt (ms).
 *
 * Note: `lastLevel` and `lastRecommendedMinutes` are copied unchanged from
 * the input record via the spread. Callers must overwrite them explicitly if
 * those values have changed for the new attempt (as buildSRSMap does).
 */
export function updateSRS(
  record: SRSRecord,
  quality: number,
  at: number,
): SRSRecord {
  let { n, ef, intervalDays } = record;

  if (quality >= 3) {
    // Math.max(1, ...) guards the n>=2 branch against an intervalDays=0
    // invariant violation: a record constructed with n>=2 but intervalDays=0
    // would otherwise produce nextReview=at, making the topic instantly due.
    intervalDays = n === 0 ? 1 : n === 1 ? 6 : Math.max(1, Math.round(intervalDays * ef));
    n++;
  } else {
    n = 0;
    intervalDays = 1;
  }

  ef = Math.max(
    1.3,
    ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );

  return {
    ...record,
    n,
    ef,
    intervalDays,
    nextReview: at + intervalDays * 86_400_000,
    lastAttemptAt: at,
    lastQuality: quality,
  };
}

function defaultRecord(topicId: string, level: Level, recommendedMinutes: number): SRSRecord {
  return {
    topicId,
    n: 0,
    ef: 2.5,
    intervalDays: 0,
    nextReview: 0,
    lastAttemptAt: 0,
    lastQuality: 0,
    lastLevel: level,
    lastRecommendedMinutes: recommendedMinutes,
  };
}

/**
 * Derive SRS state from all finished attempts, sorted by finishedAt so that
 * the SM-2 nextReview timestamps (which are anchored to finishedAt) are
 * applied in the same order the user actually completed the attempts.
 *
 * Limitation: attempts are capped at 30 in localStorage (MAX_ATTEMPTS).
 * For users with extensive history on a single topic, evicted attempts
 * cause the computed EF and interval to be lower than the true value.
 * A separate persisted SRS store would fix this but adds storage complexity.
 */
export function buildSRSMap(attempts: Attempt[]): SRSMap {
  const finished = [...attempts]
    .filter((a) => a.finishedAt !== null)
    .sort((a, b) => a.finishedAt! - b.finishedAt! || a.id.localeCompare(b.id));

  const map: SRSMap = {};

  for (const attempt of finished) {
    const { topicId, level, recommendedMinutes } = attempt.question;
    const at = attempt.finishedAt!;
    const quality = scoreAttempt(attempt);
    if (quality === null) continue;

    map[topicId] = {
      ...updateSRS(
        map[topicId] ?? defaultRecord(topicId, level, recommendedMinutes),
        quality,
        at,
      ),
      lastLevel: level,
      lastRecommendedMinutes: recommendedMinutes,
    };
  }

  return map;
}

/**
 * Topics whose next review date is now or in the past, most overdue first.
 * Records with nextReview === 0 (the defaultRecord sentinel) are excluded —
 * they represent bootstrapped state before any scored attempt has been processed.
 */
export function dueTopics(srsMap: SRSMap, now: number): SRSRecord[] {
  return Object.values(srsMap)
    .filter((record) => record.nextReview > 0 && record.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview || a.topicId.localeCompare(b.topicId));
}
