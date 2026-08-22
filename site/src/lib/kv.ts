/**
 * Seam 3 (HANDOFF.md) — real KV reads/writes against the `PROJECTS_KV`
 * binding (see wrangler.jsonc; local dev runs this for real via Miniflare,
 * no external service involved). This is the "resumable via KV" mechanism:
 * project state lives here, keyed by project_id, and a separate
 * token→project_id map is how the secure return link resolves without
 * exposing the project_id itself as the secret.
 */
import { env } from "cloudflare:workers";
import type { ProjectState } from "./types";

const PROJECT_PREFIX = "project:";
const TOKEN_PREFIX = "token:";

export async function getProject(projectId: string): Promise<ProjectState | null> {
  const raw = await env.PROJECTS_KV.get(PROJECT_PREFIX + projectId);
  return raw ? (JSON.parse(raw) as ProjectState) : null;
}

export async function putProject(state: ProjectState): Promise<void> {
  await env.PROJECTS_KV.put(PROJECT_PREFIX + state.projectId, JSON.stringify(state));
}

export async function mapTokenToProject(token: string, projectId: string): Promise<void> {
  await env.PROJECTS_KV.put(TOKEN_PREFIX + token, projectId);
}

/** Resolves a return token to its project_id, or null if the token is
 * unknown/expired. Callers must still confirm the caller-supplied
 * project_id matches this result before treating a request as authorized. */
export async function resolveToken(token: string): Promise<string | null> {
  return env.PROJECTS_KV.get(TOKEN_PREFIX + token);
}
