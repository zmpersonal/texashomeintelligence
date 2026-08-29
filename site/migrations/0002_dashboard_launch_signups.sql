-- Round 4 — the dashboard's own PII table.
--
-- Deliberately SEPARATE from the QuoteReady tables in 0001_init.sql, per the
-- decision recorded in HANDOFF.md Seam 4: someone who asks to hear when the
-- home dashboard launches has not started a QuoteReady project, and folding
-- the two together would make it ambiguous later what a given person actually
-- consented to. They share a database, not a schema.
--
-- This table holds the only personal data Texas Home Intelligence collects at
-- this stage: an email address, the ZIP the person was looking at, and the
-- consent that permits us to hold it. No name, no street address, no phone.

CREATE TABLE IF NOT EXISTS dashboard_launch_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  -- The ZIP whose dashboard they were viewing. Area-level, not an address.
  zip TEXT NOT NULL,

  -- Consent provenance. A row cannot exist without consent: the API refuses to
  -- insert unless the box was ticked, and the CHECK makes that a property of
  -- the data rather than a promise about the code. Consent provenance cannot
  -- be reconstructed after the fact, which is why it is stored with the row
  -- and not inferred later.
  consent INTEGER NOT NULL CHECK (consent = 1),
  -- Where the consent was given, e.g. 'dashboard_zip_78704', so a later
  -- request to explain or withdraw can be answered precisely.
  consent_source TEXT NOT NULL,
  consent_at TEXT NOT NULL,

  created_at TEXT NOT NULL
);

-- One live signup per address. Re-submitting updates the existing row rather
-- than accumulating duplicates that would each have to be deleted separately
-- on a removal request.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_launch_signups_email
  ON dashboard_launch_signups(email);
