/**
 * Layer C — every word the dashboard says about a score.
 *
 * Round 4 renders from here rather than writing its own sentences, so the
 * "conditions, not damage" framing is enforced in one place instead of relying
 * on whoever writes the UI to remember it. The templates below are the only
 * place a score becomes prose.
 *
 * Two rules the templates hold to:
 *  1. Never assert damage, risk of damage, or a probability. The subject of a
 *     sentence is the weather, the drought or the county — never "your home".
 *  2. Never imply address-level precision. Readings are county or metro; the
 *     copy says which.
 */
import type { BandId, SignalResult, StressIndexResult } from "./types";

/** The disclaimer that makes the framing explicit wherever the composite is
 * shown. Exported so the methodology page and the dashboard cannot drift. */
export const CONDITIONS_NOT_DAMAGE =
  "The Home Stress Index measures conditions in an area, not damage to a home. " +
  "It is not a prediction, an inspection, or a probability of loss.";

const BAND_PHRASE: Record<BandId, string> = {
  normal: "close to typical",
  moderate: "somewhat above typical",
  elevated: "well above typical",
  high: "among the harder stretches on record for this area",
};

/** One sentence per driver code. Written to be readable standing alone, since
 * the UI may show a subset. */
const DRIVER_COPY: Record<string, (s: SignalResult) => string> = {
  "hail-large": () => 'Hail of 1.75" or larger was recorded in the county recently.',
  "hail-moderate": () => 'Hail between 1.00" and 1.74" was recorded in the county recently.',
  "hail-small": () => 'Hail under 1.00" was recorded in the county recently.',
  "wind-extreme": () => "Wind gusts of 70 mph or more were recorded in the county.",
  "wind-severe": () => "Severe-thunderstorm wind gusts were recorded in the county.",
  "wind-strong": () => "Strong wind gusts were recorded in the county.",
  tornado: () => "A tornado was recorded somewhere in the county.",
  "magnitude-unknown": () =>
    "Some recorded events carry no measured magnitude; those are counted at the lowest severity rather than assumed severe.",
  // "50 of 52 weeks in severe drought" would overstate this badly. The USDM
  // row records the worst category present ANYWHERE in the county, so a week
  // counts here when as little as 1% of the county hit D2. The score already
  // discounts by area; this sentence has to say the same thing, or the copy
  // claims something the number does not.
  "drought-persistence": (s) => {
    const weeks = s.layerA[0]?.measures.weeksAtD2OrWorse;
    const total = s.layerA[0]?.measures.weeksObserved;
    return typeof weeks === "number" && weeks > 0
      ? `In ${weeks} of the last ${total} weeks, part of the county was in severe drought or worse. ` +
        "The score reflects how much of the county was affected each week, not just the worst " +
        "category recorded."
      : "Drought has stayed mild across the trailing year.";
  },
  "drought-persistence-trees": () => "Drought has persisted across the last six months.",
  "drought-current": (s) => {
    const pct = s.layerA[0]?.measures.countyAreaPct;
    const level = s.layerA[0]?.measures.level;
    return typeof pct === "number" && pct < 100
      ? `${pct}% of the county is currently at ${level}; the rest is less dry.`
      : `The county is currently at ${level}.`;
  },
  "wind-load": () => "Recent wind events add to the strain on drought-weakened limbs.",
  "heat-load": (s) => {
    const hot = s.layerA[0]?.measures.daysAtOrAbove100F;
    const days = s.layerA[0]?.measures.daysObserved;
    return `${hot} of the last ${days} forecast days reached 100°F or higher.`;
  },
  "extreme-heat": () => "Several recent days reached 105°F or higher, when marginal systems tend to struggle.",
  "air-quality": () => "Air quality has been in the moderate range, which loads filters faster than usual.",
  "input-unavailable": () => "",
};

const SIGNAL_FRAME: Record<string, string> = {
  "roof-storm": "Storm activity over the county",
  "foundation-soil": "Soil-moisture conditions around houses in the county",
  hvac: "Cooling demand across the metro",
  "water-irrigation": "Current drought conditions in the county",
  "trees-yard": "Conditions for trees and plantings in the county",
};

/** Fills Layer C for one signal. Returns a new object; does not mutate. */
export function explainSignal(signal: SignalResult): SignalResult {
  if (!signal.computable) {
    return {
      ...signal,
      layerC: {
        driverCodes: ["input-unavailable"],
        headline: `${signal.label}: not published for this area`,
        detail: signal.limitation ?? "No live input for this signal in this area.",
      },
    };
  }

  // Drivers are the terms that actually moved the score, largest first.
  const driverCodes = signal.layerB.terms
    .filter((t) => t.points > 0)
    .sort((a, b) => b.points - a.points)
    .map((t) => t.code);

  const frame = SIGNAL_FRAME[signal.id] ?? signal.label;
  const headline = `${frame} scored ${signal.layerB.score} of 100 — ${BAND_PHRASE[signal.layerB.band]}.`;

  const sentences = driverCodes
    .map((code) => DRIVER_COPY[code]?.(signal) ?? "")
    .filter(Boolean);
  if (signal.limitation) sentences.push(signal.limitation);

  return {
    ...signal,
    layerC: {
      driverCodes,
      headline,
      detail: sentences.join(" ") || "No notable drivers in the current data.",
    },
  };
}

/** Composite-level copy. Kept here so the disclaimer travels with the number. */
export function explainComposite(result: StressIndexResult): { headline: string; detail: string } {
  const { composite } = result;
  const top = [...result.signals]
    .filter((s) => s.computable)
    .sort((a, b) => b.layerB.score * b.weight - a.layerB.score * a.weight)[0];

  const coverage =
    composite.weightCoverage < 1
      ? ` It is averaged over ${composite.signalsUsed.length} of the five signals — ` +
        `${composite.signalsUnavailable.join(", ")} could not be computed for this area — ` +
        "so it is not directly comparable with an area where all five are available."
      : "";

  return {
    headline: `Conditions across ${result.areaLabel} scored ${composite.score} of 100 (${composite.bandLabel}).`,
    detail:
      (top ? `${SIGNAL_FRAME[top.id] ?? top.label} contributes the most to the current reading. ` : "") +
      CONDITIONS_NOT_DAMAGE +
      coverage,
  };
}
