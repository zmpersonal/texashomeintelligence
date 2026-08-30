/**
 * Internal lead notification — ops awareness only.
 *
 * ══ THE BOUNDARY THIS FILE EXISTS TO KEEP ══════════════════════════════════
 *
 * This is a SEPARATE code path from `lib/email/transport.ts` and must stay one.
 * Resend is homeowner-only: magic links, condition alerts, the weekly email —
 * each to exactly one recipient, the person the message is about. Nothing here
 * touches that transport, its payload, its headers or its recipient list. No
 * bcc, no reply-to, no "also send a copy". A lead reaching the owner's Slack
 * and a homeowner receiving their own sign-in link are two different systems
 * that happen to be triggered by the same event, and they are wired that way
 * on purpose — see HANDOFF.md Seam 5.
 *
 * ══ RELIABILITY ═══════════════════════════════════════════════════════════
 *
 * Best-effort, always. A Slack outage must never cost a real signup. Every
 * call is fired AFTER the database write commits, wrapped in its own try/catch,
 * and its result is discarded. `notifyLead` never throws and never rejects:
 * the worst it does is log. If the secret is absent the whole path no-ops with
 * a debug line, exactly like the email stub — so a fresh checkout with no
 * secrets set still signs people up normally.
 *
 * ══ THE SECRET ════════════════════════════════════════════════════════════
 *
 * `SLACK_LEADS_WEBHOOK_URL` is a Worker secret the owner sets with
 * `wrangler secret put`. It is read at call time (so setting it takes effect on
 * the next request), never held in a module constant, never logged, never
 * echoed into a response, and never given a `PUBLIC_` prefix — a webhook URL is
 * a credential, since anyone holding it can post into the channel.
 *
 * ══ ADDING A SECOND DESTINATION ═══════════════════════════════════════════
 *
 * A Google Sheet mirror of the same leads is wanted later (GSHEET_WEBAPP_URL —
 * HANDOFF Seam 10). `DESTINATIONS` below is the extension point: add one entry
 * and it inherits the isolation, the no-op-when-unconfigured behaviour, and the
 * per-destination error containment. Nothing else changes. Not built this round.
 *
 * ══ WHAT GOES IN THE MESSAGE ══════════════════════════════════════════════
 *
 * Not here — `leadMessage.ts`, which imports nothing and can therefore be
 * tested outside a Worker. That file also carries `LEAD_DETAIL`, the decision
 * about how much of a person a notification may contain. This file is delivery
 * only.
 */
import { env } from "cloudflare:workers";
import type { Lead } from "./leadMessage";
import { slackText } from "./leadMessage";

// Re-exported so callers have one import for the whole notifier.
export type { LeadEvent, Lead, LeadDetail } from "./leadMessage";
export { LEAD_DETAIL, slackText } from "./leadMessage";

/** Read at call time so `wrangler secret put` takes effect without a redeploy
 * of anything else. Never assigned to a module-level constant. */
function secret(name: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[name];
}

interface Destination {
  name: string;
  /** The secret holding this destination's endpoint. */
  secretName: string;
  /** Request body for one lead. */
  body: (lead: Lead) => string;
  contentType: string;
}

const DESTINATIONS: Destination[] = [
  {
    name: "slack",
    secretName: "SLACK_LEADS_WEBHOOK_URL",
    body: (lead) => JSON.stringify({ text: slackText(lead) }),
    contentType: "application/json",
  },
  // Seam 10: a Google Apps Script Web App mirror (GSHEET_WEBAPP_URL) goes here
  // when it is greenlit. Deliberately absent — the round that adds it owns the
  // decision about what a spreadsheet should hold.
];

export interface DeliveryResult {
  destination: string;
  status: "sent" | "skipped" | "failed";
  detail?: string;
}

/**
 * Deliver one lead to every configured destination.
 *
 * Resolves with a per-destination result and never rejects. Callers may await
 * it (the tests do, to assert on the outcome) or discard it — either way a
 * failure here cannot surface to the homeowner.
 */
export async function notifyLead(lead: Lead): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  for (const dest of DESTINATIONS) {
    const endpoint = secret(dest.secretName);

    if (!endpoint) {
      // Not configured. Same posture as the email stub: say so at debug level
      // and carry on. Never an error — an unconfigured ops channel is a normal
      // state, not a failure of the signup.
      console.log(`[leads:${dest.name}] not configured (${dest.secretName} unset) — skipping`);
      results.push({ destination: dest.name, status: "skipped" });
      continue;
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": dest.contentType },
        body: dest.body(lead),
      });
      if (!res.ok) {
        // The endpoint is a credential — log the status, never the URL.
        console.error(`[leads:${dest.name}] rejected the notification: HTTP ${res.status}`);
        results.push({ destination: dest.name, status: "failed", detail: `HTTP ${res.status}` });
      } else {
        results.push({ destination: dest.name, status: "sent" });
      }
    } catch (error) {
      console.error(
        `[leads:${dest.name}] delivery failed:`,
        error instanceof Error ? error.message : String(error),
      );
      results.push({
        destination: dest.name,
        status: "failed",
        detail: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return results;
}

/**
 * Pulls `waitUntil` out of Astro's locals, and cannot throw doing it.
 *
 * ── Why this is a function and not an inline property read ────────────────
 * The first cut read `locals.runtime.ctx.waitUntil` at each call site. That
 * property is not merely absent in Astro 7 — the adapter defines `runtime.ctx`
 * as a GETTER THAT THROWS ("removed in Astro v6, use Astro.locals.cfContext").
 * So the read threw synchronously inside the route handler, after the database
 * write had already committed.
 *
 * Measured, before the fix: POST /api/dashboard/notify/ returned HTTP 500 while
 * the row sat in D1. The visitor is told their signup failed for a signup that
 * succeeded — and since the email column is uniquely indexed, resubmitting
 * would hit the constraint and 500 again, so they could never reach a success
 * message. The notifier had become the one thing it exists to never be: a way
 * for an ops nicety to break a real signup.
 *
 * Hence the try/catch. It is not defensive clutter about a hypothetical: it is
 * about the exact failure this file already caused once. A future adapter
 * shipping another throwing getter costs a missed Slack post, nothing more.
 */
function waitUntilFrom(locals: unknown): ((promise: Promise<unknown>) => void) | undefined {
  try {
    const ctx = (locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } })?.cfContext;
    return typeof ctx?.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget wrapper for request handlers.
 *
 * The signup response must not wait on an ops notification, and must not be
 * able to fail because of one. This starts the delivery, attaches a catch so an
 * unexpected rejection can never become an unhandled rejection that fails the
 * request, and returns immediately. `waitUntil` keeps the Worker alive for the
 * POST after the response is sent; without it the request context can be torn
 * down mid-fetch, which costs a notification but still never costs a signup.
 *
 * Takes Astro's `locals` rather than a `waitUntil` function on purpose: the
 * unwrapping is the part that turned out to be dangerous, so it lives here,
 * behind the guard, instead of being repeated at every call site.
 */
export function notifyLeadInBackground(lead: Lead, locals?: unknown): void {
  const work = notifyLead(lead).catch((error) => {
    console.error("[leads] notifier threw unexpectedly:", error);
    return [] as DeliveryResult[];
  });
  waitUntilFrom(locals)?.(work);
}
