/**
 * POST /api/reminders/action/ — done / snooze / skip.
 *
 * The three verbs move the due date differently on purpose; the rules and the
 * reasoning live in src/lib/account/reminders.ts. Every one writes a history
 * row carrying the due date it produced, so a recalculation can be audited
 * afterwards instead of only inferred from the current state.
 */
import type { APIRoute } from "astro";
import { authenticate, json, UNAUTHORIZED } from "../../../lib/auth/guard";
import { applyReminderUpdate, recordEvent, requireOwnedReminder } from "../../../lib/account/db";
import { addDays, nextDueAfterCompletion, nextDueAfterSkip } from "../../../lib/account/reminders";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticate(request);
  if (!auth) return UNAUTHORIZED();
  if (!auth.home) return json({ error: "Add your home first." }, 400);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Expected a form submission." }, 400);

  const id = String(form.get("reminder_id") ?? "");
  const action = String(form.get("action") ?? "");

  // Ownership is proven against the session's home, never taken from the body.
  const reminder = await requireOwnedReminder(auth.home.id, id);
  if (!reminder) return json({ error: "No such reminder." }, 404);

  const now = new Date().toISOString();

  if (action === "complete") {
    const nextDueAt = nextDueAfterCompletion(now, reminder.cadenceDays);
    await applyReminderUpdate(reminder, { nextDueAt, lastDoneAt: now, snoozedUntil: null });
    await recordEvent(reminder.id, auth.home.id, "completed", nextDueAt);
    return json({ ok: true, nextDueAt, lastDoneAt: now }, 200);
  }

  if (action === "snooze") {
    const days = Number(form.get("days") ?? 1);
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      return json({ error: "Snooze must be 1 to 60 days." }, 400);
    }
    // Deliberately does not move next_due_at: a snooze hides the item from the
    // near-term queue, it does not reschedule the maintenance.
    const snoozedUntil = addDays(now, days);
    await applyReminderUpdate(reminder, { nextDueAt: reminder.nextDueAt, snoozedUntil });
    await recordEvent(reminder.id, auth.home.id, "snoozed", reminder.nextDueAt);
    return json({ ok: true, snoozedUntil, nextDueAt: reminder.nextDueAt }, 200);
  }

  if (action === "skip") {
    const nextDueAt = nextDueAfterSkip(reminder.nextDueAt, reminder.cadenceDays);
    await applyReminderUpdate(reminder, { nextDueAt, snoozedUntil: null });
    await recordEvent(reminder.id, auth.home.id, "skipped", nextDueAt);
    return json({ ok: true, nextDueAt }, 200);
  }

  return json({ error: "Unknown action." }, 400);
};
