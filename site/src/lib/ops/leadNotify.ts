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
 */
import { env } from "cloudflare:workers";

export type LeadEvent = "launch-signup" | "account-created";

export interface Lead {
  event: LeadEvent;
  email: string;
  zip: string;
  /** Only when the homeowner gave one and consented to it being stored. */
  address?: string;
  /** ISO 8601, when the lead was captured. */
  at: string;
}

/** Read at call time so `wrangler secret put` takes effect without a redeploy
 * of anything else. Never assigned to a module-level constant. */
function secret(name: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[name];
}

const EVENT_LABEL: Record<LeadEvent, string> = {
  "launch-signup": "Launch signup",
  "account-created": "Account created",
};

/** The Slack message body. Plain text, one lead per post. */
export function slackText(lead: Lead): string {
  const lines = [
    `*${EVENT_LABEL[lead.event]}* — Texas Home Intelligence`,
    `Email: ${lead.email}`,
    `ZIP: ${lead.zip}`,
  ];
  if (lead.address) lines.push(`Address: ${lead.address}`);
  lines.push(`At: ${lead.at}`);
  return lines.join("\n");
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
 * Fire-and-forget wrapper for request handlers.
 *
 * The signup response must not wait on an ops notification, and must not be
 * able to fail because of one. This starts the delivery, attaches a catch so an
 * unexpected rejection can never become an unhandled rejection that fails the
 * request, and returns immediately. `ctx.waitUntil` is used when the caller can
 * supply it, so the Worker stays alive for the POST after the response is sent.
 */
export function notifyLeadInBackground(
  lead: Lead,
  waitUntil?: (promise: Promise<unknown>) => void,
): void {
  const work = notifyLead(lead).catch((error) => {
    console.error("[leads] notifier threw unexpectedly:", error);
    return [];
  });
  if (waitUntil) waitUntil(work);
}
