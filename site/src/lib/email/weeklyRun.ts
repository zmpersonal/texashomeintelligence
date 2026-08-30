/**
 * The weekly send loop.
 *
 * One pass over `weeklyRecipients()`, one message per person, one row written
 * per successful send. Everything that could send mail to the wrong person, or
 * twice, or with a link that does not work, is a hard stop rather than a
 * warning:
 *
 *   no EMAIL_LINK_SIGNING_KEY  → send NOTHING. An email whose unsubscribe link
 *                                cannot be signed is an email someone cannot
 *                                get out of. That is worse than not sending.
 *   migration not applied      → send NOTHING, and name the migration. This
 *                                branch is deployable before its DDL is run,
 *                                so it is a state the endpoint really meets.
 *   no artifact for the area   → skip that person. There is no reading to
 *                                report, and a weekly email with no reading is
 *                                a notification for its own sake.
 *   send fails                 → no `weekly_email_sends` row, so the next run
 *                                retries them instead of skipping them forever.
 *   send succeeds              → row written immediately, before the next
 *                                recipient, so a mid-run timeout cannot
 *                                re-send to anyone already reached.
 *
 * DRY RUN builds every message exactly as a real run would — same query, same
 * artifact, same rendering, same token signing — and then returns them instead
 * of sending. Nothing is written and nothing leaves the Worker. That is what
 * makes the recipient gate reviewable without mailing anyone to test it.
 *
 * ── Why this is driven by an HTTP call and not a Cron Trigger ─────────────
 * `@astrojs/cloudflare` 14.2.3 emits a Worker whose only export is the fetch
 * entry point — there is no `workerEntryPoint`/`scheduled` hook in that
 * adapter version (verified against its dist). A native Cloudflare Cron would
 * need a build-config or dependency change, which is ask-first (SECURITY.md).
 * So the schedule lives in the existing GitHub Actions cron and calls the
 * authenticated endpoint. See HANDOFF.md, Seam 11.
 */
import { env } from "cloudflare:workers";
import { readAreaIndex, type PrecomputedArea } from "../account/readIndex";
import { listReminders } from "../account/db";
import { sendEmail, activeTransport, type EmailTransport } from "./transport";
import { canSignLinks, signUnsubscribe } from "./unsubscribeToken";
import {
  WEEKLY_PREF_KEY, isoWeekKey, markSent, weeklyRecipients, weeklyTablesReady,
  type WeeklyRecipient,
} from "./weeklyRecipients";
import { buildWeeklyContent, weeklySubject, weeklyText, type WeeklyLinks } from "./weekly";

/** Recipients per invocation. Each one costs an ASSETS read (cached per area),
 * two D1 reads and one provider request; the cap keeps a run inside a Worker's
 * subrequest budget. Progress is durable, so the next call resumes. */
export const DEFAULT_BATCH = 100;

export interface WeeklyRunOptions {
  dryRun: boolean;
  limit?: number;
  weekKey?: string;
  /** Absolute origin for links, e.g. "https://texashomeintelligence.com". */
  origin: string;
  now?: Date;
}

export interface WeeklyRunOutcome {
  accountId: string;
  /** Present only on a dry run — a real run never returns an address. */
  email?: string;
  zip: string;
  areaId: string;
  status: "sent" | "would-send" | "skipped-no-artifact" | "failed";
  transport?: EmailTransport;
  error?: string;
  subject?: string;
  body?: string;
}

export interface WeeklyRunReport {
  weekKey: string;
  dryRun: boolean;
  transport: EmailTransport;
  eligible: number;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Set when the run refused to start. Nothing was sent. */
  halted?: string;
  outcomes: WeeklyRunOutcome[];
}

export async function runWeekly(options: WeeklyRunOptions): Promise<WeeklyRunReport> {
  const now = options.now ?? new Date();
  const weekKey = options.weekKey ?? isoWeekKey(now);
  const transport = activeTransport();
  const base: WeeklyRunReport = {
    weekKey, dryRun: options.dryRun, transport,
    eligible: 0, attempted: 0, sent: 0, failed: 0, skipped: 0, outcomes: [],
  };

  // Hard stop #1. Not a per-recipient skip: if links cannot be signed, no
  // message in this run is sendable, so the run does not start.
  if (!canSignLinks()) {
    return { ...base, halted: "EMAIL_LINK_SIGNING_KEY is not set — unsubscribe links cannot be signed." };
  }
  if (!env.DB) {
    return { ...base, halted: "No D1 binding — cannot read the recipient list or record sends." };
  }
  // Hard stop #2. The branch deploys before its DDL is applied, so this is a
  // state the endpoint genuinely meets — and it must be a legible 409, not a
  // 500 from a query against a table that does not exist.
  if (!(await weeklyTablesReady())) {
    return { ...base, halted: "Migration 0004_weekly_email.sql has not been applied to this database." };
  }

  const recipients = await weeklyRecipients(weekKey);
  base.eligible = recipients.length;

  const batch = recipients.slice(0, Math.max(0, options.limit ?? DEFAULT_BATCH));
  // One artifact read per AREA, not per recipient: every home in Austin reads
  // the same file.
  const artifacts = new Map<string, PrecomputedArea | null>();

  for (const r of batch) {
    base.attempted++;
    const outcome = await sendOne(r, {
      weekKey, now, transport, artifacts,
      origin: options.origin, dryRun: options.dryRun,
    });
    base.outcomes.push(outcome);
    if (outcome.status === "sent") base.sent++;
    else if (outcome.status === "failed") base.failed++;
    else if (outcome.status === "skipped-no-artifact") base.skipped++;
  }

  return base;
}

async function sendOne(
  r: WeeklyRecipient,
  ctx: {
    weekKey: string; now: Date; transport: EmailTransport; origin: string; dryRun: boolean;
    artifacts: Map<string, PrecomputedArea | null>;
  },
): Promise<WeeklyRunOutcome> {
  const shared = { accountId: r.accountId, zip: r.zip, areaId: r.areaId };

  if (!ctx.artifacts.has(r.areaId)) {
    ctx.artifacts.set(r.areaId, await readAreaIndex(r.areaId));
  }
  const index = ctx.artifacts.get(r.areaId) ?? null;
  if (!index) return { ...shared, status: "skipped-no-artifact" };

  const reminders = await listReminders(r.homeId);
  const content = buildWeeklyContent(index, { zip: r.zip, countyName: r.countyName }, reminders, ctx.now);

  // Signed per recipient. The token binds the account id AND the preference
  // key, so a token from one person's email cannot unsubscribe another, and a
  // weekly token cannot switch off their condition alerts.
  const token = await signUnsubscribe({ accountId: r.accountId, prefKey: WEEKLY_PREF_KEY });
  if (!token) return { ...shared, status: "failed", error: "could not sign unsubscribe token" };

  const unsubscribe = `${ctx.origin}/email/unsubscribe/?t=${encodeURIComponent(token)}`;
  const links: WeeklyLinks = {
    dashboard: `${ctx.origin}/home/`,
    preferences: `${ctx.origin}/home/#alerts-h`,
    unsubscribe,
  };

  const subject = weeklySubject(content);
  const text = weeklyText(content, links);

  if (ctx.dryRun) {
    return { ...shared, email: r.email, status: "would-send", transport: ctx.transport, subject, body: text };
  }

  const sent = await sendEmail({
    to: r.email,
    subject,
    text,
    headers: {
      // RFC 8058. The header is what a mail client's own unsubscribe button
      // reads; the link in the body is for the person who scrolls to it.
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (!sent.ok) return { ...shared, status: "failed", transport: sent.transport, error: sent.error };

  // Written before the next recipient, not batched at the end: a run that dies
  // halfway must not re-send to everyone it already reached.
  await markSent(r.accountId, ctx.weekKey, sent.transport);
  return { ...shared, status: "sent", transport: sent.transport, subject };
}
