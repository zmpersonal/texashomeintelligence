/**
 * POST /api/reminders/ — create a reminder on the signed-in home.
 */
import type { APIRoute } from "astro";
import { authenticate, json, UNAUTHORIZED } from "../../../lib/auth/guard";
import { createReminder, listReminders } from "../../../lib/account/db";
import { TASK_CATALOGUE, addDays } from "../../../lib/account/reminders";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticate(request);
  if (!auth) return UNAUTHORIZED();
  if (!auth.home) return json({ error: "Add your home first." }, 400);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Expected a form submission." }, 400);

  const taskKey = String(form.get("task_key") ?? "").trim();
  const task = TASK_CATALOGUE.find((t) => t.key === taskKey);
  if (!task) return json({ error: "Unknown task." }, 400);

  const cadence = Number(form.get("cadence_days") ?? task.defaultCadenceDays);
  if (!Number.isInteger(cadence) || cadence < 1 || cadence > 3650) {
    return json({ error: "Cadence must be between 1 and 3650 days." }, 400);
  }

  // Idempotent per task. "Track this" appears on a signal card that may be on
  // screen every visit, and the queue's add form offers the same catalogue, so
  // the same task can easily be submitted twice. Creating a second copy would
  // give the homeowner two identical rows to complete separately — which is
  // exactly what happened the first time this was clicked in a real browser.
  const active = await listReminders(auth.home.id);
  const already = active.find((r) => r.taskKey === task.key);
  if (already) {
    return json({ ok: true, reminder: already, alreadyTracked: true }, 200);
  }

  const reminder = await createReminder({
    homeId: auth.home.id,
    taskKey: task.key,
    label: task.label,
    cadenceDays: cadence,
    firstDueAt: addDays(new Date().toISOString(), cadence),
  });
  return json({ ok: true, reminder }, 200);
};
