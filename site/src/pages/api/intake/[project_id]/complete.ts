/**
 * POST /api/intake/:project_id/complete — generates the deterministic
 * QuoteReady Project Brief from everything accumulated in KV, stores it
 * (KV + D1), and stub-logs the internal notification. No LLM call, no
 * invented facts — see src/lib/brief.ts.
 */
import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import { z } from "astro/zod";
import { completeIntakeSchema } from "../../../../lib/validation";
import { getProject, putProject, resolveToken } from "../../../../lib/kv";
import { updateProjectStatus, insertGeneratedBrief } from "../../../../lib/db";
// Imported directly rather than through the data-page registry: that registry
// globs every generated dataset eagerly, which is right for static pages but
// would pull ~2 MB of permit JSON into this Worker's bundle for a handful of
// summary lines. These four files are ~25 KB each.
import stormAustin from "../../../../data/generated/noaa-storm-events/austin.json";
import stormSanAntonio from "../../../../data/generated/noaa-storm-events/san-antonio.json";
import droughtAustin from "../../../../data/generated/usdm-drought/austin.json";
import droughtSanAntonio from "../../../../data/generated/usdm-drought/san-antonio.json";
import type { DatasetFile } from "../../../../ingest/types";
import { generateBrief } from "../../../../lib/brief";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = params.project_id!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const parsed = completeIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const resolved = await resolveToken(parsed.data.token);
  if (resolved !== projectId) {
    return Response.json({ error: "Invalid or missing token" }, { status: 403 });
  }

  const state = await getProject(projectId);
  if (!state) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (state.status === "brief_generated") {
    return Response.json({ brief: state.brief });
  }
  if (!state.service || !state.location) {
    return Response.json(
      { error: "A service and location must be selected before a brief can be generated." },
      { status: 400 },
    );
  }

  const [serviceEntry, locationEntry, intakeEntry] = await Promise.all([
    getEntry("services", state.service),
    getEntry("locations", state.location),
    getEntry("intakeQuestions", state.service),
  ]);
  if (!serviceEntry || !locationEntry || !intakeEntry) {
    return Response.json({ error: "Project references unknown service/location config" }, { status: 500 });
  }

  // Local context for the brief comes from real published datasets rather than
  // the location YAML's retired `conditions` placeholders — so a brief carries
  // measured readings with their sources, not "pending live feed" notes.
  const localDatasets: DatasetFile<any>[] = (
    state.location === "san-antonio"
      ? [stormSanAntonio, droughtSanAntonio]
      : [stormAustin, droughtAustin]
  ) as DatasetFile<any>[];

  const locationConditions = localDatasets
    .filter((d) => d.status === "live" || d.status === "stale")
    .map((d) => {
      const measured = d.observations.filter((o) => !o.seed);
      const latest = measured.reduce(
        (max, o) => (!max || o.observedAt > max.observedAt ? o : max),
        measured[0],
      );
      const note =
        d.datasetId === "usdm-drought"
          ? `Most recent weekly reading: ${latest?.value?.droughtIndex ?? "unavailable"}.`
          : `${measured.length} severe-weather events recorded in the current reporting window.`;
      return {
        label: d.datasetId === "usdm-drought" ? "Drought conditions" : "Severe weather history",
        note,
        value: {
          status: d.status,
          asOf: d.lastSuccessAt ?? undefined,
          source: d.source.name,
        },
      };
    });

  const brief = generateBrief({
    project: state,
    service: {
      name: serviceEntry.data.name,
      evaluationItems: serviceEntry.data.evaluationItems,
      estimateQuestions: serviceEntry.data.estimateQuestions,
    },
    intakeFields: intakeEntry.data.fields.map((f) => ({ id: f.id, label: f.label })),
    locationConditions,
    locationName: locationEntry.data.name,
  });

  state.brief = brief;
  state.status = "brief_generated";
  state.updatedAt = brief.generatedAt;
  await putProject(state);
  await updateProjectStatus(projectId, "brief_generated", brief.generatedAt);
  await insertGeneratedBrief(projectId, brief);

  // Seam 2 (HANDOFF.md): stub — logged, not sent. Wire a real Slack
  // webhook here before go-live.
  console.log(`[stub slack] Brief generated for project ${projectId} (${state.email})`);

  return Response.json({ brief });
};
