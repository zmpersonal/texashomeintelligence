/**
 * POST /api/dashboard/notify — the launch-notification signup.
 *
 * The only write in the dashboard. Server-only: the D1 binding is never
 * exposed to the browser, and the page that posts here renders entirely
 * without it.
 *
 * The consent rule is enforced in three places on purpose, because this is the
 * first personal data the project stores and "we meant to check" is not a
 * defence: the checkbox is `required` in the markup, this handler refuses the
 * request without it, and the table's CHECK constraint rejects a row that
 * claims otherwise. Nothing about a visitor is written before that.
 */
import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { notifyLeadInBackground } from "../../../lib/ops/leadNotify";

export const prerender = false;

/** Deliberately permissive: this is a sanity check, not an attempt to decide
 * whether an address is deliverable. Over-strict validation rejects real
 * addresses, and we have no way to verify one anyway at this stage. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a form submission." }, 400);
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const zip = String(form.get("zip") ?? "").trim();
  const consent = String(form.get("consent") ?? "");
  const consentSource = String(form.get("consent_source") ?? "").trim();

  // Consent first, before anything else is looked at, so there is no path
  // through this function that touches the database without it.
  if (consent !== "yes") {
    return json({ error: "We can only store your email if you tick the consent box." }, 400);
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "That doesn't look like an email address." }, 400);
  }
  if (!/^\d{5}$/.test(zip)) {
    return json({ error: "Missing the ZIP this signup came from." }, 400);
  }
  if (!consentSource || consentSource.length > 64) {
    return json({ error: "Missing consent provenance." }, 400);
  }

  // `cloudflare:workers` env, matching src/lib/db.ts. Astro.locals.runtime.env
  // was removed in Astro v6 and silently 500s if used — caught here by running
  // the real worker rather than by reading the diff.
  const db = env.DB;
  if (!db) {
    // No binding in this environment (e.g. a plain `astro preview`). Say so
    // rather than pretending the signup was recorded.
    return json({ error: "Signups aren't available right now. Please try again later." }, 503);
  }

  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO dashboard_launch_signups
           (email, zip, consent, consent_source, consent_at, created_at)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           zip = excluded.zip,
           consent_source = excluded.consent_source,
           consent_at = excluded.consent_at`,
      )
      .bind(email, zip, consentSource, now, now)
      .run();
  } catch (error) {
    console.error("dashboard signup insert failed", error);
    return json({ error: "We couldn't save that. Please try again." }, 500);
  }

  // The row is committed. Only now does the owner's ops channel hear about it,
  // and only on a best-effort basis: `notifyLeadInBackground` never throws and
  // is never awaited, so a Slack outage cannot cost a signup that D1 already
  // accepted.
  //
  // This is NOT the Resend path. Resend carries homeowner mail only — magic
  // links, alerts, the weekly email — one recipient each, the person the
  // message is about. Nothing about this lead is bcc'd, reply-to'd or otherwise
  // routed through that transport. See lib/ops/leadNotify.ts and HANDOFF Seam 5.
  notifyLeadInBackground({ event: "launch-signup", email, zip, at: now }, locals);

  return json({ message: "Thanks — we'll email you when your home dashboard is ready." }, 200);
};
