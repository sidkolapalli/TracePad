import type { PracticeCase, RunStatus, TestResult } from "../types";
import type { Scratchpad } from "../scratchpad/model";

export type PracticeMode = "drill" | "mock";
export type InterviewPhase =
  "clarify" | "approach" | "code" | "followup" | "wrapup";
export interface InterviewJourney {
  version: 1;
  transitions: { phase: InterviewPhase; at: number }[];
  clarifications: string;
  followupResponse: string;
}
export type Level = "foundation" | "applied";
export interface Topic {
  id: string;
  title: string;
  description: string;
}
export interface QuestionPackage {
  schemaVersion: 1;
  id: string;
  topicId: string;
  level: Level;
  title: string;
  prompt: string;
  starterCode: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  baselineTests: PracticeCase[];
  hints: string[];
  referenceSolution: string;
  learningObjectives: string[];
  recommendedMinutes: number;
  provenance: {
    kind: "local-template" | "ai";
    generator: string;
    templateId?: string;
    seed?: number;
  };
}
export interface RunEvidence {
  id: string;
  at: number;
  kind: "run" | "scratch" | "baseline";
  source: string;
  files?: Record<string, string>;
  activeFile?: string;
  stdin: string;
  tests: PracticeCase[];
  results: TestResult[];
  status: RunStatus;
  elapsedMs: number;
  output: string;
  message?: string;
}
export interface RequirementUpdate {
  id: string;
  title: string;
  description: string;
  author: string;
  createdAt: number;
  acknowledgedAt?: number;
}
export interface CoachingFeedback {
  id: string;
  attemptId: string;
  reviewer: string;
  createdAt: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  nextPractice: string;
  evidenceRunIds: string[];
}
export interface Attempt {
  id: string;
  question: QuestionPackage;
  mode: PracticeMode;
  durationMs: number;
  startedAt: number;
  finishedAt: number | null;
  deadline: number;
  source: string;
  files?: Record<string, string>;
  activeFile?: string;
  scratchpad?: Scratchpad;
  interviewJourney?: InterviewJourney;
  liveInterviewer?: boolean;
  requirementUpdates?: RequirementUpdate[];
  stdin: string;
  scratchTests: PracticeCase[];
  notes: string;
  hintsUsed: { text: string; at: number; source: "local" | "ai" }[];
  pauseEvents: { at: number; action: "pause" | "resume" }[];
  runs: RunEvidence[];
  selfCheck: {
    clarified: boolean;
    explained: boolean;
    respondedToHints: boolean;
  };
  feedback: CoachingFeedback[];
}
export interface LearningState {
  schemaVersion: 1;
  activeAttemptId: string | null;
  attempts: Attempt[];
  acceptedQuestions: QuestionPackage[];
  processedCommandIds: string[];
}
export interface PracticeSnapshot {
  truncatedFields?: string[];
  schemaVersion: 1;
  instanceId: string;
  project?: { id: string; name: string };
  updatedAt: number;
  app: "localpad";
  activeExercise: { id: string; title: string; prompt: string; topic: string };
  source: string;
  files?: Record<string, string>;
  activeFile?: string;
  scratchpad?: Scratchpad;
  stdin: string;
  notes: string;
  timer: { remainingMs: number; running: boolean };
  activeAttempt:
    | (Omit<Attempt, "question"> & {
        question: Omit<QuestionPackage, "referenceSolution">;
      })
    | null;
  recentAttempts?: (Omit<Attempt, "question"> & {
    question: Omit<QuestionPackage, "referenceSolution">;
  })[];
  history: {
    id: string;
    title: string;
    topicId: string;
    mode: PracticeMode;
    startedAt: number;
    finishedAt: number | null;
    hintCount: number;
  }[];
  requests: {
    id: string;
    kind: "question" | "hint" | "review";
    topicId: string;
    level: Level;
    mode: PracticeMode;
    attemptId?: string;
    instructions: string;
    createdAt: number;
  }[];
}
export type BridgeCommand = { projectId?: string } & (
  | {
      id: string;
      type: "requirement";
      attemptId: string;
      update: Omit<RequirementUpdate, "acknowledgedAt">;
    }
  | {
      id: string;
      type: "question";
      question: QuestionPackage;
      requestId?: string;
    }
  | {
      id: string;
      type: "hint";
      attemptId: string;
      text: string;
      requestId: string;
    }
  | {
      id: string;
      type: "feedback";
      feedback: CoachingFeedback;
      requestId?: string;
    }
);
