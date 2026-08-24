import type { FetcherModule, Observation } from "../types";

export interface DroughtValue {
  /** e.g. "D2 — Severe Drought" or "None (no drought)". */
  droughtIndex?: string;
  rainfallInches?: number;
}

/**
 * U.S. Drought Monitor — the DATA service is a different host than the
 * informational site: `usdmdataservices.unl.edu`, not
 * `droughtmonitor.unl.edu` (the latter 404s to an HTML page for this
 * path, which is what previously surfaced as "Unexpected token '<'").
 * Keyless JSON REST, `GetDroughtSeverityStatisticsByAreaPercent`,
 * county-level (`aoi` = 5-digit county FIPS: Travis 48453, Bexar 48029).
 * Requires an explicit `Accept: application/json` header — without it
 * the API returns XML.
 *
 * Real response shape confirmed against a live Actions run (a temporary
 * diagnostic version logged the raw body): each row is **camelCase**
 * (`mapDate`, `fips`, `county`, `state`, `none`, `d0`..`d4`, `validStart`,
 * `validEnd`) — not the PascalCase `MapDate`/`D0`..`D4` originally
 * assumed, which silently produced 0 observations (every row failed the
 * `row.MapDate` check without throwing). `mapDate` is also a full
 * datetime string like `"2026-08-18T00:00:00"` (no timezone), not the
 * `YYYYMMDD` compact form assumed — treated as UTC for consistency with
 * every other fetcher's "date-only precision, UTC" convention. Each row
 * reports the % of the county's area at-or-worse-than each D-category
 * (none/d0-d4, cumulative).
 *
 * Reduces each week's row to a single county-level category: the worst
 * (highest) D-level with area% > 0, labeled with its standard USDM name.
 * This is a documented simplification of a genuinely multi-category
 * breakdown, not a fabrication — the underlying percentages are real.
 * One observation per published week (real history), keyed by county +
 * week end date, so a later revision to a week updates in place.
 */
const COUNTY_FIPS_BY_LOCATION: Record<"austin" | "san-antonio", string> = {
  austin: "48453", // Travis
  "san-antonio": "48029", // Bexar
};

const D_LABELS = ["D0 — Abnormally Dry", "D1 — Moderate Drought", "D2 — Severe Drought", "D3 — Extreme Drought", "D4 — Exceptional Drought"];

function mdyyyy(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

interface UsdmWeekRow {
  mapDate?: string;
  none?: number;
  d0?: number;
  d1?: number;
  d2?: number;
  d3?: number;
  d4?: number;
}

function reduceToCategory(row: UsdmWeekRow): string {
  const levels = [row.d4, row.d3, row.d2, row.d1, row.d0];
  for (let i = 0; i < levels.length; i++) {
    const pct = levels[i];
    if (typeof pct === "number" && pct > 0) {
      const labelIndex = 4 - i; // levels is d4..d0, D_LABELS is D0..D4
      return `${D_LABELS[labelIndex]} (${pct.toFixed(0)}% of county)`;
    }
  }
  return "None (no drought)";
}

function parseMapDate(mapDate: string): string {
  // e.g. "2026-08-18T00:00:00" — no timezone marker; treat as UTC.
  const withZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(mapDate) ? mapDate : `${mapDate}Z`;
  return new Date(withZone).toISOString();
}

function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<DroughtValue> {
  const fips = COUNTY_FIPS_BY_LOCATION[location];
  return {
    datasetId: "usdm-drought",
    location,
    source: { name: "U.S. Drought Monitor", url: "https://droughtmonitor.unl.edu" },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<DroughtValue>[]> {
      const url = new URL(
        "https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent",
      );
      url.searchParams.set("aoi", fips);
      url.searchParams.set("statisticsType", "1");
      url.searchParams.set("startdate", mdyyyy(ctx.window.since));
      url.searchParams.set("enddate", mdyyyy(ctx.window.until));

      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`U.S. Drought Monitor fetch failed: HTTP ${res.status} from ${url.toString()}`);
      }
      const rows = (await res.json()) as UsdmWeekRow[];

      const observations: Observation<DroughtValue>[] = [];
      for (const row of rows) {
        if (!row.mapDate) continue;
        const observedAt = parseMapDate(row.mapDate);
        observations.push({
          observedAt,
          ingestedAt: new Date().toISOString(),
          key: `${fips}-${row.mapDate}`,
          value: { droughtIndex: reduceToCategory(row) },
        });
      }
      return observations;
    },
  };
}

export const usdmAustin = makeFetcher("austin");
export const usdmSanAntonio = makeFetcher("san-antonio");
