/**
 * POST /api/account/email-prefs/ — turn the weekly email on or off.
 *
 * The signed-in counterpart to the unsubscribe link. This one requires a
 * session, because it is reached from the dashboard and a session is already
 * in hand; the emailed link cannot require one, which is why it is signed
 * instead.
 *
 * `source` records WHERE the value came from, so that "did this person opt in,
 * and how?" is answerable from the row rather than reconstructed.
 */
import type { APIRoute } from "astro";
import { authenticate, json, UNAUTHORIZED } from "../../../lib/auth/guard";
import { WEEKLY_PREF_KEY, setWeeklyPref } from "../../../lib/email/weeklyRecipients";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticate(request);
  if (!auth) return UNAUTHORIZED();

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Expected a form submission." }, 400);

  const key = String(form.get("pref_key") ?? "");
  if (key !== WEEKLY_PREF_KEY) return json({ error: "Unknown preference." }, 400);

  const enabled = String(form.get("enabled") ?? "") === "yes";
  await setWeeklyPref(auth.account.id, enabled, "dashboard");
  return json({ ok: true, prefKey: key, enabled }, 200);
};
