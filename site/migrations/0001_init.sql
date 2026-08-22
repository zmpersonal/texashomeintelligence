-- Seam 3 (HANDOFF.md): structured lead/project records. D1 is the durable,
-- queryable mirror of the intake pipeline; the live/resumable session state
-- lives in KV (see src/lib/kv.ts). Nothing here holds the return token — the
-- token→project_id mapping is KV-only, per CLAUDE.md's KV/D1 split.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,               -- project_id (uuid)
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  service TEXT NOT NULL,             -- services collection id
  location TEXT NOT NULL,            -- locations collection id
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'brief_generated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One row per answered intake field. A field the homeowner never answers
-- simply has no row here — the brief generator reads this table's absence,
-- not a null/zero placeholder, to populate "Information Still Needed."
CREATE TABLE IF NOT EXISTS intake_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  field_id TEXT NOT NULL,            -- matches an intake-questions field id,
                                      -- or one of: overview, urgency, address,
                                      -- prior_work, objectives
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  brief_json TEXT NOT NULL,          -- the deterministic GeneratedBrief, serialized
  methodology_version TEXT NOT NULL, -- see src/lib/brief.ts BRIEF_METHODOLOGY_VERSION
  created_at TEXT NOT NULL
);

-- Post-brief screen only (CLAUDE.md: no 1/2/3 choice before the brief
-- exists). requested_count is validated to 1-3 in the API layer.
CREATE TABLE IF NOT EXISTS contractor_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  requested_count INTEGER NOT NULL CHECK (requested_count BETWEEN 1 AND 3),
  phone TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intake_responses_project ON intake_responses(project_id);
CREATE INDEX IF NOT EXISTS idx_contractor_requests_project ON contractor_requests(project_id);
