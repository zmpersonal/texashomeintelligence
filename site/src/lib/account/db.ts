/**
 * D1 access for accounts, homes, reminders and alert prefs.
 *
 * Every function here is server-only and takes an account or home id that the
 * caller has already established from the session — none of them trust an id
 * from a request body. `requireHomeOwned` is the one guard that turns a
 * user-supplied reminder id into an owned one.
 */
import { env } from "cloudflare:workers";

export interface Account {
  id: string;
  email: string;
  consentSource: string;
  consentAt: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface HomeProfile {
  id: string;
  accountId: string;
  zip: string;
  areaId: string;
  countyName: string;
  countyFips: string;
}

export interface Reminder {
  id: string;
  homeId: string;
  taskKey: string;
  label: string;
  cadenceDays: number;
  nextDueAt: string;
  lastDoneAt: string | null;
  snoozedUntil: string | null;
  status: string;
}

const now = () => new Date().toISOString();

/**
 * Find-or-create on verified sign-in. Consent travels from the magic-link
 * payload, so a row cannot be written for someone who never ticked the box.
 */
export async function upsertAccount(params: {
  email: string;
  consentSource: string;
  consentAt: string;
}): Promise<Account> {
  const existing = await env.DB.prepare(`SELECT * FROM accounts WHERE email = ?`)
    .bind(params.email)
    .first<Record<string, unknown>>();

  if (existing) {
    await env.DB.prepare(`UPDATE accounts SET last_seen_at = ? WHERE id = ?`)
      .bind(now(), existing.id as string)
      .run();
    return toAccount({ ...existing, last_seen_at: now() });
  }

  const id = crypto.randomUUID();
  const created = now();
  await env.DB.prepare(
    `INSERT INTO accounts (id, email, status, consent, consent_source, consent_at, created_at, last_seen_at)
     VALUES (?, ?, 'active', 1, ?, ?, ?, ?)`,
  )
    .bind(id, params.email, params.consentSource, params.consentAt, created, created)
    .run();
  return {
    id,
    email: params.email,
    consentSource: params.consentSource,
    consentAt: params.consentAt,
    createdAt: created,
    lastSeenAt: created,
  };
}

function toAccount(row: Record<string, unknown>): Account {
  return {
    id: row.id as string,
    email: row.email as string,
    consentSource: row.consent_source as string,
    consentAt: row.consent_at as string,
    createdAt: row.created_at as string,
    lastSeenAt: (row.last_seen_at as string) ?? null,
  };
}

export async function getAccount(id: string): Promise<Account | null> {
  const row = await env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? toAccount(row) : null;
}

export async function getHomeForAccount(accountId: string): Promise<HomeProfile | null> {
  const row = await env.DB.prepare(`SELECT * FROM home_profiles WHERE account_id = ?`)
    .bind(accountId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    zip: row.zip as string,
    areaId: row.area_id as string,
    countyName: row.county_name as string,
    countyFips: row.county_fips as string,
  };
}

export async function createHome(params: {
  accountId: string;
  zip: string;
  areaId: string;
  countyName: string;
  countyFips: string;
  /** Optional. Stored separately, with its own consent, or not at all. */
  addressLine?: string;
  consentSource: string;
}): Promise<HomeProfile> {
  const id = crypto.randomUUID();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO home_profiles (id, account_id, zip, area_id, county_name, county_fips, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       zip = excluded.zip, area_id = excluded.area_id, county_name = excluded.county_name,
       county_fips = excluded.county_fips, updated_at = excluded.updated_at`,
  )
    .bind(id, params.accountId, params.zip, params.areaId, params.countyName, params.countyFips, ts, ts)
    .run();

  const home = (await getHomeForAccount(params.accountId))!;

  if (params.addressLine) {
    await env.DB.prepare(
      `INSERT INTO home_addresses (home_id, address_line, consent, consent_source, consent_at, created_at)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(home_id) DO UPDATE SET
         address_line = excluded.address_line, consent_source = excluded.consent_source,
         consent_at = excluded.consent_at`,
    )
      .bind(home.id, params.addressLine, params.consentSource, ts, ts)
      .run();
  }
  return home;
}

export async function getAddress(homeId: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT address_line FROM home_addresses WHERE home_id = ?`)
    .bind(homeId)
    .first<{ address_line: string }>();
  return row?.address_line ?? null;
}

// ── reminders ─────────────────────────────────────────────────────────────

function toReminder(row: Record<string, unknown>): Reminder {
  return {
    id: row.id as string,
    homeId: row.home_id as string,
    taskKey: row.task_key as string,
    label: row.label as string,
    cadenceDays: Number(row.cadence_days),
    nextDueAt: row.next_due_at as string,
    lastDoneAt: (row.last_done_at as string) ?? null,
    snoozedUntil: (row.snoozed_until as string) ?? null,
    status: row.status as string,
  };
}

export async function listReminders(homeId: string): Promise<Reminder[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM reminders WHERE home_id = ? AND status = 'active' ORDER BY next_due_at ASC`,
  )
    .bind(homeId)
    .all<Record<string, unknown>>();
  return (results ?? []).map(toReminder);
}

export async function createReminder(params: {
  homeId: string;
  taskKey: string;
  label: string;
  cadenceDays: number;
  firstDueAt: string;
}): Promise<Reminder> {
  const id = crypto.randomUUID();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO reminders (id, home_id, task_key, label, cadence_days, next_due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, params.homeId, params.taskKey, params.label, params.cadenceDays, params.firstDueAt, ts, ts)
    .run();
  await recordEvent(id, params.homeId, "created", params.firstDueAt);
  return {
    id, homeId: params.homeId, taskKey: params.taskKey, label: params.label,
    cadenceDays: params.cadenceDays, nextDueAt: params.firstDueAt,
    lastDoneAt: null, snoozedUntil: null, status: "active",
  };
}

/** The ownership guard. A reminder id from a request body means nothing until
 * it is proven to belong to the session's home. */
export async function requireOwnedReminder(homeId: string, reminderId: string): Promise<Reminder | null> {
  const row = await env.DB.prepare(`SELECT * FROM reminders WHERE id = ? AND home_id = ?`)
    .bind(reminderId, homeId)
    .first<Record<string, unknown>>();
  return row ? toReminder(row) : null;
}

export async function recordEvent(
  reminderId: string,
  homeId: string,
  event: "created" | "completed" | "snoozed" | "skipped",
  nextDueAt: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO reminder_events (reminder_id, home_id, event, occurred_at, next_due_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(reminderId, homeId, event, now(), nextDueAt)
    .run();
}

export async function applyReminderUpdate(
  reminder: Reminder,
  update: { nextDueAt: string; lastDoneAt?: string | null; snoozedUntil?: string | null },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE reminders SET next_due_at = ?, last_done_at = ?, snoozed_until = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      update.nextDueAt,
      update.lastDoneAt !== undefined ? update.lastDoneAt : reminder.lastDoneAt,
      update.snoozedUntil !== undefined ? update.snoozedUntil : reminder.snoozedUntil,
      now(),
      reminder.id,
    )
    .run();
}

// ── alert preferences ─────────────────────────────────────────────────────

export async function getAlertPrefs(homeId: string): Promise<Record<string, boolean>> {
  const { results } = await env.DB.prepare(
    `SELECT alert_key, enabled FROM alert_preferences WHERE home_id = ?`,
  )
    .bind(homeId)
    .all<{ alert_key: string; enabled: number }>();
  const out: Record<string, boolean> = {};
  for (const row of results ?? []) out[row.alert_key] = row.enabled === 1;
  return out;
}

export async function setAlertPref(homeId: string, alertKey: string, enabled: boolean): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO alert_preferences (home_id, alert_key, enabled, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(home_id, alert_key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
  )
    .bind(homeId, alertKey, enabled ? 1 : 0, now())
    .run();
}

/** Returns false when this exact condition already fired on this channel —
 * the unique index makes "fire once" a property of the data. */
export async function claimAlertDelivery(
  homeId: string,
  alertKey: string,
  conditionKey: string,
  channel: "email" | "dashboard",
): Promise<boolean> {
  try {
    await env.DB.prepare(
      `INSERT INTO alert_deliveries (home_id, alert_key, condition_key, fired_at, channel)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(homeId, alertKey, conditionKey, now(), channel)
      .run();
    return true;
  } catch {
    return false;
  }
}
