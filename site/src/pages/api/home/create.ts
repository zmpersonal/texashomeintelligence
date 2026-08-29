/**
 * POST /api/home/create/ — attach a home to the signed-in account.
 *
 * The ZIP is resolved through the same Round 3 crosswalk the public dashboard
 * uses, so a home and an anonymous ZIP page can never disagree about which
 * county a place is in. An address is optional: give one and it is stored
 * separately with its own consent; withhold it and everything still works from
 * the ZIP.
 */
import type { APIRoute } from "astro";
import { authenticate, json, UNAUTHORIZED } from "../../../lib/auth/guard";
import { createHome, createReminder, listReminders } from "../../../lib/account/db";
import { resolveZip } from "../../../lib/zipAreas";
import { TASK_CATALOGUE, addDays } from "../../../lib/account/reminders";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticate(request);
  if (!auth) return UNAUTHORIZED();

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Expected a form submission." }, 400);

  const zipInput = String(form.get("zip") ?? "").trim();
  const addressLine = String(form.get("address") ?? "").trim();
  const addressConsent = String(form.get("address_consent") ?? "");
  const consentSource = String(form.get("consent_source") ?? "home_setup").trim();

  const resolved = resolveZip(zipInput);
  if (!resolved.covered) return json({ error: resolved.reason }, 400);

  // The address is separate PII with its own consent. Sending an address
  // without ticking its box stores the home and drops the address, rather
  // than storing it on the strength of the account-level consent.
  const storeAddress = addressLine.length > 0 && addressConsent === "yes";

  const home = await createHome({
    accountId: auth.account.id,
    zip: resolved.zip,
    areaId: resolved.areaId,
    countyName: resolved.countyName,
    countyFips: resolved.countyFips,
    addressLine: storeAddress ? addressLine.slice(0, 200) : undefined,
    consentSource,
  });

  // Seed the queue so a new home is not an empty page. These are the
  // conventional intervals from the catalogue, offered as editable defaults —
  // the first due date is one cadence out, since we have no idea when any of
  // them was last done and guessing "overdue" would be a fabricated finding.
  //
  // Only ever on a genuinely empty home. This endpoint upserts, so re-running
  // setup (or a double submit) would otherwise seed a second copy of every
  // starter reminder — which is exactly what happened the first time it was
  // tested against a real worker.
  const existing = await listReminders(home.id);
  const seeded = existing.length === 0 ? ["hvac-filter", "smoke-co-test", "gutters"] : [];
  const now = new Date().toISOString();
  for (const key of seeded) {
    const task = TASK_CATALOGUE.find((t) => t.key === key)!;
    await createReminder({
      homeId: home.id,
      taskKey: task.key,
      label: task.label,
      cadenceDays: task.defaultCadenceDays,
      firstDueAt: addDays(now, task.defaultCadenceDays),
    });
  }

  return json({ ok: true, zip: home.zip, area: home.areaId, addressStored: storeAddress }, 200);
};
