/**
 * ZIP → area resolution.
 *
 * Contains no place names, ZIPs or county lists: coverage is the Census-derived
 * crosswalk in `src/data/zip-area-crosswalk.csv`, and area metadata is
 * `src/data/zip-areas.ts`. This file only knows the resolution rules.
 *
 * Two outcomes:
 *   covered   — the ZIP is in the Census crosswalk. It carries both the ZIP's
 *               own county and the county whose readings we actually publish
 *               for that metro, because for 52 of the 231 rows those differ.
 *   uncovered — no row for it. We say so rather than snapping it to a metro.
 *
 * The earlier prefix tier (and its weak/strong `confidence` flag) is gone: every
 * covered ZIP is now sourced, so the distinction it drew no longer exists.
 */
import { CROSS_METRO_ZIPS, ZIP_AREAS, type ZipArea } from "../data/zip-areas";
import { CROSSWALK, CROSSWALK_ROWS, crossMetroZips, type CrosswalkRow } from "./zipCrosswalk";

export interface ZipResolved {
  covered: true;
  zip: string;
  areaId: string;
  areaLabel: string;
  /** The ZIP's own primary county, from the Census file. */
  countyName: string;
  countyFips: string;
  /** Every in-metro county the ZCTA touches. */
  countyFipsAll: string[];
  /** The county the published reading is actually computed for. */
  readingCountyName: string;
  readingCountyFips: string;
  /** False when the ZIP's county is not the county behind the reading. */
  readingIsOwnCounty: boolean;
  /** True when we ingest a drought series for the ZIP's own county — i.e. a
   * county-level reading becomes possible here once scoring goes per-county. */
  droughtCountyGranular: boolean;
  /** Set when the Census file places this ZIP in both metros. */
  straddlesMetros?: string;
  point: { lat: number; lon: number };
  /** Plain-language accuracy statement. The dashboard must show this beside any
   * reading resolved from a ZIP; it is what stops a county-level number from
   * reading as an address-level one. */
  precisionNote: string;
}

export interface ZipUncovered {
  covered: false;
  zip: string;
  reason: string;
}

export type ZipResolution = ZipResolved | ZipUncovered;

const ZIP_RE = /^\d{5}$/;

export function normalizeZip(input: string): string | undefined {
  const trimmed = input.trim().slice(0, 5);
  return ZIP_RE.test(trimmed) ? trimmed : undefined;
}

function precisionNote(row: CrosswalkRow, area: ZipArea, straddles: boolean): string {
  const parts: string[] = [];
  parts.push(
    row.primaryCountyFips === area.primaryCounty.fips
      ? `${row.zip} is in ${row.primaryCountyName} County. Readings are for that county and the ` +
        `${area.label} metro — they describe the area, not this address.`
      : `${row.zip} is in ${row.primaryCountyName} County. The readings shown are for ` +
        `${area.primaryCounty.name} County, which is the county we publish for the ${area.label} ` +
        `metro — so they describe nearby conditions rather than ${row.primaryCountyName} County itself.`,
  );
  if (row.metroCountyFips.length > 1) {
    parts.push(`This ZIP spans ${row.metroCountyFips.length} counties in the metro.`);
  }
  if (straddles) {
    parts.push(
      `It also crosses the Austin–San Antonio metro boundary; we report it under ${area.label}.`,
    );
  }
  return parts.join(" ");
}

export function resolveZip(input: string): ZipResolution {
  const zip = normalizeZip(input);
  if (!zip) {
    return { covered: false, zip: input.trim(), reason: "That is not a five-digit ZIP code." };
  }
  const row = CROSSWALK.get(zip);
  if (!row) {
    return {
      covered: false,
      zip,
      reason:
        "We don't cover this ZIP yet. Texas Home Intelligence currently publishes readings for the " +
        `${ZIP_AREAS.map((a) => a.label).join(" and ")} metros.`,
    };
  }
  const area = ZIP_AREAS.find((a) => a.areaId === row.areaId);
  if (!area) {
    throw new Error(`zip-area-crosswalk.csv has area "${row.areaId}" with no entry in ZIP_AREAS`);
  }
  const straddles = zip in CROSS_METRO_ZIPS;
  return {
    covered: true,
    zip,
    areaId: area.areaId,
    areaLabel: area.label,
    countyName: row.primaryCountyName,
    countyFips: row.primaryCountyFips,
    countyFipsAll: row.metroCountyFips,
    readingCountyName: area.primaryCounty.name,
    readingCountyFips: area.primaryCounty.fips,
    readingIsOwnCounty: row.primaryCountyFips === area.primaryCounty.fips,
    droughtCountyGranular: row.droughtCountyGranular,
    straddlesMetros: straddles ? CROSS_METRO_ZIPS[zip].note : undefined,
    point: area.point,
    precisionNote: precisionNote(row, area, straddles),
  };
}

/** Area definitions in the shape the index wants. */
export function areaDefinitions() {
  return ZIP_AREAS.map((a) => ({
    areaId: a.areaId,
    areaLabel: a.label,
    primaryCounty: a.primaryCounty.name,
    counties: a.stormCounties,
  }));
}

/** Counties whose drought series we ingest, per area. Consumed by the USDM
 * fetcher so the ingested county set and the published set cannot drift. */
export function ingestCounties(areaId: string): { name: string; fips: string }[] {
  const area = ZIP_AREAS.find((a) => a.areaId === areaId);
  return (area?.droughtCounties ?? []).map((c) => ({ name: c.name, fips: c.fips }));
}

export function coverageSummary() {
  return ZIP_AREAS.map((a) => {
    const rows = [...CROSSWALK.values()].filter((r) => r.areaId === a.areaId);
    const counties = new Map<string, number>();
    for (const r of rows) counties.set(r.primaryCountyName, (counties.get(r.primaryCountyName) ?? 0) + 1);
    return {
      areaId: a.areaId,
      label: a.label,
      zips: rows.length,
      countiesByZipCount: [...counties.entries()].sort((x, y) => y[1] - x[1]),
      droughtGranularZips: rows.filter((r) => r.droughtCountyGranular).length,
      multiCountyZips: rows.filter((r) => r.metroCountyFips.length > 1).length,
      droughtCounties: a.droughtCounties.length,
      stormCounties: a.stormCounties.length,
    };
  });
}

export function coverageTotals() {
  return {
    csvRows: CROSSWALK_ROWS.length,
    distinctZips: CROSSWALK.size,
    crossMetro: crossMetroZips(),
  };
}

export { ZIP_AREAS, crossMetroZips };
