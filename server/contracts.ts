import { z } from "zod";
import { isInterviewJourney, JOURNEY_LIMITS } from "../src/learning/journey";
import {
  isScratchpad,
  SCRATCHPAD_LIMITS as limits,
} from "../src/scratchpad/model";
import {
  MAX_MODULE_FILES,
  MAX_FILE_PATH_LENGTH,
  validateFilePath,
} from "../src/files";

export const schemaVersion = 1 as const;
export const idSchema = z.string().min(1).max(160);
export const topicIdSchema = z.enum([
  "python.oop.instance-state",
  "python.oop.validation",
  "python.oop.composition",
  "python.oop.polymorphism",
  "python.fundamentals.collections",
  "python.debugging.edge-cases",
]);
const text = z.string().max(30_000);
const source = z.string().max(100_000);
const timestamp = z.number().finite().nonnegative();
const mode = z.enum(["drill", "mock"]);
const level = z.enum(["foundation", "applied"]);
const fileNameSchema = z.string().min(1).max(MAX_FILE_PATH_LENGTH);
const filesSchema = z
  .record(fileNameSchema, source)
  .refine(
    (files) =>
      Object.keys(files).length <= MAX_MODULE_FILES &&
      Object.keys(files).every((name) => validateFilePath(name) === null),
    {
      message:
        "Use at most 32 valid additional Python module paths; main.py is stored in source.",
    },
  );
export const requirementSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(6_000),
    author: z.string().min(1).max(200),
    createdAt: timestamp.max(8_640_000_000_000_000),
  })
  .strict();
const recordedRequirementSchema = requirementSchema.extend({
  acknowledgedAt: timestamp.optional(),
});
export const interviewJourneySchema = z
  .object({
    version: z.literal(1),
    transitions: z
      .array(
        z
          .object({
            phase: z.enum([
              "clarify",
              "approach",
              "code",
              "followup",
              "wrapup",
            ]),
            at: timestamp.max(8_640_000_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(JOURNEY_LIMITS.transitions),
    clarifications: z.string().max(JOURNEY_LIMITS.text),
    followupResponse: z.string().max(JOURNEY_LIMITS.text),
  })
  .strict()
  .refine(
    isInterviewJourney,
    "Phase changes must be chronological, distinct consecutive selections.",
  );
export const testSchema = z
  .object({ id: idSchema, name: z.string().min(1).max(300), code: source })
  .strict();
const snapshotTestSchema = testSchema.extend({ name: z.string().max(300) });
const scratchpadId = z.string().min(1).max(limits.id);
const coordinate = z.number().finite().min(0).max(limits.coordinate);
export const scratchpadSchema = z
  .object({
    version: z.literal(1),
    activeTab: z.enum(["notes", "trace", "flow"]),
    notes: z.string().max(limits.notes),
    trace: z
      .object({
        columns: z
          .array(
            z
              .object({
                id: scratchpadId,
                name: z.string().max(limits.columnName),
              })
              .strict(),
          )
          .min(1)
          .max(limits.columns),
        rows: z
          .array(
            z
              .object({
                id: scratchpadId,
                cells: z.record(scratchpadId, z.string().max(limits.cell)),
              })
              .strict(),
          )
          .max(limits.rows),
      })
      .strict(),
    flow: z
      .object({
        nodes: z
          .array(
            z
              .object({
                id: scratchpadId,
                type: z.enum(["start", "process", "decision", "end"]),
                label: z.string().max(limits.nodeLabel),
                x: coordinate,
                y: coordinate,
              })
              .strict(),
          )
          .max(limits.nodes),
        edges: z
          .array(
            z
              .object({
                id: scratchpadId,
                source: scratchpadId,
                target: scratchpadId,
                label: z.string().max(limits.edgeLabel),
              })
              .strict(),
          )
          .max(limits.edges),
      })
      .strict(),
  })
  .strict()
  .refine(
    isScratchpad,
    "Scratchpad IDs must be unique and references must resolve.",
  );
export const questionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    topicId: topicIdSchema,
    level,
    title: z.string().min(1).max(160),
    prompt: text.min(1),
    starterCode: source,
    examples: z
      .array(
        z
          .object({ input: text, output: text, explanation: text.optional() })
          .strict(),
      )
      .max(12),
    constraints: z.array(text).max(30),
    baselineTests: z
      .array(testSchema)
      .min(1)
      .max(30)
      .refine(
        (tests) => new Set(tests.map((test) => test.id)).size === tests.length,
        { message: "Baseline test IDs must be unique." },
      ),
    hints: z.array(text.min(1)).max(10),
    referenceSolution: source.min(1),
    learningObjectives: z.array(z.string().min(1).max(1_000)).min(1).max(12),
    recommendedMinutes: z.number().int().min(1).max(180),
    provenance: z
      .object({
        kind: z.enum(["local-template", "ai"]),
        generator: z.string().min(1).max(200),
        templateId: idSchema.optional(),
        seed: z.number().finite().optional(),
      })
      .strict(),
  })
  .strict();
export const feedbackSchema = z
  .object({
    id: idSchema,
    attemptId: idSchema,
    reviewer: z.string().min(1).max(200),
    createdAt: timestamp,
    summary: text.min(1),
    strengths: z.array(text).max(20),
    improvements: z.array(text).max(20),
    nextPractice: text,
    evidenceRunIds: z.array(idSchema).max(100),
  })
  .strict();
const resultSchema = z
  .object({
    id: idSchema,
    name: z.string().max(300),
    passed: z.boolean(),
    error: source.optional(),
    elapsedMs: timestamp,
  })
  .strict();
const runSchema = z
  .object({
    id: idSchema,
    at: timestamp,
    kind: z.enum(["run", "scratch", "baseline"]),
    source,
    files: filesSchema.optional(),
    activeFile: fileNameSchema.optional(),
    stdin: source,
    tests: z.array(snapshotTestSchema).max(100),
    results: z.array(resultSchema).max(100),
    status: z.enum([
      "idle",
      "loading",
      "running",
      "completed",
      "failed",
      "stopped",
      "timed-out",
      "output-limit",
    ]),
    elapsedMs: timestamp,
    output: source,
    message: text.optional(),
  })
  .strict();
export const snapshotAttemptSchema = z
  .object({
    id: idSchema,
    question: questionSchema.omit({ referenceSolution: true }),
    mode,
    durationMs: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp.nullable(),
    deadline: timestamp,
    source,
    files: filesSchema.optional(),
    activeFile: fileNameSchema.optional(),
    scratchpad: scratchpadSchema.optional(),
    interviewJourney: interviewJourneySchema.optional(),
    liveInterviewer: z.boolean().optional(),
    requirementUpdates: z.array(recordedRequirementSchema).max(50).optional(),
    stdin: source,
    scratchTests: z.array(snapshotTestSchema).max(100),
    notes: text,
    hintsUsed: z
      .array(
        z
          .object({ text, at: timestamp, source: z.enum(["local", "ai"]) })
          .strict(),
      )
      .max(100),
    pauseEvents: z
      .array(
        z
          .object({ at: timestamp, action: z.enum(["pause", "resume"]) })
          .strict(),
      )
      .max(1_000),
    runs: z.array(runSchema).max(100),
    selfCheck: z
      .object({
        clarified: z.boolean(),
        explained: z.boolean(),
        respondedToHints: z.boolean(),
      })
      .strict(),
    feedback: z.array(feedbackSchema).max(50),
  })
  .strict()
  .refine(
    (attempt) =>
      !attempt.interviewJourney ||
      (attempt.mode === "mock" &&
        attempt.interviewJourney.transitions.every(
          (transition) =>
            transition.at >= attempt.startedAt &&
            (attempt.finishedAt === null ||
              transition.at <= attempt.finishedAt),
        )),
    "Interview phases must belong to a mock and fall within its recorded lifetime.",
  );
export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    instanceId: idSchema,
    project: z
      .object({ id: idSchema, name: z.string().min(1).max(100) })
      .strict()
      .optional(),
    updatedAt: timestamp,
    app: z.literal("localpad"),
    activeExercise: z
      .object({
        id: idSchema,
        title: z.string().max(300),
        prompt: text,
        topic: z.string().max(300),
      })
      .strict(),
    source,
    files: filesSchema.optional(),
    activeFile: fileNameSchema.optional(),
    scratchpad: scratchpadSchema.optional(),
    stdin: source,
    notes: text,
    timer: z
      .object({ remainingMs: z.number().finite(), running: z.boolean() })
      .strict(),
    activeAttempt: snapshotAttemptSchema.nullable(),
    recentAttempts: z.array(snapshotAttemptSchema).max(10).optional(),
    truncatedFields: z.array(z.string().max(300)).max(100).optional(),
    history: z
      .array(
        z
          .object({
            id: idSchema,
            title: z.string().max(300),
            topicId: topicIdSchema,
            mode,
            startedAt: timestamp,
            finishedAt: timestamp.nullable(),
            hintCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(100),
    requests: z
      .array(
        z
          .object({
            id: idSchema,
            kind: z.enum(["question", "hint", "review"]),
            topicId: topicIdSchema,
            level,
            mode,
            attemptId: idSchema.optional(),
            instructions: text,
            createdAt: timestamp,
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const syncSchema = z
  .object({
    snapshot: snapshotSchema,
    ackIds: z.array(idSchema).max(100),
    connectionId: idSchema.optional(),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: idSchema,
      projectId: idSchema.optional(),
      type: z.literal("requirement"),
      attemptId: idSchema,
      update: requirementSchema,
    })
    .strict(),
  z
    .object({
      id: idSchema,
      projectId: idSchema.optional(),
      type: z.literal("question"),
      question: questionSchema,
      requestId: idSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: idSchema,
      projectId: idSchema.optional(),
      type: z.literal("hint"),
      attemptId: idSchema,
      text: text.min(1),
      requestId: idSchema,
    })
    .strict(),
  z
    .object({
      id: idSchema,
      projectId: idSchema.optional(),
      type: z.literal("feedback"),
      feedback: feedbackSchema,
      requestId: idSchema.optional(),
    })
    .strict(),
]);
export const agentOperationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("submit_requirement"),
      instanceId: idSchema,
      projectId: idSchema.optional(),
      attemptId: idSchema,
      update: requirementSchema,
    })
    .strict(),
  z.object({ operation: z.literal("list_instances") }).strict(),
  z
    .object({ operation: z.literal("get_snapshot"), instanceId: idSchema })
    .strict(),
  z
    .object({
      operation: z.literal("get_attempt"),
      instanceId: idSchema,
      attemptId: idSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("submit_question"),
      instanceId: idSchema,
      projectId: idSchema.optional(),
      question: questionSchema,
      requestId: idSchema.optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("provide_hint"),
      instanceId: idSchema,
      projectId: idSchema.optional(),
      attemptId: idSchema,
      text: text.min(1),
      requestId: idSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("submit_feedback"),
      instanceId: idSchema,
      projectId: idSchema.optional(),
      feedback: feedbackSchema,
      requestId: idSchema.optional(),
    })
    .strict(),
]);

export const jsonSchemas = {
  schemaVersion,
  question: z.toJSONSchema(questionSchema),
  snapshot: z.toJSONSchema(snapshotSchema),
  feedback: z.toJSONSchema(feedbackSchema),
  requirement: z.toJSONSchema(requirementSchema),
  command: z.toJSONSchema(commandSchema),
};
export type Snapshot = z.infer<typeof snapshotSchema>;
export type AgentOperation = z.infer<typeof agentOperationSchema>;
