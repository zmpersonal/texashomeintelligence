/** POST /api/account/alert-prefs/ — turn one alert type on or off. */
import type { APIRoute } from "astro";
import { authenticate, json, UNAUTHORIZED } from "../../../lib/auth/guard";
import { setAlertPref } from "../../../lib/account/db";
import { ALERT_CATALOGUE } from "../../../lib/account/alerts";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticate(request);
  if (!auth) return UNAUTHORIZED();
  if (!auth.home) return json({ error: "Add your home first." }, 400);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Expected a form submission." }, 400);

  const key = String(form.get("alert_key") ?? "");
  if (!ALERT_CATALOGUE.some((a) => a.key === key)) return json({ error: "Unknown alert." }, 400);

  const enabled = String(form.get("enabled") ?? "") === "yes";
  await setAlertPref(auth.home.id, key, enabled);
  return json({ ok: true, alertKey: key, enabled }, 200);
};
