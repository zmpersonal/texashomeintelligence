/**
 * ZIP → area resolution.
 *
 * Contains no place names, ZIPs or county lists — all of that is data in
 * `src/data/zip-areas.ts`. Adding a metro is a config edit; this file only
 * knows the resolution *rules*.
 *
 * Three outcomes, and the caller can always tell them apart:
 *   verified  — this exact ZIP is on a sourced list for the area
 *   prefix    — the ZIP3 matches an area's claimed prefix range, so we resolve
 *               it to that metro but cannot vouch for the county
 *   uncovered — no area claims it; we say so rather than guessing a nearest metro
 */
import { ZIP_AREAS, type ZipArea } from "../data/zip-areas";

export type ZipConfidence = "verified" | "prefix";

export interface ZipResolved {
  covered: true;
  zip: string;
  confidence: ZipConfidence;
  areaId: string;
  areaLabel: string;
  countyName: string;
  countyFips: string;
  point: { lat: number; lon: number };
  /** Plain-language accuracy statement. The dashboard must show this next to
   * any reading resolved from a ZIP — it is what keeps a metro-level number
   * from reading as an address-level one. */
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

function resolved(zip: string, area: ZipArea, confidence: ZipConfidence): ZipResolved {
  return {
    covered: true,
    zip,
    confidence,
    areaId: area.areaId,
    areaLabel: area.label,
    countyName: area.primaryCounty.name,
    countyFips: area.primaryCounty.fips,
    point: area.point,
    precisionNote:
      confidence === "verified"
        ? `Readings are for ${area.primaryCounty.name} County and the ${area.label} metro. ` +
          `They describe the area around ${zip}, not this address.`
        : `${zip} is matched to the ${area.label} metro by its ZIP prefix, not by a verified ` +
          `ZIP-to-county list. Readings are for ${area.primaryCounty.name} County and may fit ` +
          `this ZIP less well than one we have confirmed.`,
  };
}

export function resolveZip(input: string): ZipResolution {
  const zip = normalizeZip(input);
  if (!zip) {
    return { covered: false, zip: input.trim(), reason: "That is not a five-digit ZIP code." };
  }
  const exact = ZIP_AREAS.find((a) => a.verifiedZips.includes(zip));
  if (exact) return resolved(zip, exact, "verified");

  const byPrefix = ZIP_AREAS.find((a) => a.zipPrefixes.some((p) => zip.startsWith(p)));
  if (byPrefix) return resolved(zip, byPrefix, "prefix");

  return {
    covered: false,
    zip,
    reason:
      "We don't cover this ZIP yet. Texas Home Intelligence currently publishes readings for " +
      `${ZIP_AREAS.map((a) => a.label).join(" and ")}.`,
  };
}

/** Area definitions in the shape the index wants. */
export function areaDefinitions() {
  return ZIP_AREAS.map((a) => ({
    areaId: a.areaId,
    areaLabel: a.label,
    primaryCounty: a.primaryCounty.name,
    counties: a.counties.map((c) => c.name),
  }));
}

/** Counties whose drought series we ingest, per area. Consumed by the USDM
 * fetcher so the ingested county set and the published county set cannot drift. */
export function ingestCounties(areaId: string): { name: string; fips: string }[] {
  const area = ZIP_AREAS.find((a) => a.areaId === areaId);
  return (area?.counties ?? []).filter((c) => c.ingest).map((c) => ({ name: c.name, fips: c.fips }));
}

export function coverageSummary() {
  return ZIP_AREAS.map((a) => ({
    areaId: a.areaId,
    label: a.label,
    verifiedZips: a.verifiedZips.length,
    prefixes: a.zipPrefixes,
    ingestCounties: a.counties.filter((c) => c.ingest).length,
    stormCounties: a.counties.length,
  }));
}

export { ZIP_AREAS };
