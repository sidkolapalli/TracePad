import type { PracticeCase } from "../types";
import type { Scratchpad } from "../scratchpad/model";
import {
  MAX_FILE_PATH_LENGTH,
  MAX_MODULE_FILES,
  validateFilePath,
} from "../files";
import type {
  CoachingFeedback,
  PracticeSnapshot,
  QuestionPackage,
  RunEvidence,
} from "./types";

const MAX_SNAPSHOT_BYTES = 850_000;
const encoder = new TextEncoder();
type SnapshotAttempt = NonNullable<PracticeSnapshot["activeAttempt"]>;

/** Bound only the transport copy. Local drafts, canonical tests, and history stay intact. */
export function boundSnapshot(snapshot: PracticeSnapshot): PracticeSnapshot {
  const bounded = structuredClone(snapshot);
  const omissions: string[] = [];
  const moreOmissions =
    "truncatedFields (additional fields omitted or shortened)";

  // Avoid ending a clipped string halfway through a Unicode surrogate pair.
  function prefix(value: string, length: number): string {
    let end = Math.min(value.length, length);
    if (
      end > 0 &&
      end < value.length &&
      /[\uD800-\uDBFF]/.test(value[end - 1]) &&
      /[\uDC00-\uDFFF]/.test(value[end])
    )
      end--;
    return value.slice(0, end);
  }
  function mark(path: string) {
    const name = prefix(path, 300);
    if (omissions.includes(name)) return;
    if (omissions.length < 100) omissions.push(name);
    else omissions[99] = moreOmissions;
  }
  for (const path of bounded.truncatedFields ?? []) mark(path);
  if (
    (bounded.truncatedFields?.length ?? 0) > 100 ||
    bounded.truncatedFields?.some((path) => path.length > 300)
  )
    mark("truncatedFields");

  function text(value: string, limit: number, path: string): string {
    if (value.length <= limit) return value;
    mark(path);
    return prefix(value, limit);
  }
  const id = (value: string, path: string) => text(value, 160, path);
  function list<T>(
    values: T[],
    limit: number,
    path: string,
    tail = false,
  ): T[] {
    if (values.length <= limit) return values;
    mark(path);
    return tail ? values.slice(-limit) : values.slice(0, limit);
  }
  function strings(
    values: string[],
    count: number,
    length: number,
    path: string,
  ): string[] {
    return list(values, count, path).map((value, index) =>
      text(value, length, `${path}[${index}]`),
    );
  }
  function tests(
    values: PracticeCase[],
    path: string,
    codeLimit: number,
  ): PracticeCase[] {
    return list(values, 30, path).map((test, index) => ({
      ...test,
      id: id(test.id, `${path}[${index}].id`),
      name: text(test.name, 300, `${path}[${index}].name`),
      code: text(test.code, codeLimit, `${path}[${index}].code`),
    }));
  }
  function scratchpad(
    value: Scratchpad | undefined,
    path: string,
    pressure = Infinity,
  ) {
    if (!value) return;
    value.notes = text(
      value.notes,
      Math.min(50_000, pressure),
      `${path}.notes`,
    );
    value.trace.columns.forEach((column, index) => {
      column.name = text(
        column.name,
        Math.min(80, pressure),
        `${path}.trace.columns[${index}].name`,
      );
    });
    value.trace.rows = list(
      value.trace.rows,
      Math.min(100, Math.max(1, Math.floor(pressure / 64))),
      `${path}.trace.rows`,
    );
    value.trace.rows.forEach((row) => {
      for (const key of Object.keys(row.cells))
        row.cells[key] = text(
          row.cells[key],
          Math.min(2_000, pressure),
          `${path}.trace.rows`,
        );
    });
    value.flow.nodes = list(
      value.flow.nodes,
      Math.min(60, Math.max(2, Math.floor(pressure / 128))),
      `${path}.flow.nodes`,
    );
    value.flow.nodes.forEach((node, index) => {
      node.label = text(
        node.label,
        Math.min(160, pressure),
        `${path}.flow.nodes[${index}].label`,
      );
    });
    const nodes = new Set(value.flow.nodes.map((node) => node.id));
    const edges = value.flow.edges.filter(
      (edge) => nodes.has(edge.source) && nodes.has(edge.target),
    );
    if (edges.length !== value.flow.edges.length) mark(`${path}.flow.edges`);
    value.flow.edges = edges;
    value.flow.edges.forEach((edge, index) => {
      edge.label = text(
        edge.label,
        Math.min(80, pressure),
        `${path}.flow.edges[${index}].label`,
      );
    });
  }
  function question(
    q: SnapshotAttempt["question"],
    path: string,
    pressure = Infinity,
  ) {
    if (Object.hasOwn(q, "referenceSolution")) {
      delete (q as Partial<QuestionPackage>).referenceSolution;
      mark(`${path}.referenceSolution`);
    }
    q.id = id(q.id, `${path}.id`);
    q.title = text(q.title, 160, `${path}.title`);
    q.prompt = text(q.prompt, Math.min(30_000, pressure), `${path}.prompt`);
    q.starterCode = text(
      q.starterCode,
      Math.min(100_000, pressure),
      `${path}.starterCode`,
    );
    q.examples = list(q.examples, 12, `${path}.examples`).map(
      (example, index) => ({
        input: text(
          example.input,
          Math.min(30_000, pressure),
          `${path}.examples[${index}].input`,
        ),
        output: text(
          example.output,
          Math.min(30_000, pressure),
          `${path}.examples[${index}].output`,
        ),
        ...(example.explanation === undefined
          ? {}
          : {
              explanation: text(
                example.explanation,
                Math.min(30_000, pressure),
                `${path}.examples[${index}].explanation`,
              ),
            }),
      }),
    );
    q.constraints = strings(
      q.constraints,
      30,
      Math.min(30_000, pressure),
      `${path}.constraints`,
    );
    // Keep canonical assertion bodies in full when the overall transport budget permits.
    q.baselineTests = tests(
      q.baselineTests,
      `${path}.baselineTests`,
      Math.min(100_000, pressure),
    );
    q.hints = strings(q.hints, 10, Math.min(30_000, pressure), `${path}.hints`);
    q.learningObjectives = strings(
      q.learningObjectives,
      12,
      Math.min(1_000, pressure),
      `${path}.learningObjectives`,
    );
    q.provenance.generator = text(
      q.provenance.generator,
      200,
      `${path}.provenance.generator`,
    );
    if (q.provenance.templateId !== undefined)
      q.provenance.templateId = id(
        q.provenance.templateId,
        `${path}.provenance.templateId`,
      );
  }
  function feedback(value: CoachingFeedback, path: string, pressure: number) {
    value.id = id(value.id, `${path}.id`);
    value.attemptId = id(value.attemptId, `${path}.attemptId`);
    value.reviewer = text(value.reviewer, 200, `${path}.reviewer`);
    value.summary = text(
      value.summary,
      Math.min(30_000, pressure),
      `${path}.summary`,
    );
    value.strengths = strings(
      value.strengths,
      20,
      Math.min(30_000, pressure),
      `${path}.strengths`,
    );
    value.improvements = strings(
      value.improvements,
      20,
      Math.min(30_000, pressure),
      `${path}.improvements`,
    );
    value.nextPractice = text(
      value.nextPractice,
      Math.min(30_000, pressure),
      `${path}.nextPractice`,
    );
    value.evidenceRunIds = strings(
      value.evidenceRunIds,
      Number.isFinite(pressure) ? 20 : 100,
      160,
      `${path}.evidenceRunIds`,
    );
  }
  function project(
    value: { files?: Record<string, string>; activeFile?: string },
    path: string,
    pressure: number,
  ) {
    if (value.files !== undefined) {
      const entries = list(
        Object.entries(value.files),
        MAX_MODULE_FILES,
        `${path}.files`,
      );
      value.files = Object.fromEntries(
        entries
          .filter(([name]) => {
            if (validateFilePath(name) === null) return true;
            mark(`${path}.files.${name}`);
            return false;
          })
          .map(([name, source]) => [
            name,
            text(source, Math.min(50_000, pressure), `${path}.files.${name}`),
          ]),
      );
    }
    if (value.activeFile !== undefined)
      value.activeFile = text(
        value.activeFile,
        MAX_FILE_PATH_LENGTH,
        `${path}.activeFile`,
      );
  }
  function run(value: RunEvidence, path: string, pressure: number) {
    project(value, path, Math.min(20_000, pressure));
    value.id = id(value.id, `${path}.id`);
    value.source = text(
      value.source,
      Math.min(20_000, pressure),
      `${path}.source`,
    );
    value.stdin = text(value.stdin, Math.min(5_000, pressure), `${path}.stdin`);
    value.output = text(
      value.output,
      Math.min(8_000, pressure),
      `${path}.output`,
    );
    if (value.message !== undefined)
      value.message = text(
        value.message,
        Math.min(2_000, pressure),
        `${path}.message`,
      );
    value.tests = tests(
      value.tests,
      `${path}.tests`,
      Math.min(value.kind === "baseline" ? 100_000 : 2_000, pressure),
    );
    value.results = list(value.results, 100, `${path}.results`).map(
      (result, index) => ({
        ...result,
        id: id(result.id, `${path}.results[${index}].id`),
        name: text(result.name, 300, `${path}.results[${index}].name`),
        ...(result.error === undefined
          ? {}
          : {
              error: text(
                result.error,
                Math.min(2_000, pressure),
                `${path}.results[${index}].error`,
              ),
            }),
      }),
    );
  }
  function attempt(value: SnapshotAttempt, path: string, pressure = Infinity) {
    project(value, path, pressure);
    scratchpad(value.scratchpad, `${path}.scratchpad`, pressure);
    if (value.interviewJourney) {
      // Phase history is already bounded to 200 small entries. Preserve timestamps
      // so a shortened transport note never implies a different pacing history.
      value.interviewJourney.clarifications = text(
        value.interviewJourney.clarifications,
        Math.min(6_000, pressure),
        `${path}.interviewJourney.clarifications`,
      );
      value.interviewJourney.followupResponse = text(
        value.interviewJourney.followupResponse,
        Math.min(6_000, pressure),
        `${path}.interviewJourney.followupResponse`,
      );
    }
    value.id = id(value.id, `${path}.id`);
    question(value.question, `${path}.question`, pressure);
    value.source = text(
      value.source,
      Math.min(50_000, pressure),
      `${path}.source`,
    );
    value.stdin = text(value.stdin, Math.min(5_000, pressure), `${path}.stdin`);
    value.notes = text(
      value.notes,
      Math.min(30_000, pressure),
      `${path}.notes`,
    );
    if (value.requirementUpdates !== undefined)
      value.requirementUpdates = list(
        value.requirementUpdates,
        50,
        `${path}.requirementUpdates`,
      ).map((update, index) => ({
        ...update,
        id: id(update.id, `${path}.requirementUpdates[${index}].id`),
        title: text(
          update.title,
          160,
          `${path}.requirementUpdates[${index}].title`,
        ),
        description: text(
          update.description,
          Math.min(6_000, pressure),
          `${path}.requirementUpdates[${index}].description`,
        ),
        author: text(
          update.author,
          200,
          `${path}.requirementUpdates[${index}].author`,
        ),
      }));
    value.scratchTests = tests(
      value.scratchTests,
      `${path}.scratchTests`,
      Math.min(2_000, pressure),
    );
    value.hintsUsed = list(
      value.hintsUsed,
      Number.isFinite(pressure) ? 20 : 100,
      `${path}.hintsUsed`,
      true,
    ).map((hint, index) => ({
      ...hint,
      text: text(
        hint.text,
        Math.min(30_000, pressure),
        `${path}.hintsUsed[${index}].text`,
      ),
    }));
    value.pauseEvents = list(
      value.pauseEvents,
      Number.isFinite(pressure) ? 100 : 1_000,
      `${path}.pauseEvents`,
      true,
    );
    value.runs = list(value.runs, 100, `${path}.runs`, true);
    value.runs.forEach((value, index) =>
      run(value, `${path}.runs[${index}]`, pressure),
    );
    value.feedback = list(
      value.feedback,
      Number.isFinite(pressure) ? 5 : 50,
      `${path}.feedback`,
      true,
    );
    value.feedback.forEach((value, index) =>
      feedback(value, `${path}.feedback[${index}]`, pressure),
    );
  }
  function topLevel(pressure = Infinity) {
    project(bounded, "workspace", pressure);
    scratchpad(bounded.scratchpad, "scratchpad", pressure);
    bounded.instanceId = id(bounded.instanceId, "instanceId");
    bounded.activeExercise.id = id(
      bounded.activeExercise.id,
      "activeExercise.id",
    );
    bounded.activeExercise.title = text(
      bounded.activeExercise.title,
      300,
      "activeExercise.title",
    );
    bounded.activeExercise.prompt = text(
      bounded.activeExercise.prompt,
      Math.min(30_000, pressure),
      "activeExercise.prompt",
    );
    bounded.activeExercise.topic = text(
      bounded.activeExercise.topic,
      300,
      "activeExercise.topic",
    );
    bounded.source = text(bounded.source, Math.min(50_000, pressure), "source");
    bounded.stdin = text(bounded.stdin, Math.min(5_000, pressure), "stdin");
    bounded.notes = text(bounded.notes, Math.min(30_000, pressure), "notes");
    bounded.history = list(
      bounded.history,
      Number.isFinite(pressure) ? 30 : 100,
      "history",
      true,
    ).map((entry, index) => ({
      ...entry,
      id: id(entry.id, `history[${index}].id`),
      title: text(entry.title, 300, `history[${index}].title`),
    }));
    bounded.requests = list(bounded.requests, 30, "requests", true).map(
      (request, index) => ({
        ...request,
        id: id(request.id, `requests[${index}].id`),
        ...(request.attemptId === undefined
          ? {}
          : {
              attemptId: id(request.attemptId, `requests[${index}].attemptId`),
            }),
        instructions: text(
          request.instructions,
          Math.min(30_000, pressure),
          `requests[${index}].instructions`,
        ),
      }),
    );
  }
  function size(): number {
    if (omissions.length || bounded.truncatedFields !== undefined)
      bounded.truncatedFields = [...omissions];
    return encoder.encode(JSON.stringify(bounded)).byteLength;
  }
  function dropOldest<T>(
    values: T[],
    date: (value: T) => number,
    path: string,
  ) {
    const index = values.reduce(
      (oldest, value, i) => (date(value) < date(values[oldest]) ? i : oldest),
      0,
    );
    values.splice(index, 1);
    mark(path);
  }

  topLevel();
  if (bounded.activeAttempt) attempt(bounded.activeAttempt, "activeAttempt");
  if (bounded.recentAttempts) {
    while (bounded.recentAttempts.length > 10)
      dropOldest(
        bounded.recentAttempts,
        (value) => value.startedAt,
        "recentAttempts",
      );
    bounded.recentAttempts.forEach((value, index) =>
      attempt(value, `recentAttempts[${index}]`),
    );
  }

  // Dense trace tables can dominate transport size. Shorten their read-only
  // copies before sacrificing execution evidence, preserving all local data.
  for (
    let limit = 1_024;
    size() > MAX_SNAPSHOT_BYTES && limit >= 16;
    limit /= 2
  ) {
    scratchpad(bounded.scratchpad, "scratchpad", limit);
    if (bounded.activeAttempt)
      scratchpad(
        bounded.activeAttempt.scratchpad,
        "activeAttempt.scratchpad",
        limit,
      );
    bounded.recentAttempts?.forEach((value, index) =>
      scratchpad(
        value.scratchpad,
        `recentAttempts[${index}].scratchpad`,
        limit,
      ),
    );
  }

  // Preserve all selected/reviewed evidence at normal sizes. Only a measured byte
  // overflow evicts older history; the current attempt and its question survive.
  while (size() > MAX_SNAPSHOT_BYTES && bounded.recentAttempts?.length) {
    dropOldest(
      bounded.recentAttempts,
      (value) => value.startedAt,
      "recentAttempts",
    );
  }
  while (size() > MAX_SNAPSHOT_BYTES && bounded.activeAttempt?.runs.length) {
    dropOldest(
      bounded.activeAttempt.runs,
      (value) => value.at,
      "activeAttempt.runs",
    );
  }
  // A single valid question can itself exceed the transport budget (30 long
  // Unicode assertions, for example). Explicitly mark any shortened evidence;
  // these snapshot copies must never be mistaken for executable canonical tests.
  let pressure = 8_192;
  while (size() > MAX_SNAPSHOT_BYTES) {
    topLevel(pressure);
    if (bounded.activeAttempt)
      attempt(bounded.activeAttempt, "activeAttempt", pressure);
    pressure = Math.max(16, Math.floor(pressure / 2));
  }
  size();
  return bounded;
}
