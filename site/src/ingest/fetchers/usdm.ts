import { ingestCounties } from "../../data/zip-areas";
import type { FetcherModule, Observation } from "../types";

export interface DroughtValue {
  /** e.g. "D2 — Severe Drought" or "None (no drought)". */
  droughtIndex?: string;
  rainfallInches?: number;
  /** County this week's reading is for, as the USDM API reports it — not as we
   * guessed it. Rows written before county ingestion began have no `county`;
   * their FIPS is still recoverable from `key`, which is `<fips>-<mapDate>`. */
  county?: string;
  countyFips?: string;
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
 *
 * Counties come from `src/data/zip-areas.ts` (via `ingestCounties`) so the set
 * we ingest and the set the dashboard publishes cannot drift apart. Austin
 * pulls Travis, Williamson and Hays; San Antonio pulls Bexar, Comal and
 * Guadalupe. That is 6 keyless requests per run at a 2-3x/week cadence, which
 * is what COST.md's cheap-and-boring rule asks for - no new source, no key,
 * no new service. Each county is a separate request because the API takes one
 * `aoi` at a time.
 */

const D_LABELS = ["D0 — Abnormally Dry", "D1 — Moderate Drought", "D2 — Severe Drought", "D3 — Extreme Drought", "D4 — Exceptional Drought"];

function mdyyyy(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

interface UsdmWeekRow {
  mapDate?: string;
  county?: string;
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
  return {
    datasetId: "usdm-drought",
    location,
    source: { name: "U.S. Drought Monitor", url: "https://droughtmonitor.unl.edu" },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<DroughtValue>[]> {
      const counties = ingestCounties(location);
      if (counties.length === 0) {
        throw new Error(`No ingest counties configured for ${location} in src/data/zip-areas.ts`);
      }

      const observations: Observation<DroughtValue>[] = [];
      for (const county of counties) {
        const url = new URL(
          "https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent",
        );
        url.searchParams.set("aoi", county.fips);
        url.searchParams.set("statisticsType", "1");
        url.searchParams.set("startdate", mdyyyy(ctx.window.since));
        url.searchParams.set("enddate", mdyyyy(ctx.window.until));

        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) {
          throw new Error(
            `U.S. Drought Monitor fetch failed for ${county.name} (${county.fips}): HTTP ${res.status}`,
          );
        }
        const rows = (await res.json()) as UsdmWeekRow[];

        for (const row of rows) {
          if (!row.mapDate) continue;
          // The API echoes the county name for the FIPS we asked for. Comparing
          // it to the configured name turns a mistyped FIPS into a loud
          // ingestion failure instead of a whole county series quietly filed
          // under the wrong place. The FIPS codes in zip-areas.ts were written
          // from memory; this is what makes that safe.
          if (row.county && row.county.replace(/\s+County$/i, "").trim() !== county.name) {
            throw new Error(
              `U.S. Drought Monitor returned county "${row.county}" for FIPS ${county.fips}, ` +
                `but src/data/zip-areas.ts calls it "${county.name}". Fix the FIPS or the name.`,
            );
          }
          observations.push({
            observedAt: parseMapDate(row.mapDate),
            ingestedAt: new Date().toISOString(),
            // Unchanged key shape, so the existing single-county history for
            // Travis and Bexar updates in place rather than duplicating.
            key: `${county.fips}-${row.mapDate}`,
            value: {
              droughtIndex: reduceToCategory(row),
              county: county.name,
              countyFips: county.fips,
            },
          });
        }
      }
      return observations;
    },
  };
}

export const usdmAustin = makeFetcher("austin");
export const usdmSanAntonio = makeFetcher("san-antonio");
