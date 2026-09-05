/**
 * Roof Scan's readings, computed at build time from `src/data/generated/**`.
 *
 * Kept out of `data/roofScan.ts` on purpose, the same split the below-hero
 * layer uses: that file holds prose, this one holds the arithmetic, and no
 * number in the copy config is ever a literal.
 *
 * ── THREE PRODUCTS, THREE SHAPES, NEVER MERGED ────────────────────────────
 * Radar signatures come from a BOX around a metro reference point and carry no
 * county. Confirmed reports come from NCEI filed BY COUNTY. Permits come from a
 * CITY. Each reading below carries the shape it was counted over, because the
 * one thing this tool must not do is let a reader add them together.
 */
import { findDataset, freshnessOf, type Freshness } from "./datasets";
import { ZIP_AREAS } from "../data/zip-areas";
import { buildNow } from "../data/serviceNotices";

/** The `noaa-storm-events` observation shape this file reads. */
interface StormEventRow {
  eventType?: string;
  county?: string;
  magnitude?: string;
}

/** The `swdi-nx3hail` observation shape, as Round 22 defined it. */
interface RadarHailRow {
  observationType: "radar-derived-hail-signature";
  sourceProduct: string;
  areaBasis: "box-around-metro-reference-point-not-a-county";
  maxSizeUnit: null;
}

/** Half-width of the SWDI query box, in degrees. Imported meaning, not a
 * re-typed constant: this is what `ingest/fetchers/swdiHail.ts` queries with,
 * and the page states it as a box because that is what it is. */
export const BOX_PAD_DEGREES = 0.5;

export interface CountyHailCount {
  county: string;
  /** Confirmed hail events NCEI recorded for this county in the window. */
  hail: number;
  /**
   * Events of every OTHER type recorded for this county in the same window.
   * This is what turns a zero into a measurement: a county with 0 hail and 14
   * other events is present in the file and reported no hail, which is a
   * different fact from a county nobody files anything for.
   */
  otherEvents: number;
}

export interface ConfirmedHailReading {
  metro: string;
  counties: CountyHailCount[];
  total: number;
  windowStart: string;
  windowEnd: string;
  /** Days between the newest record and the build. The PUBLISHER's lag. */
  lagDays: number;
  freshness: Freshness;
  sourceName: string;
  sourceUrl: string;
  href: string;
}

export type RadarHailReading =
  | {
      available: true;
      metro: string;
      signatures: number;
      windowStart: string;
      windowEnd: string;
      product: string;
      freshness: Freshness;
      sourceName: string;
      sourceUrl: string;
    }
  | {
      available: false;
      metro: string;
      /** What this reading needs before it can be published. Named, not hidden. */
      needs: string;
    };

const isoDay = (s: string) => s.slice(0, 10);

/**
 * Confirmed hail, by county, from NCEI Storm Events.
 *
 * Every county present in the metro's file is listed, INCLUDING the ones with
 * zero hail. Dropping the zeroes would turn "Bexar County reported no confirmed
 * hail this window" — a real reading, and the one this tool exists to show
 * against the radar count — into an absence a reader would read as no coverage.
 */
export function confirmedHail(metro: string): ConfirmedHailReading | undefined {
  const dataset = findDataset<StormEventRow>("noaa-storm-events", metro);
  if (!dataset || dataset.status === "sample") return undefined;
  const rows = dataset.observations.filter((o) => !o.seed);
  if (rows.length === 0) return undefined;

  const byCounty = new Map<string, { hail: number; otherEvents: number }>();
  for (const r of rows) {
    const county = r.value.county;
    if (!county) continue;
    const entry = byCounty.get(county) ?? { hail: 0, otherEvents: 0 };
    if (r.value.eventType === "Hail") entry.hail += 1;
    else entry.otherEvents += 1;
    byCounty.set(county, entry);
  }

  const counties = [...byCounty.entries()]
    .map(([county, v]) => ({ county, ...v }))
    // Most confirmed hail first, then alphabetically — so a zero is at the
    // bottom of a list a reader has already read, not omitted from it.
    .sort((a, b) => b.hail - a.hail || a.county.localeCompare(b.county));

  const observedAts = rows.map((r) => r.observedAt).sort();
  const newest = observedAts[observedAts.length - 1];

  return {
    metro,
    counties,
    total: counties.reduce((t, c) => t + c.hail, 0),
    windowStart: isoDay(observedAts[0]),
    windowEnd: isoDay(newest),
    lagDays: Math.round((buildNow().getTime() - new Date(newest).getTime()) / 86_400_000),
    freshness: freshnessOf(dataset),
    sourceName: dataset.source.name,
    sourceUrl: dataset.source.url,
    href: `/data/${metro}/storms/`,
  };
}

/**
 * Radar hail signatures from SWDI nx3hail.
 *
 * ⚠️ AS OF THIS ROUND THERE IS NO COMMITTED DATA FOR THIS FEED. The fetcher was
 * built and tested in Rounds 22-23 and is registered in the deep tier, but no
 * live ingestion run has written `src/data/generated/swdi-nx3hail/*.json`, and
 * this container cannot reach the host to write one. So this returns the
 * unavailable branch and the page renders an explicit "we do not hold this yet"
 * state naming what it needs.
 *
 * It is written to fill in with no further work: the moment an ingestion run
 * commits the files, `findDataset` resolves and the available branch renders.
 * What it must never do is substitute a zero — CLAUDE.md, and a zero here would
 * read as "no hail signatures over your metro", which is the opposite of
 * unknown.
 */
export function radarHail(metro: string): RadarHailReading {
  const dataset = findDataset<RadarHailRow>("swdi-nx3hail", metro);
  if (!dataset || dataset.status === "sample") {
    return {
      available: false,
      metro,
      needs:
        "an ingestion run of the swdi-nx3hail fetcher, which is built and registered but has " +
        "not yet written a dataset file for this metro",
    };
  }
  const rows = dataset.observations.filter((o) => !o.seed);
  if (rows.length === 0) {
    return {
      available: false,
      metro,
      needs: "records in the committed swdi-nx3hail dataset — the file exists but holds no signatures",
    };
  }
  const observedAts = rows.map((r) => r.observedAt).sort();
  return {
    available: true,
    metro,
    signatures: rows.length,
    windowStart: isoDay(observedAts[0]),
    windowEnd: isoDay(observedAts[observedAts.length - 1]),
    // Named from the data, not asserted here, so a change of product upstream
    // cannot leave the page describing the wrong one.
    product: rows[0].value.sourceProduct ?? "SWDI nx3hail",
    freshness: freshnessOf(dataset),
    sourceName: dataset.source.name,
    sourceUrl: dataset.source.url,
  };
}

/** The query box, described in the words the page must use for it. */
export function boxDescription(metro: string): string | undefined {
  const area = ZIP_AREAS.find((a) => a.areaId === metro);
  if (!area) return undefined;
  return (
    `a box ${BOX_PAD_DEGREES}° of latitude and longitude either side of ` +
    `${area.point.lat.toFixed(4)}, ${area.point.lon.toFixed(4)} — one reference point for the ` +
    `${area.label} metro. That is a rectangle on a map, not a county and not a city limit.`
  );
}
