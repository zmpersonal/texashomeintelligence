/**
 * Deterministic QuoteReady Project Brief generator.
 *
 * CLAUDE.md, non-negotiable: "The brief must never diagnose or invent
 * facts. It organizes homeowner-reported facts + enriched public context,
 * and explicitly separates: reported facts vs. external context vs.
 * unknowns/items-a-pro-should-evaluate."
 *
 * This is a pure function over already-resolved config + project state —
 * no LLM call, no network access, no randomness. Every sentence traces
 * back to either a homeowner-supplied answer, a config-driven list
 * (evaluationItems/estimateQuestions — reviewed copy, not generated), or
 * an explicitly SAMPLE-labeled external-context value. An intake field
 * that was never answered becomes an "unknown," never a guess.
 */
import type { ExternalContextItem, GeneratedBrief, ProjectState } from "./types";

export const BRIEF_METHODOLOGY_VERSION = "v1";

export interface ServiceBriefConfig {
  name: string;
  evaluationItems: string[];
  estimateQuestions: string[];
}

export interface IntakeFieldConfig {
  id: string;
  label: string;
}

export interface LocationConditionConfig {
  label: string;
  note: string;
  value: {
    status: "sample" | "stale" | "live" | "error";
    asOf?: string;
    source?: string;
  };
}

export interface GenerateBriefParams {
  project: ProjectState;
  service: ServiceBriefConfig;
  intakeFields: IntakeFieldConfig[];
  locationConditions: LocationConditionConfig[];
  locationName: string;
}

const GENERIC_FIELDS: IntakeFieldConfig[] = [
  { id: "overview", label: "Project description in the homeowner's own words" },
  { id: "urgency", label: "Urgency" },
  { id: "address", label: "Property address" },
  { id: "priorWork", label: "Prior repairs, quotes, or inspections" },
  { id: "objectives", label: "What matters most to the homeowner" },
];

export function generateBrief(params: GenerateBriefParams): GeneratedBrief {
  const { project, service, intakeFields, locationConditions, locationName } = params;
  const answers = project.answers;
  const allFields = [...GENERIC_FIELDS, ...intakeFields];

  const summaryDetail = answers.overview
    ? `Reported: "${answers.overview}"`
    : "No project description was provided.";
  const projectSummary =
    `${project.firstName} started a ${service.name} QuoteReady Brief for a property in ` +
    `${locationName}, TX. ${summaryDetail}`;

  const reportedProblem = allFields
    .filter((f) => f.id !== "priorWork" && f.id !== "objectives" && answers[f.id])
    .map((f) => `${f.label}: ${answers[f.id]}`);

  const externalContext: ExternalContextItem[] = locationConditions.map((c) => ({
    label: c.label,
    value: c.note,
    source: c.value.source ?? "Pending live feed connection",
    status: c.value.status,
  }));

  const priorWork = answers.priorWork?.trim() ? answers.priorWork : "None reported.";
  const objectives = answers.objectives?.trim() ? answers.objectives : "Not specified by the homeowner.";

  const unknowns = allFields
    .filter((f) => f.id !== "priorWork" && f.id !== "objectives" && !answers[f.id])
    .map((f) => f.label);

  return {
    methodologyVersion: BRIEF_METHODOLOGY_VERSION,
    generatedAt: new Date().toISOString(),
    projectSummary,
    reportedProblem,
    externalContext,
    priorWork,
    objectives,
    itemsToEvaluate: service.evaluationItems,
    estimateQuestions: service.estimateQuestions,
    attachmentsNote:
      "No photo attachments are stored in this prototype — photo upload/storage is not yet implemented.",
    unknowns,
    limitation:
      "This brief organizes homeowner-reported information and available public data. It is not an inspection, a diagnosis, or a substitute for a licensed professional's on-site evaluation.",
  };
}
