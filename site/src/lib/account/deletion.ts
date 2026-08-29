/**
 * The deletion path.
 *
 * Built now rather than deferred, because a promise to delete that has never
 * been executed is not a deletion capability. It runs in dependency order and
 * does not rely on ON DELETE CASCADE: D1's foreign-key enforcement is a
 * setting, and a removal request must not depend on one.
 *
 * Everything personal goes: the address first (highest sensitivity), then the
 * reminders and their history, alert preferences and delivery log, the home,
 * and finally the account row itself. The session is revoked so an open tab
 * cannot keep acting as a deleted account.
 */
import { env } from "cloudflare:workers";
import { destroySession } from "../auth/session";

export interface DeletionReport {
  accountId: string;
  deleted: Record<string, number>;
  remaining: number;
}

export async function deleteAccountData(accountId: string, sessionId?: string): Promise<DeletionReport> {
  const home = await env.DB.prepare(`SELECT id FROM home_profiles WHERE account_id = ?`)
    .bind(accountId)
    .first<{ id: string }>();

  const deleted: Record<string, number> = {};
  const run = async (label: string, sql: string, ...binds: string[]) => {
    const res = await env.DB.prepare(sql).bind(...binds).run();
    deleted[label] = res.meta?.changes ?? 0;
  };

  if (home) {
    await run("home_addresses", `DELETE FROM home_addresses WHERE home_id = ?`, home.id);
    await run("reminder_events", `DELETE FROM reminder_events WHERE home_id = ?`, home.id);
    await run("reminders", `DELETE FROM reminders WHERE home_id = ?`, home.id);
    await run("alert_preferences", `DELETE FROM alert_preferences WHERE home_id = ?`, home.id);
    await run("alert_deliveries", `DELETE FROM alert_deliveries WHERE home_id = ?`, home.id);
    await run("home_profiles", `DELETE FROM home_profiles WHERE id = ?`, home.id);
  }
  await run("accounts", `DELETE FROM accounts WHERE id = ?`, accountId);

  await destroySession(sessionId);

  // Prove it, rather than assume it. Any row still referencing this account or
  // its home is an orphan, and the count is returned so the caller (and the
  // round's test) can assert zero.
  // Prove it, rather than assume it. Any row still referencing this account or
  // its home is an orphan, and the count is returned so the caller (and the
  // round's test) can assert zero. Bound, not interpolated — the id is ours,
  // but building SQL by concatenation is not a habit worth having in a file
  // that deletes things.
  const orphanTables: [string, string][] = [
    ["home_addresses", "home_id"],
    ["reminders", "home_id"],
    ["reminder_events", "home_id"],
    ["alert_preferences", "home_id"],
    ["alert_deliveries", "home_id"],
    ["home_profiles", "id"],
  ];
  let remaining = 0;
  if (home) {
    for (const [table, column] of orphanTables) {
      const row = await env.DB.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${column} = ?`)
        .bind(home.id)
        .first<{ c: number }>();
      remaining += Number(row?.c ?? 0);
    }
  }
  const acct = await env.DB.prepare(`SELECT COUNT(*) c FROM accounts WHERE id = ?`)
    .bind(accountId)
    .first<{ c: number }>();
  remaining += Number(acct?.c ?? 0);

  return { accountId, deleted, remaining };
}
