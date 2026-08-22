/**
 * Shared shapes for the intake → brief pipeline. Used by the API routes,
 * the KV/D1 data-access layers, and the brief generator, so they can't
 * silently drift from each other.
 */

export type ProjectStatus = "in_progress" | "brief_generated";

export interface ProjectState {
  projectId: string;
  firstName: string;
  email: string;
  /** Empty string until the homeowner picks one in step 2 — service is
   * NOT required to create the project (CLAUDE.md: name+email first). */
  service: string;
  location: string;
  status: ProjectStatus;
  /** Free-text + structured answers, keyed by field id. Only fields the
   * homeowner actually answered are present — absence is the signal for
   * "Information Still Needed," never a stored null/empty placeholder. */
  answers: Record<string, string>;
  brief?: GeneratedBrief;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalContextItem {
  label: string;
  value: string;
  source: string;
  status: "sample" | "stale" | "live" | "error";
}

export interface GeneratedBrief {
  methodologyVersion: string;
  generatedAt: string;
  projectSummary: string;
  reportedProblem: string[];
  externalContext: ExternalContextItem[];
  priorWork: string;
  objectives: string;
  itemsToEvaluate: string[];
  estimateQuestions: string[];
  attachmentsNote: string;
  unknowns: string[];
  limitation: string;
}

export interface ContractorRequest {
  projectId: string;
  requestedCount: 1 | 2 | 3;
  phone?: string;
}
