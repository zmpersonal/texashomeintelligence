-- Round 9 — the weekly email. NOT APPLIED: owner review first (SECURITY.md 🟡).
--
-- Three tables, each answering one question the send loop cannot answer without
-- durable state:
--
--   account_email_prefs   may we email this person this kind of mail?
--   weekly_email_sends    have we already sent them this week?
--   email_suppressions    has this address bounced or complained?
--
-- ── The consent decision, ratified by the owner 2026-08-30 ─────────────────
--
-- `enabled` defaults to 0, and stays that way. Nobody is enrolled by the
-- migration, by the account consent, or by any backfill.
--
-- The consent a homeowner ticks to create an account (src/pages/home/sign-in.astro)
-- reads, verbatim: "Create my account and email me sign-in links and the home
-- alerts I choose. I can unsubscribe any time." Sign-in links, and the four
-- condition alerts they toggle. A weekly digest of their score is neither, so
-- it is asked for separately and never carried by that box.
--
-- Two places grant it, both an explicit act by the person:
--
--   * a SEPARATE, unticked checkbox on the sign-in form — the opt-in rides the
--     magic-link token and is written at verification, source 'signup'
--   * a toggle on the dashboard, beside the alert preferences, source 'dashboard'
--
-- And one place revokes it: the signed one-click unsubscribe link in every
-- weekly email, source 'unsubscribe-link'.
--
-- Existing accounts are NEVER enrolled retroactively. An unticked box is not a
-- request to unsubscribe either — see MagicTokenPayload.weeklyOptIn, which is
-- `true | absent` rather than a boolean for exactly that reason, so a returning
-- subscriber signing in without re-ticking keeps what they chose.

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
