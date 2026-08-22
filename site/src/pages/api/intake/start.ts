/**
 * POST /api/intake/start — step 1 of the intake flow. First name + email
 * only, per CLAUDE.md's non-negotiable rule: no phone required to start,
 * and service isn't chosen until step 2. Creates the project + a secure
 * return token, persists to KV (live state) and D1 (durable mirror), and
 * stub-logs the return-link email — see HANDOFF.md Seam 2 for the real
 * provider to wire in.
 */
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { startIntakeSchema } from "../../../lib/validation";
import { newProjectId, newReturnToken } from "../../../lib/token";
import { putProject, mapTokenToProject } from "../../../lib/kv";
import { insertProject } from "../../../lib/db";
import type { ProjectState } from "../../../lib/types";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = startIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { firstName, email } = parsed.data;

  const now = new Date().toISOString();
  const state: ProjectState = {
    projectId: newProjectId(),
    firstName,
    email,
    service: "",
    location: "",
    status: "in_progress",
    answers: {},
    createdAt: now,
    updatedAt: now,
  };
  const token = newReturnToken();

  await putProject(state);
  await mapTokenToProject(token, state.projectId);
  await insertProject(state);

  // Seam 2 (HANDOFF.md): stub — logged, not sent. Wire a real email
  // provider here (e.g. Resend) before go-live. Points at /start/ (not
  // /brief/) because the brief doesn't exist yet at this point — this
  // link resumes the intake, it doesn't view a result.
  console.log(
    `[stub email] Return link for ${state.email}: /start/?resume=${state.projectId}&token=${token}`,
  );

  return Response.json({ projectId: state.projectId, token }, { status: 201 });
};
