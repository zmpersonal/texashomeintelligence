/**
 * Per-signal sparkline series.
 *
 * A sparkline is a claim about history, so each one plots the SAME window the
 * signal's score uses, from the same records, and carries a label saying
 * exactly what is on the axis. Where a signal has no honest series it gets
 * none — an invented or mismatched line would be worse than a blank space,
 * because a reader trusts a chart more than a sentence.
 *
 * Build-time only: this reads the generated datasets, so it must never be
 * imported by anything the Worker bundles (see readIndex.ts).
 */
import { findDataset } from "./datasets";
import { DROUGHT_WINDOWS, STORM_DECAY_HALF_LIFE_DAYS } from "./stressIndex";
import { parseDrought } from "./stressIndex/signals";
import type { Observation } from "../ingest/types";

export interface SignalSeries {
  values: number[];
  label: string;
}

const DAY = 86_400_000;
const measured = <T,>(o: Observation<T>[]) => o.filter((x) => !x.seed);

/** Weekly drought points for the primary county, oldest first. */
function droughtSeries(areaId: string, fips: string, weeks: number, ref: Date): number[] {
  const ds = findDataset<{ droughtIndex?: string }>("usdm-drought", areaId);
  if (!ds || ds.status === "sample") return [];
  const cutoff = ref.getTime() - weeks * 7 * DAY;
  return measured(ds.observations)
    .filter((o) => o.key.startsWith(`${fips}-`))
    .filter((o) => new Date(o.observedAt).getTime() >= cutoff)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .map((o) => parseDrought(o.value.droughtIndex)?.points ?? 0);
}

/** Decayed storm points per week over the trailing window, oldest first —
 * the same decay the score applies, bucketed so the shape is readable. */
function stormSeries(areaId: string, county: string, weeks: number, ref: Date): number[] {
  const ds = findDataset<{ county?: string; eventType?: string }>("noaa-storm-events", areaId);
  if (!ds || ds.status === "sample") return [];
  const buckets = new Array(weeks).fill(0);
  for (const o of measured(ds.observations)) {
    if (o.value.county && o.value.county !== county) continue;
    if (o.value.eventType === "Flood") continue;
    const ageDays = (ref.getTime() - new Date(o.observedAt).getTime()) / DAY;
    if (ageDays < 0 || ageDays > weeks * 7) continue;
    const idx = weeks - 1 - Math.floor(ageDays / 7);
    if (idx < 0 || idx >= weeks) continue;
    buckets[idx] += Math.pow(0.5, ageDays / STORM_DECAY_HALF_LIFE_DAYS);
  }
  return buckets;
}

export function seriesFor(
  signalId: string,
  areaId: string,
  countyName: string,
  countyFips: string,
  ref: Date,
): SignalSeries | undefined {
  if (signalId === "foundation-soil") {
    const v = droughtSeries(areaId, countyFips, DROUGHT_WINDOWS.foundationWeeks, ref);
    return v.length > 1 ? { values: v, label: `Weekly drought severity, ${v.length} weeks` } : undefined;
  }
  if (signalId === "trees-yard") {
    const v = droughtSeries(areaId, countyFips, DROUGHT_WINDOWS.treesWeeks, ref);
    return v.length > 1 ? { values: v, label: `Weekly drought severity, ${v.length} weeks` } : undefined;
  }
  if (signalId === "water-irrigation") {
    // The score is this week only, but a single point cannot be drawn. The
    // label says the line is context for the current reading, not the reading.
    const v = droughtSeries(areaId, countyFips, 26, ref);
    return v.length > 1
      ? { values: v, label: `Weekly drought severity behind today's reading, ${v.length} weeks` }
      : undefined;
  }
  if (signalId === "roof-storm") {
    const v = stormSeries(areaId, countyName, 26, ref);
    return v.some((x) => x > 0) ? { values: v, label: "Recency-weighted storm activity, 26 weeks" } : undefined;
  }
  if (signalId === "hvac") {
    const ds = findDataset<{ forecastHighF?: number }>("nws-api", areaId);
    if (!ds || ds.status === "sample") return undefined;
    const v = measured(ds.observations)
      .filter((o) => typeof o.value.forecastHighF === "number")
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
      .map((o) => o.value.forecastHighF as number);
    return v.length > 1 ? { values: v, label: `Forecast highs, °F, last ${v.length} days` } : undefined;
  }
  return undefined;
}
