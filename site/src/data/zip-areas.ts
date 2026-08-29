/**
 * ZIP → area map. Data, not logic — the resolver in `src/lib/zipAreas.ts`
 * contains no place names at all, so adding a metro is an edit to this file.
 *
 * ══ READ THIS BEFORE TRUSTING THE COVERAGE ══════════════════════════════
 * `verifiedZips` holds only ZIPs traceable to a source inside this repo (the
 * `provenance` field on each area says which). It is NOT a complete metro
 * enumeration, because a complete one has to come from the Census ZCTA↔county
 * relationship file and that could not be fetched in the environment this was
 * written in (all outbound network access was blocked).
 *
 * `zipPrefixes` is the stopgap that honours the owner's decision that no ZIP
 * inside a supported metro should hit "not covered". A prefix match resolves
 * to the metro with `confidence: "prefix"`, which the UI must surface — it is
 * a claim about a USPS ZIP3 range, not a verified per-ZIP county assignment.
 * ⚠️ THE PREFIX LISTS ARE PROPOSED, NOT SOURCED. They need either owner
 * confirmation or, better, replacement by `verifiedZips` generated from the
 * Census file. Until then a prefix hit may over-claim: ZIP3 ranges are not
 * coterminous with metro boundaries, so some rural ZIPs sharing a prefix will
 * resolve to a metro whose county reading is a poor fit for them.
 *
 * To replace the stopgap with real data, run the generator where egress works:
 *   npm run build-zip-areas
 * which writes `verifiedZips` from
 *   www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/…county20_natl.txt
 * filtered to each area's county FIPS. Once `verifiedZips` covers a metro,
 * drop that metro's `zipPrefixes` to `[]` and coverage becomes fully sourced.
 */

export interface AreaCounty {
  name: string;
  fips: string;
}

export interface ZipArea {
  /** Matches the `location` on the generated dataset files. */
  areaId: string;
  label: string;
  /** The county whose readings represent this area. */
  primaryCounty: AreaCounty;
  /**
   * Counties this area covers. Two jobs: filtering county-tagged NOAA storm
   * rows, and telling the USDM fetcher which counties to ingest.
   * `ingest: true` marks the ones we pull drought for — a county can appear
   * here for storm filtering without us ingesting its drought series.
   */
  counties: (AreaCounty & { ingest?: boolean })[];
  /**
   * Metro centroid. The repo's NWS fetcher resolves the forecast gridpoint
   * from a lat/lon via `/points/{lat},{lon}` rather than storing a gridpoint,
   * so this carries the point and lets the API do the resolution it already
   * does. Storing a hardcoded office/gridX/gridY would duplicate state the
   * API derives and would silently rot when NWS re-grids.
   */
  point: { lat: number; lon: number };
  /** Where each verified ZIP came from. */
  provenance: string;
  verifiedZips: string[];
  /** ⚠️ Proposed, unsourced — see the file header. */
  zipPrefixes: string[];
}

export const ZIP_AREAS: ZipArea[] = [
  {
    areaId: "austin",
    label: "Austin",
    primaryCounty: { name: "Travis", fips: "48453" },
    counties: [
      { name: "Travis", fips: "48453", ingest: true },
      { name: "Williamson", fips: "48491", ingest: true },
      { name: "Hays", fips: "48209", ingest: true },
      // Present in the NOAA storm record for the Austin forecast area, so they
      // are listed for storm filtering. Not ingested for drought: the three
      // above are the metro core and each extra county is another weekly API
      // call for a reading we do not yet surface separately.
      { name: "Bastrop", fips: "48021" },
      { name: "Caldwell", fips: "48055" },
      { name: "Burnet", fips: "48053" },
      { name: "Blanco", fips: "48031" },
    ],
    point: { lat: 30.2672, lon: -97.7431 },
    provenance:
      "78701 from the AirNow fetcher's configured ZIP (src/ingest/fetchers/airnow.ts); " +
      "78702, 78704, 78745 and 78749 from the owner-supplied brand kit and dashboard " +
      "design references in docs/source/. No Census crosswalk was reachable.",
    verifiedZips: ["78701", "78702", "78704", "78745", "78749"],
    zipPrefixes: ["786", "787", "789"],
  },
  {
    areaId: "san-antonio",
    label: "San Antonio",
    primaryCounty: { name: "Bexar", fips: "48029" },
    counties: [
      { name: "Bexar", fips: "48029", ingest: true },
      { name: "Comal", fips: "48091", ingest: true },
      { name: "Guadalupe", fips: "48187", ingest: true },
      { name: "Medina", fips: "48325" },
      { name: "Wilson", fips: "48493" },
      { name: "Atascosa", fips: "48013" },
      { name: "Bandera", fips: "48019" },
      { name: "Kendall", fips: "48259" },
    ],
    point: { lat: 29.4241, lon: -98.4936 },
    provenance:
      "78205 from the AirNow fetcher's configured ZIP (src/ingest/fetchers/airnow.ts). " +
      "No Census crosswalk was reachable.",
    verifiedZips: ["78205"],
    zipPrefixes: ["780", "781", "782"],
  },
];
