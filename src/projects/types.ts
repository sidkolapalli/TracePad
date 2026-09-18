import type { SessionState } from "../types";
import type { LearningState } from "../learning/types";

export interface Project {
  id: string;
  name: string;
  company: string;
  role: string;
  interviewDate: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}
export type ProjectDetails = Pick<
  Project,
  "name" | "company" | "role" | "interviewDate" | "notes"
>;
export interface ProjectState {
  schemaVersion: 1;
  session: SessionState;
  learning: LearningState;
}
export interface ProjectDocument {
  project: Project;
  revision: number;
  state: ProjectState;
}
export interface WorkspaceProject {
  suspended: boolean;
  project: Project;
  initial: ProjectState;
  onSession: (state: SessionState) => void;
  onLearning: (state: LearningState) => void;
  registerBeforeLeave: (handler: (() => void) | null) => void;
  onManage: () => void;
  onOpenProjects: () => void;
  projectsOpen: boolean;
  saveStatus: string;
  saveFailed: boolean;
}
