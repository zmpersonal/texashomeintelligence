/**
 * The weekly email — what it says, and what it refuses to say.
 *
 * Every assertion in this message is a value read out of the precomputed
 * artifact for that home's area, or a row from that home's own reminder queue.
 * There is no trend the engine did not compute, no percentile (none of our
 * signals varies within a metro — see CompareResult), no comparison to other
 * homes, and no dollar figure. If a number is not in the artifact, it is not
 * in the email.
 *
 * ── Two honesty rules carried over from the dashboard ─────────────────────
 *
 * 1. AREA, NOT ADDRESS. The index measures a county. The copy says so, in the
 *    body and not only in a footer, exactly as the dashboard and the alert
 *    templates do. An email is read away from all that context, so the framing
 *    has to travel with it.
 *
 * 2. CONDITIONS, NOT DAMAGE. The single suggested check comes from
 *    `signalActions.ts` — the same fixed table the dashboard renders, with the
 *    same vocabulary and the same `BANNED_ACTION_PATTERNS` guard. Nothing here
 *    composes new advice.
 *
 * ── Staleness ─────────────────────────────────────────────────────────────
 * `referenceDate` is the newest `dataThrough` across the area's inputs, so it
 * is the honest answer to "how current is this?". When it has fallen behind,
 * the email says the reading is the last one we could confirm and gives its
 * age, and the week-over-week delta is withheld: a delta between two stale
 * points describes the archive, not the week. A stale score is never presented
 * as this week's reading.
 */
import type { PrecomputedArea } from "../account/readIndex";
import type { Reminder } from "../account/db";
import type { SignalResult } from "../stressIndex/types";
import { actionFor } from "../signalActions";
import { BANNED_ACTION_PATTERNS } from "../signalActions";
import { deltaLabel } from "../dashboardShared";
import { bucketFor, dueLabel } from "../account/reminders";
import { formatDate } from "../format";

/** How far `referenceDate` may fall behind before the reading is labelled as
 * last-confirmed rather than current. Two send cycles: one missed ingestion
 * run is not staleness, a fortnight of them is. */
export const STALE_AFTER_DAYS = 14;

export interface WeeklyLinks {
  dashboard: string;
  unsubscribe: string;
  preferences: string;
}

export interface WeeklyContent {
  zip: string;
  areaLabel: string;
  countyName: string;
  score: number;
  bandLabel: string;
  compositeHeadline: string;
  /** Present only when the reading is current. */
  delta: { text: string; comparedTo: string } | null;
  stale: { asOf: string; ageDays: number } | null;
  /** Below 1 when a signal is not published for this area. */
  weightCoverage: number;
  unavailableLabels: string[];
  driver: { label: string; headline: string } | null;
  check: { signalLabel: string; text: string } | null;
  overdue: { label: string; due: string }[];
  dueSoon: { label: string; due: string }[];
  trackingAnything: boolean;
}

function daysBetween(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
}

/** Highest-scoring computable signal — the one contributing most to the
 * composite. Ties break on weight, so the tiebreak is also a real property of
 * the model rather than array order. */
function topSignal(signals: SignalResult[]): SignalResult | undefined {
  return [...signals]
    .filter((s) => s.computable)
    .sort((a, b) => b.layerB.score - a.layerB.score || b.weight - a.weight)[0];
}

export function buildWeeklyContent(
  index: PrecomputedArea,
  home: { zip: string; countyName: string },
  reminders: Reminder[],
  now: Date,
): WeeklyContent {
  const ageDays = daysBetween(index.referenceDate, now);
  const stale = ageDays > STALE_AFTER_DAYS ? { asOf: index.referenceDate, ageDays } : null;

  const computable = index.signals.filter((s) => s.computable);
  const driverSignal = topSignal(index.signals);

  // The check comes from the highest-scoring signal that HAS one. A Normal
  // band has no action by design (see signalActions.ts), so when the top
  // driver is calm we fall through to the next signal rather than inventing
  // busywork for it — and if nothing is above Normal, the email says so.
  let check: WeeklyContent["check"] = null;
  for (const s of [...computable].sort((a, b) => b.layerB.score - a.layerB.score)) {
    const action = actionFor(s.id, s.layerB.band);
    if (action) {
      check = { signalLabel: s.label, text: action.text };
      break;
    }
  }

  const iso = now.toISOString();
  const active = reminders.filter((r) => !r.snoozedUntil || r.snoozedUntil <= iso);
  const overdue = active
    .filter((r) => bucketFor(r.nextDueAt, iso) === "overdue")
    .map((r) => ({ label: r.label, due: dueLabel(r.nextDueAt, iso) }));
  const dueSoon = active
    .filter((r) => ["today", "this-week"].includes(bucketFor(r.nextDueAt, iso)))
    .map((r) => ({ label: r.label, due: dueLabel(r.nextDueAt, iso) }));

  const delta = index.dashboard?.delta;
  return {
    zip: home.zip,
    areaLabel: index.areaLabel,
    countyName: home.countyName,
    score: index.composite.score,
    bandLabel: index.composite.bandLabel,
    compositeHeadline: index.compositeExplanation.headline,
    delta: stale || !delta ? null : { text: deltaLabel(delta.change), comparedTo: delta.comparedTo },
    stale,
    weightCoverage: index.composite.weightCoverage,
    unavailableLabels: index.signals.filter((s) => !s.computable).map((s) => s.label),
    driver: driverSignal ? { label: driverSignal.label, headline: driverSignal.layerC.headline } : null,
    check,
    overdue,
    dueSoon,
    trackingAnything: active.length > 0,
  };
}

export function weeklySubject(c: WeeklyContent): string {
  return c.stale
    ? `Your home this week — ${c.zip}: last confirmed reading ${c.score} of 100`
    : `Your home this week — ${c.zip}: ${c.score} of 100, ${c.bandLabel}`;
}

export function weeklyText(c: WeeklyContent, links: WeeklyLinks): string {
  const lines: string[] = [];

  lines.push(`${c.areaLabel} area · ${c.zip} · ${c.countyName} County`, "");

  if (c.stale) {
    lines.push(
      "HOME STRESS INDEX — LAST CONFIRMED READING",
      `${c.score} of 100 — ${c.bandLabel}, as of ${formatDate(c.stale.asOf)}.`,
      `The feeds behind this reading have not refreshed in ${c.stale.ageDays} days, so this is ` +
        `the last figure we could confirm, not a new one. We are not showing a week-over-week ` +
        `change, because there is no new week to compare.`,
    );
  } else {
    lines.push(
      "HOME STRESS INDEX",
      `${c.score} of 100 — ${c.bandLabel}`,
      c.delta ? `${c.delta.text} since ${formatDate(c.delta.comparedTo)}.` : "",
      c.compositeHeadline,
    );
  }

  if (c.weightCoverage < 1) {
    lines.push(
      "",
      `Measured from ${Math.round(c.weightCoverage * 100)}% of the signals — ` +
        `${c.unavailableLabels.join(", ")} not published for this area.`,
    );
  }

  if (c.driver) {
    lines.push("", "WHAT'S DRIVING IT", `${c.driver.label} — ${c.driver.headline}`);
  }

  lines.push("", "THIS WEEK'S CHECK");
  if (c.check) {
    lines.push(`${c.check.signalLabel}: ${c.check.text}`);
  } else {
    lines.push(
      "Nothing is reading above normal in your area this week, so there is nothing we'd ask you to look at.",
    );
  }

  lines.push("", "YOUR REMINDERS");
  if (!c.trackingAnything) {
    lines.push(
      `You're not tracking any maintenance yet. You can add it from your dashboard: ${links.dashboard}`,
    );
  } else if (c.overdue.length === 0 && c.dueSoon.length === 0) {
    lines.push("Nothing due this week.");
  } else {
    for (const r of c.overdue) lines.push(`Overdue — ${r.label} (${r.due})`);
    for (const r of c.dueSoon) lines.push(`Due — ${r.label} (${r.due})`);
  }

  lines.push(
    "",
    "———",
    `The Home Stress Index describes conditions across ${c.countyName} County, not a measurement ` +
      `at your address. It is not a prediction and it is not an inspection.`,
    "",
    `Your dashboard: ${links.dashboard}`,
    `Email settings: ${links.preferences}`,
    `Unsubscribe from this weekly email: ${links.unsubscribe}`,
  );

  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n").trim() + "\n";
}

/**
 * The guard, exported so verification can assert it rather than trusting the
 * copy above. Scoped to the suggested check — the same region the dashboard
 * guards. The disclaimer deliberately uses words like "prediction" and, in the
 * artifact's own composite detail, "damage", because REFUSING a claim is not
 * making one; banning the vocabulary outright would forbid us from saying what
 * the index is not.
 */
export function bannedPhrasesIn(checkText: string): string[] {
  const lower = checkText.toLowerCase();
  return BANNED_ACTION_PATTERNS.filter((p) =>
    new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower),
  );
}
