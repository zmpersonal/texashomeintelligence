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

  const brief = generateBrief({
    project: state,
    service: {
      name: serviceEntry.data.name,
      evaluationItems: serviceEntry.data.evaluationItems,
      estimateQuestions: serviceEntry.data.estimateQuestions,
    },
    intakeFields: intakeEntry.data.fields.map((f) => ({ id: f.id, label: f.label })),
    locationConditions: locationEntry.data.conditions,
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
