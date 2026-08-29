/**
 * Composes the five signals into one area reading.
 *
 * Everything here runs at BUILD time over `src/data/generated/**`. Nothing in
 * this path touches a database or a government API — per COST.md the serving
 * path reads a precomputed result and nothing else.
 */
import { findDataset, freshnessOf } from "../datasets";
import { METHODOLOGY_VERSION, SIGNAL_WEIGHTS } from "./config";
import { explainComposite, explainSignal } from "./explain";
import { foundationSoil, freshnessOfInputs, hvac, roofStorm, treesYard, waterIrrigation } from "./signals";
import type { SignalContext } from "./signals";
import { bandFor, toScore } from "./scale";
import type { CompareResult, SignalResult, StressIndexResult } from "./types";

/** The areas the index is computed for. Counties are the NOAA county names
 * this area's storm rows may carry — see `AREAS` in `../zipAreas`. */
export interface AreaDefinition {
  areaId: string;
  areaLabel: string;
  /** The county the reading represents — see SignalContext.primaryCounty. */
  primaryCounty: string;
  counties: string[];
}

/** Every dataset the index may read, so `referenceDate` can be derived before
 * any signal runs. Listed explicitly rather than globbed: a feed silently
 * joining the index would silently move every score. */
const INDEX_DATASETS = ["noaa-storm-events", "usdm-drought", "nws-api", "airnow"];

/**
 * The date all time-relative maths is measured from: the NEWEST `dataThrough`
 * across this area's inputs.
 *
 * Wall-clock time is deliberately not used. Using `Date.now()` would make the
 * same committed data produce a different score every day, which defeats
 * reproducibility, and would let the index quietly age past its own evidence —
 * a storm would decay away on a feed that had stopped updating, making a stale
 * area look calm. Anchoring to the data means a stale feed produces a stale
 * score that the freshness fields then declare.
 */
export function referenceDateFor(areaId: string): Date {
  let newest: string | undefined;
  for (const id of INDEX_DATASETS) {
    const ds = findDataset(id, areaId);
    if (!ds || ds.status === "sample") continue;
    const through = freshnessOf(ds).dataThrough;
    if (through && (!newest || through > newest)) newest = through;
  }
  // No live input at all: fall back to the epoch so every trailing window is
  // empty and every signal reports unavailable, rather than throwing.
  return new Date(newest ?? 0);
}

/** No signal we hold varies within a metro: drought and storms are recorded by
 * county, forecasts and air quality by metro. A ZIP-vs-metro percentile would
 * therefore be an invented number, so none is produced. */
const COMPARE_UNAVAILABLE: CompareResult = {
  available: false,
  reason:
    "Every input behind this score is recorded at county or metro level, so every ZIP in the " +
    "metro currently resolves to the same reading. A ZIP-vs-metro comparison would be modelled, " +
    "not measured, so we do not publish one yet.",
};

export function computeStressIndex(area: AreaDefinition): StressIndexResult {
  const referenceDate = referenceDateFor(area.areaId);
  const ctx: SignalContext = {
    areaId: area.areaId,
    areaLabel: area.areaLabel,
    primaryCounty: area.primaryCounty,
    counties: area.counties,
    referenceDate,
  };

  const signals: SignalResult[] = [
    roofStorm(ctx, SIGNAL_WEIGHTS["roof-storm"]),
    foundationSoil(ctx, SIGNAL_WEIGHTS["foundation-soil"]),
    hvac(ctx, SIGNAL_WEIGHTS.hvac),
    waterIrrigation(ctx, SIGNAL_WEIGHTS["water-irrigation"]),
    treesYard(ctx, SIGNAL_WEIGHTS["trees-yard"]),
  ].map(explainSignal);

  const usable = signals.filter((s) => s.computable);
  const weightCoverage = usable.reduce((s, x) => s + x.weight, 0);
  // Re-normalise over the signals that ran. Treating a missing signal as zero
  // would read as "conditions are calm here" when the truth is "we don't know".
  const compositeRaw = weightCoverage > 0
    ? usable.reduce((s, x) => s + x.layerB.score * x.weight, 0) / weightCoverage
    : 0;
  const compositeScore = toScore(compositeRaw);
  const band = bandFor(compositeScore);

  const result: StressIndexResult = {
    areaId: area.areaId,
    areaLabel: area.areaLabel,
    methodologyVersion: METHODOLOGY_VERSION,
    referenceDate: referenceDate.toISOString(),
    composite: {
      score: compositeScore,
      band: band.id,
      bandLabel: band.label,
      weightCoverage: Number(weightCoverage.toFixed(4)),
      signalsUsed: usable.map((s) => s.id),
      signalsUnavailable: signals.filter((s) => !s.computable).map((s) => s.id),
    },
    signals,
    freshness: freshnessOfInputs(signals.flatMap((s) => s.layerA)),
    compare: COMPARE_UNAVAILABLE,
  };
  return result;
}

export { explainComposite };
