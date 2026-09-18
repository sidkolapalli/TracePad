import type { Scratchpad } from "./scratchpad/model";

export interface PracticeCase {
  id: string;
  name: string;
  code: string;
}
export interface Exercise {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Custom" | "Sandbox";
  topic: string;
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  starterCode: string;
  tests: PracticeCase[];
  custom?: boolean;
}
export interface Draft {
  source: string;
  stdin: string;
  tests: PracticeCase[];
  /** Extra Python modules; main.py always lives in source. */
  files?: Record<string, string>;
  activeFile?: string;
  scratchpad?: Scratchpad;
}
export interface TimerState {
  durationMs: number;
  remainingMs: number;
  deadline: number | null;
  started: boolean;
}
export interface SessionState {
  version: 1;
  activeId: string;
  customExercises: Exercise[];
  drafts: Record<string, Draft>;
  timer: TimerState;
  fontSize: number;
  panelWidth: number;
  consoleHeight: number;
  theme: "dark" | "light";
  sidebarTab?: "brief" | "files" | "scratchpad" | "interview";
  sidebarCollapsed?: boolean;
}
export type RunStatus =
  | "idle"
  | "loading"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "timed-out"
  | "output-limit";
export interface RunRequest {
  runId: string;
  source: string;
  stdin: string;
  tests?: PracticeCase[];
  files?: Record<string, string>;
}
export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  elapsedMs: number;
}
export type RunnerEvent =
  | { type: "status"; runId: string; status: "loading" | "running" }
  | { type: "output"; runId: string; stream: "stdout" | "stderr"; text: string }
  | { type: "test"; runId: string; result: TestResult }
  | {
      type: "complete";
      runId: string;
      status: "completed" | "failed" | "stopped" | "timed-out" | "output-limit";
      elapsedMs: number;
      message?: string;
    };
