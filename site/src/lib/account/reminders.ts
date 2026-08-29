/**
 * Reminder cadence arithmetic — the retention core.
 *
 * ── THE RECALCULATION RULE (flagged: this was a real judgement call) ──────
 * On completion, the next due date is CADENCE DAYS FROM THE COMPLETION, not
 * from the date it was previously due.
 *
 * The alternative — advancing from the old due date — keeps a fixed calendar
 * rhythm, and for a filter changed 40 days late it would mark the next one due
 * 50 days from now, or immediately overdue again if the delay exceeded the
 * cadence. That punishes someone for being late and produces a queue that is
 * permanently red. What actually matters for a filter is elapsed time since it
 * was last changed, so completion is the anchor.
 *
 * SKIP is the deliberate exception: it advances from the DUE date, because
 * "not this cycle" means keeping the rhythm rather than resetting it.
 *
 * SNOOZE moves nothing. It sets `snoozed_until` so the item drops out of the
 * near-term queue for a while; the underlying due date, and therefore the
 * overdue count, is untouched. A snooze that quietly rescheduled maintenance
 * would be a way to hide a problem from yourself.
 */
export const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

export function nextDueAfterCompletion(completedAt: string, cadenceDays: number): string {
  return addDays(completedAt, cadenceDays);
}

export function nextDueAfterSkip(currentDueAt: string, cadenceDays: number): string {
  return addDays(currentDueAt, cadenceDays);
}

export type DueBucket = "overdue" | "today" | "this-week" | "coming-up" | "later";

export function bucketFor(nextDueAt: string, now: string): DueBucket {
  const days = daysBetween(now, nextDueAt);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "this-week";
  if (days <= 30) return "coming-up";
  return "later";
}

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  "this-week": "This week",
  "coming-up": "Coming up",
  later: "Later",
};

/** "4 days overdue" / "due in 3 days" / "due today". */
export function dueLabel(nextDueAt: string, now: string): string {
  const days = daysBetween(now, nextDueAt);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/**
 * The task catalogue. Static, no external data — these are conventional
 * service intervals, offered as defaults the homeowner can change, not
 * findings about their house. Cadences are the manufacturer-typical middle of
 * the usual range; a homeowner with pets or allergies will want the filter
 * interval shorter, which is why every one is editable.
 */
export interface TaskDefinition {
  key: string;
  label: string;
  defaultCadenceDays: number;
  note: string;
}

export const TASK_CATALOGUE: TaskDefinition[] = [
  { key: "hvac-filter", label: "AC / furnace filter", defaultCadenceDays: 90,
    note: "Every 1–3 months depending on filter type, pets and allergies." },
  { key: "fridge-filter", label: "Refrigerator water filter", defaultCadenceDays: 180,
    note: "Most manufacturers say every six months." },
  { key: "water-filter", label: "Whole-home water filter", defaultCadenceDays: 180,
    note: "Varies widely by system and water hardness." },
  { key: "mosquito-traps", label: "Mosquito traps", defaultCadenceDays: 30,
    note: "Monthly through the warm season in Central Texas." },
  { key: "pest-treatment", label: "Pest treatment", defaultCadenceDays: 90,
    note: "Quarterly is the common service interval here." },
  { key: "smoke-co-test", label: "Smoke / CO alarm test", defaultCadenceDays: 180,
    note: "Test twice a year; batteries annually." },
  { key: "gutters", label: "Gutter clearing", defaultCadenceDays: 180,
    note: "Spring and autumn, sooner under heavy tree cover." },
  { key: "hvac-seasonal", label: "HVAC seasonal service", defaultCadenceDays: 182,
    note: "Before cooling season and before heating season." },
];

/**
 * "3 things worth doing this month" — a static Austin-cadence calendar. These
 * are seasonal conventions, not readings: nothing here claims to have measured
 * anything about a specific home, and the dashboard labels the block as
 * general seasonal guidance rather than putting it on the data ladder.
 */
export const SEASONAL_SUGGESTIONS: Record<number, string[]> = {
  0: ["Wrap exposed pipes and hose bibs", "Test the heater before the next front", "Check attic insulation depth"],
  1: ["Service the AC before spring", "Clear gutters before spring storms", "Check weatherstripping"],
  2: ["Pre-season AC service", "Inspect the roof after winter", "Start mosquito control"],
  3: ["Check for hail damage after storms", "Clean condenser coils", "Reseal exterior caulk"],
  4: ["Test irrigation for leaks", "Check attic ventilation", "Trim limbs away from the roof"],
  5: ["Change filters more often in heat", "Check the AC drain line", "Water the foundation evenly"],
  6: ["Watch for foundation cracks in dry weather", "Deep-water trees", "Clear the AC drain again"],
  7: ["Keep foundation watering even", "Check for roof blisters", "Replace filters after dusty weeks"],
  8: ["Post-summer AC check", "Inspect the roof before autumn storms", "Reseal gaps before cooler air"],
  9: ["Clear gutters before leaf drop", "Service the heater", "Check the chimney or flue"],
  10: ["Insulate outdoor plumbing", "Test the heating system", "Drain and store hoses"],
  11: ["Prepare for a hard freeze", "Check attic for cold-air leaks", "Test smoke and CO alarms"],
};
