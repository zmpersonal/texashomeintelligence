/**
 * GET  /api/intake/:project_id?token=...  — resume: hydrate the form
 *      with everything already answered.
 * PATCH /api/intake/:project_id           — save a batch of answers as
 *      the homeowner progresses. Every field is written to KV (live
 *      state, what makes resume possible) and appended to D1
 *      (durable, append-only mirror).
 *
 * Both require the return token from /api/intake/start, resolved through
 * KV (src/lib/kv.ts) — knowing a project_id alone is not sufficient.
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { z } from "astro/zod";
import { patchIntakeSchema } from "../../../../lib/validation";
import { getProject, putProject, resolveToken } from "../../../../lib/kv";
import { insertIntakeResponse, updateProjectServiceLocation } from "../../../../lib/db";

export const prerender = false;

async function authorize(projectId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const resolved = await resolveToken(token);
  return resolved === projectId;
}

export const GET: APIRoute = async ({ params, url }) => {
  const projectId = params.project_id!;
  const token = url.searchParams.get("token");

  if (!(await authorize(projectId, token))) {
    return Response.json({ error: "Invalid or missing token" }, { status: 403 });
  }
  const state = await getProject(projectId);
  if (!state) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return Response.json({ project: state });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const projectId = params.project_id!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const parsed = patchIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { token, patch } = parsed.data;

  if (!(await authorize(projectId, token))) {
    return Response.json({ error: "Invalid or missing token" }, { status: 403 });
  }
  const state = await getProject(projectId);
  if (!state) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (state.status === "brief_generated") {
    return Response.json(
      { error: "This project's brief has already been generated and can no longer be edited." },
      { status: 409 },
    );
  }

  // "service" and "location" are project-level fields, not free-form
  // answers — step 2 of the intake sets these, validated against the
  // real config collections, before any service-specific question can
  // make sense.
  const { service, location, ...answerPatch } = patch;
  let serviceOrLocationChanged = false;
  if (service !== undefined) {
    const services = await getCollection("services");
    if (!services.some((s) => s.id === service)) {
      return Response.json({ error: `Unknown service "${service}"` }, { status: 400 });
    }
    state.service = service;
    serviceOrLocationChanged = true;
  }
  if (location !== undefined) {
    const locations = await getCollection("locations");
    if (!locations.some((l) => l.id === location)) {
      return Response.json({ error: `Unknown location "${location}"` }, { status: 400 });
    }
    state.location = location;
    serviceOrLocationChanged = true;
  }

  state.answers = { ...state.answers, ...answerPatch };
  state.updatedAt = new Date().toISOString();
  await putProject(state);

  await Promise.all(
    Object.entries(patch).map(([fieldId, value]) => insertIntakeResponse(projectId, fieldId, value)),
  );
  // Keep the D1 durable mirror's service/location in sync — it's only
  // written once at project creation otherwise (start.ts), before either
  // is known.
  if (serviceOrLocationChanged) {
    await updateProjectServiceLocation(projectId, state.service, state.location, state.updatedAt);
  }

  return Response.json({ project: state });
};
