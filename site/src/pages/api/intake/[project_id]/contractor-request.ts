/**
 * POST /api/intake/:project_id/contractor-request — the post-brief
 * screen only. CLAUDE.md: "No 1/2/3 contractor choice before the brief."
 * Enforced here server-side (status must already be brief_generated),
 * not just hidden in the UI. Phone may be requested at this stage.
 */
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { contractorRequestSchema } from "../../../../lib/validation";
import { getProject, resolveToken } from "../../../../lib/kv";
import { insertContractorRequest } from "../../../../lib/db";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = params.project_id!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const parsed = contractorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { token, requestedCount, phone } = parsed.data;

  const resolved = await resolveToken(token);
  if (resolved !== projectId) {
    return Response.json({ error: "Invalid or missing token" }, { status: 403 });
  }

  const state = await getProject(projectId);
  if (!state) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (state.status !== "brief_generated") {
    return Response.json(
      { error: "Contractor introductions are only available after your brief has been generated." },
      { status: 409 },
    );
  }

  await insertContractorRequest({ projectId, requestedCount, phone });

  // Seam 2 (HANDOFF.md): stub — logged, not sent. Wire real contractor
  // matching / Slack notification here before go-live.
  console.log(
    `[stub] Contractor match requested for project ${projectId}: ${requestedCount} companies${phone ? `, phone ${phone}` : ""}`,
  );

  return Response.json({ ok: true });
};
