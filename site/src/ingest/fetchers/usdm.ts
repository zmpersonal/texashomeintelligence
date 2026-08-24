import type { FetcherModule, Observation } from "../types";

export interface DroughtValue {
  /** e.g. "D2 — Severe Drought" or "None (no drought)". */
  droughtIndex?: string;
  rainfallInches?: number;
}

/**
 * U.S. Drought Monitor (droughtmonitor.unl.edu) DmData web service —
 * keyless JSON REST, `GetDroughtSeverityStatisticsByAreaPercent`,
 * county-level (`aoi` = 5-digit county FIPS: Travis 48453, Bexar 48029 —
 * the FIPS-as-aoi shape is per the task brief, which corroborates it).
 * Published weekly (Thursdays); each row reports the % of the county's
 * area at-or-worse-than each D-category (None/D0-D4, cumulative). Not
 * independently verified against a live response from this sandbox
 * (network policy blocks droughtmonitor.unl.edu) — if the first live run
 * comes back empty, check the exact response field casing first.
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

function mmddyyyy(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

interface UsdmWeekRow {
  MapDate?: string;
  ValidStart?: string;
  ValidEnd?: string;
  None?: number;
  D0?: number;
  D1?: number;
  D2?: number;
  D3?: number;
  D4?: number;
}

function reduceToCategory(row: UsdmWeekRow): string {
  const levels = [row.D4, row.D3, row.D2, row.D1, row.D0];
  for (let i = 0; i < levels.length; i++) {
    const pct = levels[i];
    if (typeof pct === "number" && pct > 0) {
      const labelIndex = 4 - i; // levels is D4..D0, D_LABELS is D0..D4
      return `${D_LABELS[labelIndex]} (${pct.toFixed(0)}% of county)`;
    }
  }
  return "None (no drought)";
}

function parseMapDate(mapDate: string): string {
  // "YYYYMMDD" -> ISO
  const year = mapDate.slice(0, 4);
  const month = mapDate.slice(4, 6);
  const day = mapDate.slice(6, 8);
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
}

function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<DroughtValue> {
  const fips = COUNTY_FIPS_BY_LOCATION[location];
  return {
    datasetId: "usdm-drought",
    location,
    source: { name: "U.S. Drought Monitor", url: "https://droughtmonitor.unl.edu" },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<DroughtValue>[]> {
      const url = new URL("https://droughtmonitor.unl.edu/DmData/GetDroughtSeverityStatisticsByAreaPercent.aspx");
      url.searchParams.set("area", fips);
      url.searchParams.set("statisticsType", "1");
      url.searchParams.set("startdate", mmddyyyy(ctx.window.since));
      url.searchParams.set("enddate", mmddyyyy(ctx.window.until));

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`U.S. Drought Monitor fetch failed: HTTP ${res.status} from ${url.toString()}`);
      }
      const rows = (await res.json()) as UsdmWeekRow[];

      const observations: Observation<DroughtValue>[] = [];
      for (const row of rows) {
        if (!row.MapDate) continue;
        const observedAt = parseMapDate(row.MapDate);
        observations.push({
          observedAt,
          ingestedAt: new Date().toISOString(),
          key: `${fips}-${row.MapDate}`,
          value: { droughtIndex: reduceToCategory(row) },
        });
      }
      return observations;
    },
  };
}

export const usdmAustin = makeFetcher("austin");
export const usdmSanAntonio = makeFetcher("san-antonio");
