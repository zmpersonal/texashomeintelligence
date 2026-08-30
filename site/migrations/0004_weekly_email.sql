-- Round 9 — the weekly email. NOT APPLIED: owner review first (SECURITY.md 🟡).
--
-- Three tables, each answering one question the send loop cannot answer without
-- durable state:
--
--   account_email_prefs   may we email this person this kind of mail?
--   weekly_email_sends    have we already sent them this week?
--   email_suppressions    has this address bounced or complained?
--
-- ── The consent question, which is the one that needs your decision ────────
--
-- `enabled` defaults to 0, not 1. That is deliberate and it means the first run
-- has zero recipients until you decide otherwise.
--
-- The consent a homeowner actually ticks today (src/pages/home/sign-in.astro)
-- reads, verbatim: "Create my account and email me sign-in links and the home
-- alerts I choose. I can unsubscribe any time."
--
-- Sign-in links, and the four condition alerts they toggle. A weekly digest of
-- their score is neither of those — so defaulting ON would send mail on a
-- consent that does not clearly cover it.
--
-- Defaulting OFF is the honest reading. Two ways forward, your call:
--
--   a) Keep OFF and let people opt in from the dashboard. This round builds
--      that control, next to the alert preferences, so (a) works today.
--   b) Update the consent copy to name the weekly email, and default ON for
--      accounts created after that copy ships — never retroactively for
--      accounts that consented under the current wording.
--
-- Nothing in this migration forecloses either.

CREATE TABLE IF NOT EXISTS account_email_prefs (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- 'weekly' today. A key rather than a column so a second kind of mail does
  -- not need a migration, and so one preference can never silently carry
  -- another's consent.
  pref_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  -- Why it holds this value: 'signup' | 'dashboard' | 'unsubscribe-link'.
  -- An unsubscribe must be auditable after the fact.
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, pref_key)
);

-- Idempotency. One row per account per ISO week; the primary key is the guard,
-- so a second run in the same week cannot double-send even if two runs overlap.
-- Written only after a send succeeds — a transient failure leaves no row, so
-- the next run retries rather than skipping that person forever.
CREATE TABLE IF NOT EXISTS weekly_email_sends (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,               -- ISO year-week, e.g. '2026-W35'
  sent_at TEXT NOT NULL,
  transport TEXT NOT NULL,              -- 'resend' | 'stub'
  PRIMARY KEY (account_id, week_key)
);

-- Bounces and complaints. Keyed by address rather than account so a suppression
-- survives account deletion and re-creation: if a mailbox hard-bounced, sending
-- to it again because the person made a new account is the same mistake twice.
CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint', 'manual')),
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_sends_week ON weekly_email_sends(week_key);
