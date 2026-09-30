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
  droughtCounties: readonly AreaCounty[];
  /**
   * Counties that appear in this area's NOAA storm records. Wider than the MSA
   * county list because NOAA files events by forecast zone — Burnet and Blanco
   * rows show up in the Austin feed. Documentation only: storm scoring uses the
   * area's primary county alone.
   */
  stormCounties: readonly string[];
  /**
   * Metro centroid. The NWS fetcher resolves a forecast gridpoint from a
   * lat/lon via `/points/{lat},{lon}`, so this carries the point and lets the
   * API do the resolution it already does; storing a hardcoded office/gridX/
   * gridY would duplicate state the API derives and rot when NWS re-grids.
   */
  point: { lat: number; lon: number };
}

export const ZIP_AREAS = [
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
] as const satisfies readonly ZipArea[];

/**
 * ⚠️ THE AREA UNION IS DERIVED, NOT DECLARED. Round 40.
 *
 * Every module that used to write `"austin" | "san-antonio"` by hand now writes
 * `AreaId`. Adding an entry to ZIP_AREAS above widens this union everywhere at
 * once, so a metro can never be half-added: the union and the config cannot
 * drift, because there is only one of them.
 *
 * The lookups a metro still needs — a county set for storms, a ZIP for air
 * quality, a CBSA for wages, a county FIPS for ACS, a soil point — are typed
 * `Record<AreaId, …>`. That is deliberate: adding an entry here turns those
 * five into COMPILE ERRORS naming exactly what is missing, rather than letting
 * a new metro build successfully with silent gaps. See
 * `docs/audits/round-40-third-metro-readiness.md`.
 */
export type AreaId = (typeof ZIP_AREAS)[number]["areaId"];

/**
 * The display name for an area, from the same config every page renders from.
 *
 * ⚠️ THROWS on an unknown id, and that is the feature. Round 39 found this as
 * a two-metro ternary in `lib/account/alerts.ts`:
 *
 *     areaId === "san-antonio" ? "San Antonio" : "Austin"
 *
 * A third metro did not fail there — it was silently labelled "Austin" in
 * account alerts. It typechecked, it built, and it was wrong. A wrong place
 * name in an alert is a false statement to a homeowner about their own home,
 * which is worse than a failed build by every measure this project uses. So
 * this resolves or it stops the build; it never falls back.
 *
 * `lib/zipAreas.ts` already throws the same way for a crosswalk row with no
 * ZIP_AREAS entry — this is that rule applied to the label.
 */
export function areaLabel(areaId: string): string {
  const area = ZIP_AREAS.find((a) => a.areaId === areaId);
  if (!area) {
    throw new Error(
      `areaLabel("${areaId}"): no entry in ZIP_AREAS. Known areas: ` +
        `${ZIP_AREAS.map((a) => a.areaId).join(", ")}. Add the area to ` +
        `src/data/zip-areas.ts rather than defaulting to a metro.`,
    );
  }
  return area.label;
}

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

/**
 * The counties a drought series is ingested for, per area.
 *
 * Lives here rather than in `lib/zipAreas.ts` on purpose: that module imports
 * `zipCrosswalk.ts`, which reads the crosswalk with Vite's `?raw` suffix. Vite
 * resolves that during `astro build`; plain Node, which is what `npm run
 * ingest` runs under, cannot — it throws ERR_UNKNOWN_FILE_EXTENSION on the
 * .csv before a single fetcher runs. The ingest path therefore imports this
 * function from here, where the only dependency is the ZIP_AREAS literal above.
 */
/**
 * The county whose readings an area publishes.
 *
 * Round 40. `lib/belowHeroReadings.ts` carried this as
 * `location === "san-antonio" ? "Bexar" : "Travis"`, so a third metro's storm
 * rows would have been filtered to Travis County and the result published as
 * that metro's reading — a wrong county attached to a real number. Same rule as
 * `areaLabel`: it resolves from config or it throws.
 */
export function primaryCountyName(areaId: string): string {
  const area = ZIP_AREAS.find((a) => a.areaId === areaId);
  if (!area) {
    throw new Error(
      `primaryCountyName("${areaId}"): no entry in ZIP_AREAS. Known areas: ` +
        `${ZIP_AREAS.map((a) => a.areaId).join(", ")}.`,
    );
  }
  return area.primaryCounty.name;
}

export function ingestCounties(areaId: string): { name: string; fips: string }[] {
  const area = ZIP_AREAS.find((a) => a.areaId === areaId);
  return (area?.droughtCounties ?? []).map((c) => ({ name: c.name, fips: c.fips }));
}
