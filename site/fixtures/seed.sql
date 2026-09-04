-- Sample seed rows for local development only. Obviously-fake data
-- (example.com emails, placeholder names) — never run against production.
--
-- ── WHY THIS FILE IS NOT IN migrations/ (Round 13) ────────────────────────
-- It used to be, and that was a live hazard. `wrangler d1 migrations apply`
-- globs `**/*.sql` under `migrations_dir`, so this file counted as a migration
-- and listed as UNAPPLIED — meaning the first `--remote` run of the migrations
-- workflow would have inserted these fake rows into the production database.
-- Verified before the move, against a throwaway local database: it appeared in
-- `wrangler d1 migrations list` alongside 0001-0004.
--
-- `migrations/` is now exactly the set of files wrangler may run. Anything that
-- must never run against production does not live there. Do not move this back.
--
-- To load it locally, name it explicitly:
--   npx wrangler d1 execute texas-home-intelligence-db --local \
--     --persist-to .wrangler/state --file fixtures/seed.sql
-- Note that `scripts/local-fixture.ts` does NOT use this file — it writes its
-- own richer fixture covering the 0003/0004 tables, which these rows predate.

INSERT INTO projects (id, first_name, email, service, location, status, created_at, updated_at)
VALUES
  ('seed-project-001', 'Jamie', 'jamie.seed@example.com', 'roofing', 'austin', 'brief_generated', '2026-08-01T14:00:00Z', '2026-08-01T14:12:00Z'),
  ('seed-project-002', 'Riley', 'riley.seed@example.com', 'hvac', 'san-antonio', 'in_progress', '2026-08-10T09:30:00Z', '2026-08-10T09:31:00Z');

INSERT INTO intake_responses (project_id, field_id, value, created_at)
VALUES
  ('seed-project-001', 'overview', 'Ceiling stain in the upstairs bathroom, first noticed after a hailstorm.', '2026-08-01T14:05:00Z'),
  ('seed-project-001', 'urgency', 'Soon — within the next couple weeks', '2026-08-01T14:05:00Z'),
  ('seed-project-001', 'leak-location', 'Upstairs bathroom ceiling', '2026-08-01T14:06:00Z'),
  ('seed-project-001', 'storm-hail-history', 'true', '2026-08-01T14:06:00Z'),
  ('seed-project-002', 'overview', 'Upstairs stays warm even when the thermostat is set low.', '2026-08-10T09:30:30Z'),
  ('seed-project-002', 'symptom', 'Weak airflow', '2026-08-10T09:31:00Z');

INSERT INTO generated_briefs (project_id, brief_json, methodology_version, created_at)
VALUES
  ('seed-project-001', '{"sections":{"projectSummary":"Seed example brief for local development."}}', 'v1', '2026-08-01T14:12:00Z');

INSERT INTO contractor_requests (project_id, requested_count, phone, created_at)
VALUES
  ('seed-project-001', 3, NULL, '2026-08-01T14:15:00Z');
