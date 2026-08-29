-- Round 5 — accounts, home profiles, reminders, condition alerts.
--
-- The project's first durable identity + address data. Three principles the
-- shape of these tables is meant to enforce rather than merely describe:
--
--  1. CONSENT IS A COLUMN, NOT A CONVENTION. Every table that holds personal
--     data carries consent + consent_source + consent_at, CHECK-constrained so
--     a row without consent cannot exist. Consent provenance cannot be
--     reconstructed later, so it is stored beside the data it authorises.
--
--  2. THE ADDRESS IS ISOLATED. It is the highest-sensitivity field we hold and
--     it lives in its own table with its own consent record, so it can be
--     deleted on its own — someone can drop their address and keep their
--     account. Everything else works from the ZIP.
--
--  3. DELETION IS A BUILT PATH, NOT A PROMISE. Cascades are declared, and
--     src/lib/account/deletion.ts also deletes explicitly in dependency order
--     so removal does not depend on D1's foreign-key pragma being on.
--
-- Separate from BOTH earlier schemas per HANDOFF.md Seam 4: the QuoteReady
-- tables (0001) and dashboard_launch_signups (0002). They share a database,
-- not a schema.
--
-- Sessions and magic-link tokens are deliberately NOT here — they live in the
-- SESSION KV namespace, where expiry is native and an abandoned token disappears
-- on its own rather than accumulating as stale rows in a table of live secrets.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,                  -- uuid
  email TEXT NOT NULL UNIQUE,
  -- 'pending' never occurs today: a row is written only after a mailbox is
  -- proven. Kept so a future invite flow has somewhere to sit.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active')),
  consent INTEGER NOT NULL CHECK (consent = 1),
  consent_source TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

-- One home per account this round. Carries the resolved geography, so the
-- dashboard never re-resolves and the reading shown is provably the one the
-- Census crosswalk gave us at signup.
CREATE TABLE IF NOT EXISTS home_profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  zip TEXT NOT NULL,
  area_id TEXT NOT NULL,                -- 'austin' | 'san-antonio'
  county_name TEXT NOT NULL,
  county_fips TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- The address, alone, with its own consent. It buys nothing at parcel level —
-- we hold no parcel data — it personalises reminders and confirms the ZIP.
CREATE TABLE IF NOT EXISTS home_addresses (
  home_id TEXT PRIMARY KEY REFERENCES home_profiles(id) ON DELETE CASCADE,
  address_line TEXT NOT NULL,
  consent INTEGER NOT NULL CHECK (consent = 1),
  consent_source TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- User-set maintenance cadences. No external data: the homeowner says how
-- often, we do the arithmetic and remember.
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES home_profiles(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,               -- catalogue key, e.g. 'hvac-filter'
  label TEXT NOT NULL,
  cadence_days INTEGER NOT NULL CHECK (cadence_days > 0),
  next_due_at TEXT NOT NULL,
  last_done_at TEXT,
  snoozed_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_home ON reminders(home_id, status, next_due_at);

-- Append-only history. This is the "Last changed ✓" the design calls the moat:
-- deleting a reminder must not erase the record that it was done, until the
-- whole home is deleted.
CREATE TABLE IF NOT EXISTS reminder_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  home_id TEXT NOT NULL REFERENCES home_profiles(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('created', 'completed', 'snoozed', 'skipped')),
  occurred_at TEXT NOT NULL,
  -- The due date this event produced, so the recalculation is auditable after
  -- the fact rather than only inferable from the current row.
  next_due_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reminder_events_home ON reminder_events(home_id, occurred_at);

CREATE TABLE IF NOT EXISTS alert_preferences (
  home_id TEXT NOT NULL REFERENCES home_profiles(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,              -- 'freeze' | 'hail' | 'heat' | 'heavy-rain'
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (home_id, alert_key)
);

-- One condition fires once. `condition_key` is derived from the underlying
-- reading (source + date), so re-running the alert pass over unchanged data
-- cannot email someone twice about the same freeze.
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  home_id TEXT NOT NULL REFERENCES home_profiles(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  condition_key TEXT NOT NULL,
  fired_at TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'dashboard'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_deliveries_once
  ON alert_deliveries(home_id, alert_key, condition_key, channel);
