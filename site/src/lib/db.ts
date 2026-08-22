/**
 * Seam 3 (HANDOFF.md) — real D1 reads/writes against the `DB` binding
 * (see wrangler.jsonc + migrations/0001_init.sql). D1 is the durable,
 * queryable mirror of the pipeline; KV (src/lib/kv.ts) is the live,
 * resumable session state. Local dev runs this for real via Miniflare.
 */
import { env } from "cloudflare:workers";
import type { ProjectState, GeneratedBrief, ContractorRequest } from "./types";

export async function insertProject(state: ProjectState): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO projects (id, first_name, email, service, location, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      state.projectId,
      state.firstName,
      state.email,
      state.service,
      state.location,
      state.status,
      state.createdAt,
      state.updatedAt,
    )
    .run();
}

export async function updateProjectServiceLocation(
  projectId: string,
  service: string,
  location: string,
  updatedAt: string,
): Promise<void> {
  await env.DB.prepare(`UPDATE projects SET service = ?, location = ?, updated_at = ? WHERE id = ?`)
    .bind(service, location, updatedAt, projectId)
    .run();
}

export async function updateProjectStatus(
  projectId: string,
  status: ProjectState["status"],
  updatedAt: string,
): Promise<void> {
  await env.DB.prepare(`UPDATE projects SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, updatedAt, projectId)
    .run();
}

export async function insertIntakeResponse(
  projectId: string,
  fieldId: string,
  value: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO intake_responses (project_id, field_id, value, created_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(projectId, fieldId, value, new Date().toISOString())
    .run();
}

export async function insertGeneratedBrief(
  projectId: string,
  brief: GeneratedBrief,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO generated_briefs (project_id, brief_json, methodology_version, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(projectId, JSON.stringify(brief), brief.methodologyVersion, brief.generatedAt)
    .run();
}

export async function insertContractorRequest(request: ContractorRequest): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO contractor_requests (project_id, requested_count, phone, created_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(request.projectId, request.requestedCount, request.phone ?? null, new Date().toISOString())
    .run();
}
