/**
 * What a lead notification SAYS — with no runtime attached.
 *
 * Split out of `leadNotify.ts` so it imports nothing: that file imports
 * `cloudflare:workers`, which cannot load outside a Worker, and the message
 * body is the part most worth testing directly. The same split, for the same
 * reason, as `municipal/shardFormat.ts`.
 *
 * The privacy decision below is the reason this file matters more than its
 * size suggests. Delivery is plumbing; what goes into the payload is a
 * commitment to the people in it.
 */
/**
 * The two moments worth telling the owner about.
 *
 * `home-created` fires when someone finishes dashboard setup, NOT when the
 * account row appears — the account is written earlier, at magic-link
 * verification, and an account with no home is a half-finished signup rather
 * than news. Naming it after the account would have put "Account created" in
 * Slack minutes after the account was actually created, describing the wrong
 * event.
 */
export type LeadEvent = "launch-signup" | "home-created";

export interface Lead {
  event: LeadEvent;
  email: string;
  zip: string;
  /** Only when the homeowner gave one and consented to it being stored. */
  address?: string;
  /** ISO 8601, when the lead was captured. */
  at: string;
}

const EVENT_LABEL: Record<LeadEvent, string> = {
  "launch-signup": "Launch signup",
  "home-created": "Home dashboard set up",
};

/**
 * ══ HOW MUCH OF A LEAD GOES INTO SLACK — YOUR DECISION, FLAGGED ═══════════
 *
 * This ships as "zip" and it is the only line you need to change.
 *
 * The reason is the privacy page we currently serve. It says, unqualified:
 *
 *     "We do not sell, rent, or share your email address with third parties,
 *      including contractors."
 *
 * and, two paragraphs later, "We do not send your email address, your ZIP, or
 * any other personal detail to an analytics provider."
 *
 * Posting a homeowner's address into Slack is sending a personal detail to a
 * third-party vendor. The usual answer is that a vendor is a processor rather
 * than a recipient — but that page has no service-providers clause at all, so
 * the honest reading of the words as written is that it is not covered. A
 * notification that makes our own privacy page false is not a notification
 * worth having, and it is not reversible: once an address is in a Slack
 * workspace it is in that workspace's history, search and exports.
 *
 * So the default sends what answers the ops question — "is anyone signing up,
 * and where?" — without an identifier: event, ZIP, timestamp. You can look the
 * person up in D1, which is where their record already lives under a consent
 * you actually hold.
 *
 * To send more, change this constant AND amend the privacy page. A drafted
 * paragraph for that is in HANDOFF.md Seam 12, ready to approve or rewrite;
 * flipping the constant without it is the thing this comment exists to stop.
 *
 *   "zip"            event · ZIP · timestamp                 (default)
 *   "email"          adds the email address
 *   "email+address"  adds the street address too, and only when the homeowner
 *                    ticked the box to store it at all
 */
export type LeadDetail = "zip" | "email" | "email+address";
export const LEAD_DETAIL: LeadDetail = "zip";

/** The Slack message body. Plain text, one lead per post. */
export function slackText(lead: Lead, detail: LeadDetail = LEAD_DETAIL): string {
  const lines = [`*${EVENT_LABEL[lead.event]}* — Texas Home Intelligence`, `ZIP: ${lead.zip}`];

  if (detail === "email" || detail === "email+address") lines.push(`Email: ${lead.email}`);
  // `lead.address` is already absent unless the homeowner consented to storing
  // it, so this is the second of two gates, not the only one.
  if (detail === "email+address" && lead.address) lines.push(`Address: ${lead.address}`);

  lines.push(`At: ${lead.at}`);
  if (detail === "zip") {
    lines.push("_Identifying details withheld — see leadMessage.ts LEAD_DETAIL._");
  }
  return lines.join("\n");
}
