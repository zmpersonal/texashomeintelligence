/**
 * The weekly email — copy and rendering only.
 *
 * Round 8 scope note: this is the *template*, not a sender. Nothing schedules
 * or dispatches it; there is no cron, no recipient query, and no send path
 * wired anywhere. `transport.ts` can deliver a message once something calls it,
 * and that something does not exist yet. Building it means deciding a send
 * window, an unsubscribe route, suppression handling and a per-recipient
 * render — a round of its own. Until then this module exists so the copy is
 * reviewable, testable and in one place rather than invented at send time.
 *
 * The shape follows the copy doc: score, the delta, one concrete check, and
 * reminder status — under 100 words of reading, every element linking back to
 * the dashboard.
 *
 * Two rules carry over from the pages and are enforced here, not just intended:
 *
 *  - The "one check" line is a signal action, taken from `signalActions.ts`,
 *    so the banned-phrase guard that governs on-page actions governs the email
 *    too. Nothing here composes its own advice.
 *  - Nothing is stated that the engine did not produce. A week with no movers
 *    says so plainly rather than manufacturing a change to justify the send.
 */
import type { BandId, SignalId } from "../stressIndex/types";

export interface WeeklyReminder {
  label: string;
  /** Whole days until due; negative means overdue. */
  dueInDays: number;
}

export interface WeeklyEmailInput {
  zip: string;
  /** e.g. "Aug 30, 2026" — already formatted by the caller. */
  weekOf: string;
  score: number;
  bandLabel: string;
  band: BandId;
  /** Signed point change since the same calculation a week ago. */
  change: number;
  comparedTo: string;
  movers: { label: string; change: number }[];
  /** The single check for this week, already resolved from signalActions.ts. */
  check?: { signalId: SignalId; text: string };
  reminders: WeeklyReminder[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}

function dueLabel(r: WeeklyReminder): string {
  if (r.dueInDays < 0) return `${r.label} overdue ${Math.abs(r.dueInDays)} days`;
  if (r.dueInDays === 0) return `${r.label} due today`;
  return `${r.label} due in ${r.dueInDays} days`;
}

function moversLine(input: WeeklyEmailInput): string {
  if (input.movers.length === 0) {
    return `Nothing moved this week. Several of these sources publish on a lag, so an unchanged week is normal rather than a missing update.`;
  }
  return input.movers
    .map((m) => `${m.label} ${m.change > 0 ? "up" : "down"} ${Math.abs(m.change)}`)
    .join(" · ");
}

/**
 * Subject line. Deliberately states the score and whether it moved — the two
 * facts that decide whether this is worth opening. No urgency language, and no
 * claim about the reader's house.
 */
export function weeklySubject(input: WeeklyEmailInput): string {
  const moved =
    input.change === 0
      ? "no change"
      : `${input.change > 0 ? "up" : "down"} ${Math.abs(input.change)}`;
  const tail = input.check ? " — 1 thing to check" : "";
  return `Your ${input.zip} score this week: ${input.score} (${moved})${tail}`;
}

export function weeklyText(input: WeeklyEmailInput): string {
  const lines: string[] = [
    `${input.zip} — Week of ${input.weekOf}`,
    `Home Stress Index: ${input.score}/100 · ${input.bandLabel}` +
      (input.change === 0 ? " (no change from last week)" : ""),
    "",
    `What moved: ${moversLine(input)}`,
  ];

  if (input.check) {
    lines.push("", `This week's check (2 min): ${input.check.text}`);
  }

  if (input.reminders.length > 0) {
    lines.push("", `Your reminders: ${input.reminders.map(dueLabel).join(" · ")}`);
  }

  lines.push(
    "",
    `Open your dashboard: ${input.dashboardUrl}`,
    "",
    // The disclaimer travels with the number, exactly as it does on the page.
    "The Home Stress Index measures conditions in an area, not damage to a home. It is not a prediction, an inspection, or a probability of loss.",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  );
  return lines.join("\n");
}
