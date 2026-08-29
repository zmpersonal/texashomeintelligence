/**
 * Area definitions and the ZIP→area crosswalk's provenance.
 *
 * ══ SOURCE ══════════════════════════════════════════════════════════════
 * ZIP coverage comes from `zip-area-crosswalk.csv`, committed beside this
 * file and read verbatim at build time (never re-keyed into TypeScript, so
 * there is exactly one copy and no chance of the two drifting).
 *
 *   U.S. Census Bureau, 2020 ZCTA-to-County Relationship File
 *   (tab20_zcta520_county20_natl.txt), filtered to the Austin MSA counties
 *   (Travis, Williamson, Hays, Bastrop, Caldwell) and the San Antonio MSA
 *   counties (Bexar, Comal, Guadalupe, Wilson, Atascosa, Medina, Kendall,
 *   Bandera). Supplied by the owner and retrieved 2026-08-29.
 *   231 rows / 225 distinct ZIPs.
 *
 * This replaces an earlier stopgap that claimed whole ZIP3 prefix ranges
 * ("anything starting 787 is Austin"). That tier is gone: prefix ranges are
 * not coterminous with metro boundaries, so it over-claimed rural ZIPs, and
 * every ZIP we now resolve is backed by the Census file above. A ZIP that is
 * not in the file returns "not covered yet" rather than being snapped to the
 * nearest metro.
 */

export interface AreaCounty {
  name: string;
  fips: string;
}

export interface ZipArea {
  /** Matches the `location` on the generated dataset files, and the `area`
   * column in the crosswalk (which uses `san_antonio`; normalised on read). */
  areaId: string;
  label: string;
  /**
   * The county whose readings the published index uses for this whole area.
   * A ZIP in, say, Bastrop County still sees Travis County readings — the
   * resolver reports both counties so the dashboard can say which is which
   * rather than implying the reading is local to the ZIP's own county.
   */
  primaryCounty: AreaCounty;
  /**
   * Counties we ingest a drought series for. Consumed by the USDM fetcher, so
   * the ingested set and the published set cannot drift.
   * These are the counties the crosswalk marks `drought_county_granular=yes`.
   */
  droughtCounties: AreaCounty[];
  /**
   * Counties that appear in this area's NOAA storm records. Wider than the MSA
   * county list because NOAA files events by forecast zone — Burnet and Blanco
   * rows show up in the Austin feed. Documentation only: storm scoring uses the
   * area's primary county alone.
   */
  stormCounties: string[];
  /**
   * Metro centroid. The NWS fetcher resolves a forecast gridpoint from a
   * lat/lon via `/points/{lat},{lon}`, so this carries the point and lets the
   * API do the resolution it already does; storing a hardcoded office/gridX/
   * gridY would duplicate state the API derives and rot when NWS re-grids.
   */
  point: { lat: number; lon: number };
}

export const ZIP_AREAS: ZipArea[] = [
  {
    areaId: "austin",
    label: "Austin",
    primaryCounty: { name: "Travis", fips: "48453" },
    droughtCounties: [
      { name: "Travis", fips: "48453" },
      { name: "Williamson", fips: "48491" },
      { name: "Hays", fips: "48209" },
    ],
    stormCounties: ["Travis", "Williamson", "Hays", "Bastrop", "Caldwell", "Burnet", "Blanco"],
    point: { lat: 30.2672, lon: -97.7431 },
  },
  {
    areaId: "san-antonio",
    label: "San Antonio",
    primaryCounty: { name: "Bexar", fips: "48029" },
    droughtCounties: [
      { name: "Bexar", fips: "48029" },
      { name: "Comal", fips: "48091" },
      { name: "Guadalupe", fips: "48187" },
    ],
    stormCounties: ["Bexar", "Comal", "Guadalupe", "Medina", "Wilson", "Atascosa", "Bandera", "Kendall"],
    point: { lat: 29.4241, lon: -98.4936 },
  },
];

/**
 * ⚠️ THE ONE PLACE A HUMAN JUDGEMENT DECIDES, NOT THE CENSUS FILE.
 *
 * Six ZCTAs straddle the Austin and San Antonio MSA boundary and therefore
 * appear in the crosswalk twice, once per metro. Both rows are correct — the
 * ZCTA really does touch counties in both metros — but a homeowner typing a
 * ZIP has to be shown one reading, so something has to choose.
 *
 * The file carries no land-area or population share, so there is no basis in
 * the data to arbitrate. These assignments are therefore editorial and should
 * be confirmed. Each entry names both candidate counties so the choice can be
 * checked without opening the CSV. Changing one is a one-line edit.
 *
 * Two of the six are decided by data rather than judgement: for 78648 and
 * 78655 the Austin-side county (Caldwell) is one we do not ingest drought for,
 * while the San Antonio side (Guadalupe) is — so the San Antonio row yields a
 * county-granular reading and the Austin row would not.
 *
 * Whichever way each falls, the resolver flags these ZIPs as straddling both
 * metros and the dashboard says so, so a reader is never told a boundary ZIP
 * sits cleanly in one metro.
 */
export const CROSS_METRO_ZIPS: Record<string, { area: string; note: string }> = {
  // Austin row: Hays. San Antonio row: Comal + Guadalupe. Judgement.
  "78130": { area: "san-antonio", note: "Hays (Austin) vs Comal/Guadalupe (San Antonio)" },
  // Austin row: Hays. San Antonio row: Comal. Judgement — least certain of the six.
  "78623": { area: "san-antonio", note: "Hays (Austin) vs Comal (San Antonio)" },
  // Decided by data: Caldwell is not drought-granular, Guadalupe is.
  "78648": { area: "san-antonio", note: "Caldwell (Austin, no drought series) vs Guadalupe (San Antonio)" },
  // Decided by data: as above.
  "78655": { area: "san-antonio", note: "Caldwell (Austin, no drought series) vs Guadalupe (San Antonio)" },
  // Austin row: Caldwell + Hays. San Antonio row: Comal + Guadalupe. Judgement.
  "78666": { area: "austin", note: "Hays (Austin) vs Comal/Guadalupe (San Antonio)" },
  // Austin row: Hays. San Antonio row: Comal. Judgement.
  "78676": { area: "austin", note: "Hays (Austin) vs Comal (San Antonio)" },
};
