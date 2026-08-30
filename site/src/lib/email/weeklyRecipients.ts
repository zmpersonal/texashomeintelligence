/**
 * Who gets the weekly email.
 *
 * The whole gate is one SQL statement, on purpose: a recipient list assembled
 * across several queries and filtered in JavaScript is a list where one missed
 * branch sends mail to someone who said no. Every exclusion below is a JOIN or
 * a WHERE clause, so "did we check consent?" is answerable by reading it.
 *
 * A row is returned only when ALL of these hold:
 *
 *   1. The account exists and is active.
 *   2. It carries consent (the column is CHECK-constrained to 1, so its mere
 *      presence is the proof — but it is asserted here anyway rather than
 *      relied on implicitly).
 *   3. It has a home profile with a ZIP and a resolvable area.
 *   4. It has the 'weekly' email preference explicitly enabled. Absent means
 *      NOT enabled — a missing row is never treated as opt-in.
 *   5. The address is not suppressed (hard bounce, complaint, or manual).
 *   6. It has not already been sent this ISO week.
 *
 * Note what is structurally absent: `dashboard_launch_signups`. That table is
 * never joined, never unioned, never read here. A launch-signup row is an
 * address that asked to be told when the product was ready — it is not an
 * account, it carries no weekly-email preference, and there is no code path in
 * this file that could reach it.
 */
import { env } from "cloudflare:workers";

export const WEEKLY_PREF_KEY = "weekly";

export interface WeeklyRecipient {
  accountId: string;
  email: string;
  homeId: string;
  zip: string;
  areaId: string;
  countyName: string;
}

/** ISO year-week, e.g. "2026-W35" — the idempotency key for a send. */
export function isoWeekKey(date: Date): string {
  // ISO weeks start Monday and week 1 contains the first Thursday.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function weeklyRecipients(weekKey: string): Promise<WeeklyRecipient[]> {
  const db = env.DB;
  if (!db) return [];

  const { results } = await db
    .prepare(
      `SELECT a.id   AS accountId,
              a.email AS email,
              h.id   AS homeId,
              h.zip  AS zip,
              h.area_id AS areaId,
              h.county_name AS countyName
         FROM accounts a
         JOIN home_profiles h        ON h.account_id = a.id
         JOIN account_email_prefs p  ON p.account_id = a.id AND p.pref_key = ?
    LEFT JOIN email_suppressions s   ON s.email = a.email
    LEFT JOIN weekly_email_sends w   ON w.account_id = a.id AND w.week_key = ?
        WHERE a.status = 'active'
          AND a.consent = 1
          AND p.enabled = 1
          AND s.email IS NULL
          AND w.account_id IS NULL
          AND h.zip IS NOT NULL AND h.zip <> ''
          AND h.area_id IS NOT NULL AND h.area_id <> ''
        ORDER BY a.created_at`,
    )
    .bind(WEEKLY_PREF_KEY, weekKey)
    .all<WeeklyRecipient>();

  return results ?? [];
}

/** Records a successful send. The primary key is what makes a re-run a no-op. */
export async function markSent(
  accountId: string,
  weekKey: string,
  transport: string,
): Promise<void> {
  const db = env.DB;
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO weekly_email_sends (account_id, week_key, sent_at, transport)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, week_key) DO NOTHING`,
    )
    .bind(accountId, weekKey, new Date().toISOString(), transport)
    .run();
}

/** Bounce / complaint suppression. Keyed by address, so it outlives the account. */
export async function suppress(
  email: string,
  reason: "bounce" | "complaint" | "manual",
  detail?: string,
): Promise<void> {
  const db = env.DB;
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO email_suppressions (email, reason, detail, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, detail = excluded.detail`,
    )
    .bind(email.trim().toLowerCase(), reason, detail ?? null, new Date().toISOString())
    .run();
}

export async function setWeeklyPref(
  accountId: string,
  enabled: boolean,
  source: string,
): Promise<void> {
  const db = env.DB;
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO account_email_prefs (account_id, pref_key, enabled, source, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, pref_key)
       DO UPDATE SET enabled = excluded.enabled, source = excluded.source, updated_at = excluded.updated_at`,
    )
    .bind(accountId, WEEKLY_PREF_KEY, enabled ? 1 : 0, source, new Date().toISOString())
    .run();
}

/**
 * The dashboard's view of the weekly preference.
 *
 * `available: false` means the Round 9 migration has not been applied to this
 * database yet — the table genuinely is not there. The dashboard then omits
 * the control rather than rendering a switch that cannot be saved, which is
 * what lets this branch deploy to staging before the DDL is run.
 *
 * Absent row = not enabled. A missing preference is never read as opt-in.
 */
export async function weeklyPrefState(
  accountId: string,
): Promise<{ available: boolean; enabled: boolean }> {
  const db = env.DB;
  if (!db) return { available: false, enabled: false };
  try {
    const row = await db
      .prepare(`SELECT enabled FROM account_email_prefs WHERE account_id = ? AND pref_key = ?`)
      .bind(accountId, WEEKLY_PREF_KEY)
      .first<{ enabled: number }>();
    return { available: true, enabled: row?.enabled === 1 };
  } catch {
    return { available: false, enabled: false };
  }
}

/**
 * Whether this database has had the Round 9 migration applied.
 *
 * The branch is deployable before the DDL is run — that is deliberate — so the
 * send loop has to meet a database without these tables and say so, rather
 * than throwing a 500 at whatever triggered it. Measured: without this, a run
 * against an unmigrated database returned a bare 500 with no indication of
 * why, which is the least useful thing a scheduled job can do.
 */
export async function weeklyTablesReady(): Promise<boolean> {
  const db = env.DB;
  if (!db) return false;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('account_email_prefs', 'weekly_email_sends', 'email_suppressions')`,
    )
    .first<{ n: number }>();
  return row?.n === 3;
}
