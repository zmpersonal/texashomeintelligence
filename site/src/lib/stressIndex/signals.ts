/**
 * The five signals. Each returns a full Layer A→B→C result, including when it
 * cannot be computed — a signal that reports "no input for this area" is more
 * useful than one that quietly disappears, and far more honest than one that
 * substitutes a proxy.
 */
import type { DatasetFile, Observation } from "../../ingest/types";
import { findDataset, freshnessOf } from "../datasets";
import {
  DROUGHT_LEVEL_POINTS,
  DROUGHT_WINDOWS,
  HVAC,
  STORM_EXCLUDED_EVENT_TYPES,
  STORM_SATURATION_K,
  STORM_SEVERITY,
  TREES_BLEND,
} from "./config";
import { ageDays, bandFor, clamp, decayWeight, saturate, toScore } from "./scale";
import type { ScoreTerm, SignalFreshness, SignalId, SignalResult, SourceInput } from "./types";

export interface SignalContext {
  areaId: string;
  areaLabel: string;
  /**
   * The county whose readings represent this area, as it appears in the NOAA
   * county field. Storm events are counted for THIS county only, matching what
   * drought already does — so every signal describes the same single place, and
   * the precision note ("readings are for Travis County") is literally true.
   *
   * Summing storm points across every county in a metro was the first thing
   * tried and it is wrong twice over: it makes the score scale with how many
   * counties we happen to list, so metros are not comparable, and it reports a
   * seven-county total to someone who asked about one ZIP.
   */
  primaryCounty: string;
  /** Every county in the metro. Not used for scoring; retained for the
   * ingestion config and for a future county-level read. */
  counties: string[];
  /** All time maths is measured from here — see StressIndexResult.referenceDate. */
  referenceDate: Date;
}

/** Measured rows only. A seeded row is a placeholder and must never reach a score. */
function measured<T>(dataset: DatasetFile<T>): Observation<T>[] {
  return dataset.observations.filter((o) => !o.seed);
}

function sourceInput<T>(
  dataset: DatasetFile<T>,
  observationsUsed: number,
  measures: Record<string, string | number | null>,
): SourceInput {
  const f = freshnessOf(dataset);
  return {
    datasetId: dataset.datasetId,
    location: dataset.location,
    sourceName: dataset.source.name,
    sourceUrl: dataset.source.url,
    status: dataset.status,
    asOf: f.asOf,
    dataThrough: f.dataThrough,
    observationsUsed,
    measures,
  };
}

/** A signal is only as current as its STALEST input. */
export function freshnessOfInputs(inputs: SourceInput[]): SignalFreshness {
  let asOf: string | undefined;
  let dataThrough: string | undefined;
  let limitingDatasetId: string | undefined;
  for (const i of inputs) {
    if (i.asOf && (!asOf || i.asOf > asOf)) asOf = i.asOf;
    if (i.dataThrough && (!dataThrough || i.dataThrough < dataThrough)) {
      dataThrough = i.dataThrough;
      limitingDatasetId = i.datasetId;
    }
  }
  return { asOf, dataThrough, limitingDatasetId };
}

function unavailable(
  id: SignalId,
  label: string,
  weight: number,
  limitation: string,
  layerA: SourceInput[] = [],
): SignalResult {
  return {
    id,
    label,
    computable: false,
    limitation,
    weight,
    layerA,
    layerB: { score: 0, band: "normal", bandLabel: "Normal", rawPoints: 0, terms: [] },
    layerC: { driverCodes: ["input-unavailable"], headline: "", detail: "" },
    freshness: freshnessOfInputs(layerA),
  };
}

function assemble(
  id: SignalId,
  label: string,
  weight: number,
  rawPoints: number,
  score: number,
  terms: ScoreTerm[],
  layerA: SourceInput[],
  limitation?: string,
): SignalResult {
  const band = bandFor(score);
  return {
    id,
    label,
    computable: true,
    limitation,
    weight,
    layerA,
    layerB: { score, band: band.id, bandLabel: band.label, rawPoints, terms },
    // Layer C is filled by explain.ts, which owns all copy.
    layerC: { driverCodes: [], headline: "", detail: "" },
    freshness: freshnessOfInputs(layerA),
  };
}

// ── parsing helpers ───────────────────────────────────────────────────────
// Each returns undefined rather than a default when the upstream string is not
// in the expected shape, so an unparseable magnitude is treated as unknown
// (and scored at the lowest band) instead of silently becoming zero.

export function parseHailInches(magnitude?: string): number | undefined {
  const m = magnitude?.match(/^([\d.]+)\s*"/);
  return m ? Number(m[1]) : undefined;
}

export function parseWindMph(magnitude?: string): number | undefined {
  const m = magnitude?.match(/^(\d+)\s*mph/i);
  return m ? Number(m[1]) : undefined;
}

export interface DroughtReading {
  level: string;
  levelIndex: number;
  areaFraction: number;
  points: number;
}

/**
 * "D2 — Severe Drought (10% of county)" → D2 covering 10% of the county.
 *
 * The area share matters: the USDM row records the worst category present
 * anywhere in the county, so a county 10% in D2 is emphatically not a county
 * in D2. Scoring the label alone would be exactly the kind of false precision
 * this project exists to avoid, so the level's points are scaled by coverage.
 */
export function parseDrought(value?: string): DroughtReading | undefined {
  if (!value) return undefined;
  if (/^none/i.test(value)) {
    return { level: "None", levelIndex: -1, areaFraction: 0, points: 0 };
  }
  const level = value.match(/^(D[0-4])/)?.[1];
  if (!level) return undefined;
  const pct = value.match(/\((\d+(?:\.\d+)?)%/)?.[1];
  // No stated coverage means the row did not qualify its extent; treat it as
  // county-wide, which is the conservative reading of the published label.
  const areaFraction = pct === undefined ? 1 : clamp(Number(pct) / 100, 0, 1);
  const levelPoints = DROUGHT_LEVEL_POINTS[level] ?? 0;
  return {
    level,
    levelIndex: Number(level.slice(1)),
    areaFraction,
    points: levelPoints * areaFraction,
  };
}

/** Weekly drought readings for this area's PRIMARY county, newest first.
 * County-tagged rows are preferred; rows predating county tagging are keyed
 * `<fips>-<date>`, so the FIPS in the key identifies them without any rewrite
 * of stored history. */
function droughtSeries(
  dataset: DatasetFile<{ droughtIndex?: string; county?: string }>,
  primaryFips: string,
): { observedAt: string; reading: DroughtReading }[] {
  const rows = measured(dataset).filter((o) => o.key.startsWith(`${primaryFips}-`));
  return rows
    .map((o) => ({ observedAt: o.observedAt, reading: parseDrought(o.value.droughtIndex) }))
    .filter((r): r is { observedAt: string; reading: DroughtReading } => r.reading !== undefined)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

function trailingWeeks<T extends { observedAt: string }>(
  series: T[],
  weeks: number,
  reference: Date,
): T[] {
  const cutoff = reference.getTime() - weeks * 7 * 86_400_000;
  return series.filter((r) => new Date(r.observedAt).getTime() >= cutoff);
}

// ── storm points, shared by Roof & Storm and Trees & Yard ─────────────────

interface StormTally {
  terms: ScoreTerm[];
  points: number;
  eventsCounted: number;
  latestEventAt?: string;
}

function tallyStorms(
  dataset: DatasetFile<{ county?: string; eventType?: string; magnitude?: string }>,
  ctx: SignalContext,
  include: (eventType: string) => boolean,
): StormTally {
  const byCode = new Map<string, { points: number; count: number; label: string; detail: string }>();
  let points = 0;
  let eventsCounted = 0;
  let latestEventAt: string | undefined;

  for (const o of measured(dataset)) {
    const type = o.value.eventType;
    if (!type || !include(type)) continue;
    if ((STORM_EXCLUDED_EVENT_TYPES as readonly string[]).includes(type)) continue;
    // Rows for other counties in the forecast zone are not this county's
    // conditions. Rows with no county predate county tagging and are kept.
    if (o.value.county && o.value.county !== ctx.primaryCounty) continue;

    const w = decayWeight(ageDays(o.observedAt, ctx.referenceDate));
    if (w === 0) continue;

    let base = 0;
    let code: string = STORM_SEVERITY.unknownMagnitudeCode;
    if (type === "Hail") {
      const inches = parseHailInches(o.value.magnitude);
      const tier = inches === undefined
        ? STORM_SEVERITY.hail[STORM_SEVERITY.hail.length - 1]
        : STORM_SEVERITY.hail.find((t) => inches >= t.minInches)!;
      base = tier.points;
      code = inches === undefined ? STORM_SEVERITY.unknownMagnitudeCode : tier.code;
    } else if (type === "Wind") {
      const mph = parseWindMph(o.value.magnitude);
      const tier = mph === undefined
        ? STORM_SEVERITY.wind[STORM_SEVERITY.wind.length - 1]
        : STORM_SEVERITY.wind.find((t) => mph >= t.minMph)!;
      base = tier.points;
      code = mph === undefined ? STORM_SEVERITY.unknownMagnitudeCode : tier.code;
    } else if (type === "Tornado") {
      base = STORM_SEVERITY.tornadoPoints;
      code = "tornado";
    } else {
      continue;
    }

    const contribution = base * w;
    points += contribution;
    eventsCounted += 1;
    if (!latestEventAt || o.observedAt > latestEventAt) latestEventAt = o.observedAt;

    const existing = byCode.get(code);
    if (existing) {
      existing.points += contribution;
      existing.count += 1;
    } else {
      byCode.set(code, { points: contribution, count: 1, label: code, detail: "" });
    }
  }

  const terms: ScoreTerm[] = [...byCode.entries()]
    .sort((a, b) => b[1].points - a[1].points)
    .map(([code, v]) => ({
      code,
      label: STORM_TERM_LABELS[code] ?? code,
      points: Number(v.points.toFixed(2)),
      detail: `${v.count} event${v.count === 1 ? "" : "s"}, recency-weighted`,
    }));

  return { terms, points, eventsCounted, latestEventAt };
}

const STORM_TERM_LABELS: Record<string, string> = {
  "hail-large": 'Hail 1.75" or larger',
  "hail-moderate": 'Hail 1.00"–1.74"',
  "hail-small": 'Hail under 1.00"',
  "wind-extreme": "Wind gusts 70 mph or higher",
  "wind-severe": "Wind gusts 58–69 mph",
  "wind-strong": "Wind gusts under 58 mph",
  tornado: "Tornado recorded in county",
  "magnitude-unknown": "Event recorded without a measured magnitude",
};

// ── the five signals ──────────────────────────────────────────────────────

export function roofStorm(ctx: SignalContext, weight: number): SignalResult {
  const ds = findDataset<{ county?: string; eventType?: string; magnitude?: string }>(
    "noaa-storm-events",
    ctx.areaId,
  );
  if (!ds || ds.status === "sample") {
    return unavailable(
      "roof-storm",
      "Roof & Storm",
      weight,
      `No live NOAA Storm Events feed for ${ctx.areaLabel}, so no roof-stress reading is published for this area.`,
    );
  }
  const tally = tallyStorms(ds, ctx, (t) => t === "Hail" || t === "Wind" || t === "Tornado");
  const score = toScore(saturate(tally.points, STORM_SATURATION_K));
  const input = sourceInput(ds, tally.eventsCounted, {
    eventsInCounties: tally.eventsCounted,
    latestEventAt: tally.latestEventAt ?? null,
    decayedPoints: Number(tally.points.toFixed(2)),
    county: ctx.primaryCounty,
  });
  return assemble("roof-storm", "Roof & Storm", weight, tally.points, score, tally.terms, [input]);
}

export function foundationSoil(ctx: SignalContext, weight: number): SignalResult {
  const ds = findDataset<{ droughtIndex?: string; county?: string }>("usdm-drought", ctx.areaId);
  const fips = PRIMARY_FIPS[ctx.areaId];
  if (!ds || ds.status === "sample" || !fips) {
    return unavailable(
      "foundation-soil",
      "Foundation & Soil",
      weight,
      `No live U.S. Drought Monitor history for ${ctx.areaLabel}.`,
    );
  }
  const series = trailingWeeks(droughtSeries(ds, fips), DROUGHT_WINDOWS.foundationWeeks, ctx.referenceDate);
  if (series.length === 0) {
    return unavailable(
      "foundation-soil",
      "Foundation & Soil",
      weight,
      "No drought weeks recorded in the trailing year for this county.",
      [sourceInput(ds, 0, {})],
    );
  }
  const mean = series.reduce((s, r) => s + r.reading.points, 0) / series.length;
  const weeksAtD2Plus = series.filter((r) => r.reading.levelIndex >= 2).length;
  const score = toScore(mean);
  const terms: ScoreTerm[] = [
    {
      code: "drought-persistence",
      label: `Mean drought severity over ${series.length} weeks`,
      points: Number(mean.toFixed(2)),
      detail: "Each week scored by its D-level, scaled by the share of the county at that level",
    },
  ];
  const input = sourceInput(ds, series.length, {
    weeksObserved: series.length,
    weeksAtD2OrWorse: weeksAtD2Plus,
    meanWeeklyPoints: Number(mean.toFixed(2)),
    currentLevel: series[0].reading.level,
  });
  return assemble(
    "foundation-soil",
    "Foundation & Soil",
    weight,
    mean,
    score,
    terms,
    [input],
    "Derived from drought persistence alone. We hold no soil-composition or per-home data, " +
      "so this describes the moisture conditions around houses in the county, not any one foundation.",
  );
}

export function waterIrrigation(ctx: SignalContext, weight: number): SignalResult {
  const ds = findDataset<{ droughtIndex?: string; county?: string }>("usdm-drought", ctx.areaId);
  const fips = PRIMARY_FIPS[ctx.areaId];
  if (!ds || ds.status === "sample" || !fips) {
    return unavailable(
      "water-irrigation",
      "Water & Irrigation",
      weight,
      `No live U.S. Drought Monitor reading for ${ctx.areaLabel}.`,
    );
  }
  const series = droughtSeries(ds, fips);
  if (series.length === 0) {
    return unavailable("water-irrigation", "Water & Irrigation", weight, "No drought readings recorded for this county.", [
      sourceInput(ds, 0, {}),
    ]);
  }
  const current = series[0];
  const score = toScore(current.reading.points);
  const terms: ScoreTerm[] = [
    {
      code: "drought-current",
      label: `Current U.S. Drought Monitor category (${current.reading.level})`,
      points: Number(current.reading.points.toFixed(2)),
      detail: `${Math.round(current.reading.areaFraction * 100)}% of the county at this level`,
    },
  ];
  const input = sourceInput(ds, 1, {
    weekEnding: current.observedAt,
    level: current.reading.level,
    countyAreaPct: Math.round(current.reading.areaFraction * 100),
  });
  return assemble(
    "water-irrigation",
    "Water & Irrigation",
    weight,
    current.reading.points,
    score,
    terms,
    [input],
    "Reads the same U.S. Drought Monitor feed as Foundation & Soil, but the current week rather " +
      "than the trailing year. The two are related readings, not independent evidence.",
  );
}

export function treesYard(ctx: SignalContext, weight: number): SignalResult {
  const drought = findDataset<{ droughtIndex?: string }>("usdm-drought", ctx.areaId);
  const storms = findDataset<{ county?: string; eventType?: string; magnitude?: string }>(
    "noaa-storm-events",
    ctx.areaId,
  );
  const fips = PRIMARY_FIPS[ctx.areaId];
  if (!drought || drought.status === "sample" || !fips) {
    return unavailable("trees-yard", "Trees & Yard", weight, `No live drought history for ${ctx.areaLabel}.`);
  }
  const series = trailingWeeks(droughtSeries(drought, fips), DROUGHT_WINDOWS.treesWeeks, ctx.referenceDate);
  const droughtMean = series.length ? series.reduce((s, r) => s + r.reading.points, 0) / series.length : 0;

  const layerA: SourceInput[] = [
    sourceInput(drought, series.length, {
      weeksObserved: series.length,
      meanWeeklyPoints: Number(droughtMean.toFixed(2)),
    }),
  ];

  let windScore = 0;
  let windPoints = 0;
  const terms: ScoreTerm[] = [
    {
      code: "drought-persistence-trees",
      label: `Mean drought severity over ${series.length} weeks`,
      points: Number((droughtMean * TREES_BLEND.droughtShare).toFixed(2)),
      detail: `Weighted ${Math.round(TREES_BLEND.droughtShare * 100)}% of this signal`,
    },
  ];

  if (storms && storms.status !== "sample") {
    const tally = tallyStorms(storms, ctx, (t) => t === "Wind" || t === "Tornado");
    windPoints = tally.points;
    windScore = saturate(tally.points, STORM_SATURATION_K);
    terms.push({
      code: "wind-load",
      label: "Recent wind and tornado events",
      points: Number((windScore * TREES_BLEND.stormShare).toFixed(2)),
      detail: `${tally.eventsCounted} event${tally.eventsCounted === 1 ? "" : "s"}, recency-weighted, ` +
        `weighted ${Math.round(TREES_BLEND.stormShare * 100)}% of this signal`,
    });
    layerA.push(
      sourceInput(storms, tally.eventsCounted, {
        windEvents: tally.eventsCounted,
        decayedPoints: Number(windPoints.toFixed(2)),
      }),
    );
  }

  const blended = storms && storms.status !== "sample"
    ? droughtMean * TREES_BLEND.droughtShare + windScore * TREES_BLEND.stormShare
    : droughtMean;
  const score = toScore(blended);
  return assemble(
    "trees-yard",
    "Trees & Yard",
    weight,
    blended,
    score,
    terms,
    layerA,
    storms && storms.status !== "sample"
      ? undefined
      : "Computed from drought alone — no live storm feed for this area to supply the wind component.",
  );
}

export function hvac(ctx: SignalContext, weight: number): SignalResult {
  const nws = findDataset<{ forecastHighF?: number }>("nws-api", ctx.areaId);
  const air = findDataset<{ aqi?: number }>("airnow", ctx.areaId);
  const haveNws = !!nws && nws.status !== "sample";
  const haveAir = !!air && air.status !== "sample";

  // Heat load is the signal. Air quality is a secondary term worth a few
  // points, so scoring HVAC without the forecast feed does not produce a weak
  // HVAC reading — it produces a wrong one. San Antonio has AirNow but no NWS
  // feed, and scoring it on air quality alone returned 1/100, which reads as
  // "cooling demand is negligible in San Antonio in August". That is worse
  // than publishing nothing, so a missing forecast feed makes the whole signal
  // unavailable and the composite re-normalises over the signals that ran.
  if (!haveNws) {
    return unavailable(
      "hvac",
      "HVAC",
      weight,
      `No National Weather Service forecast feed for ${ctx.areaLabel}. Heat load is most of this ` +
        `signal, and air quality alone would understate cooling demand badly enough to mislead, ` +
        `so no HVAC score is published for this area.`,
      haveAir ? [sourceInput(air!, 0, {})] : [],
    );
  }

  const layerA: SourceInput[] = [];
  const terms: ScoreTerm[] = [];
  let points = 0;

  if (haveNws) {
    const rows = measured(nws!).filter((o) => typeof o.value.forecastHighF === "number");
    if (rows.length > 0) {
      const highs = rows.map((o) => o.value.forecastHighF as number);
      const hot = highs.filter((h) => h >= HVAC.hotDayF).length;
      const extreme = highs.filter((h) => h >= HVAC.extremeDayF).length;
      const hotPts = HVAC.hotDayPoints * (hot / highs.length);
      const extremePts = HVAC.extremeDayPoints * (extreme / highs.length);
      points += hotPts + extremePts;
      terms.push({
        code: "heat-load",
        label: `Days at or above ${HVAC.hotDayF}°F`,
        points: Number(hotPts.toFixed(2)),
        detail: `${hot} of ${highs.length} forecast days`,
      });
      if (extreme > 0) {
        terms.push({
          code: "extreme-heat",
          label: `Days at or above ${HVAC.extremeDayF}°F`,
          points: Number(extremePts.toFixed(2)),
          detail: `${extreme} of ${highs.length} forecast days`,
        });
      }
      layerA.push(
        sourceInput(nws!, rows.length, {
          daysObserved: highs.length,
          daysAtOrAbove100F: hot,
          daysAtOrAbove105F: extreme,
          maxForecastHighF: Math.max(...highs),
        }),
      );
    }
  }

  if (haveAir) {
    const rows = measured(air!).filter((o) => typeof o.value.aqi === "number");
    if (rows.length > 0) {
      const aqis = rows.map((o) => o.value.aqi as number);
      const meanAqi = aqis.reduce((a, b) => a + b, 0) / aqis.length;
      const frac = clamp((meanAqi - HVAC.aqiFloor) / (HVAC.aqiCeiling - HVAC.aqiFloor), 0, 1);
      const pts = HVAC.aqiMaxPoints * frac;
      points += pts;
      terms.push({
        code: "air-quality",
        label: "Air quality (filter load)",
        points: Number(pts.toFixed(2)),
        detail: `Mean AQI ${meanAqi.toFixed(0)} over ${aqis.length} readings`,
      });
      layerA.push(sourceInput(air!, rows.length, { readings: aqis.length, meanAqi: Number(meanAqi.toFixed(1)) }));
    }
  }

  const score = toScore(points);
  return assemble(
    "hvac",
    "HVAC",
    weight,
    points,
    score,
    terms,
    layerA,
  );
}

/** Primary county FIPS per area — the county whose USDM series represents the
 * metro. Neighbouring counties are ingested too (see the USDM fetcher) and are
 * available for a future county-level read; the index deliberately reports the
 * primary county rather than averaging, so the reading maps to a real place. */
export const PRIMARY_FIPS: Record<string, string> = {
  austin: "48453", // Travis
  "san-antonio": "48029", // Bexar
};
