import type { FetcherModule, Observation } from "../types";
import type { AreaId } from "../../data/zip-areas";
import { locationDef } from "../../data/locations";

export interface HousingStockValue {
  medianHomeAgeYears?: number;
  ownerOccupiedPct?: number;
  /**
   * The geography this row was measured over, carried WITH the number.
   * Round 41b. A county figure and a city figure look identical once they are
   * two decimals in a card, and Round 41a's defect was exactly that — a reading
   * whose grain lived only in copy someone had to remember to keep true. San
   * Marcos city is 30% owner-occupied against Hays County's 64%; nothing about
   * the number itself says which one it is.
   */
  geography?: { grain: "county" | "place"; label: string; fips: string };
}

/**
 * Census Bureau ACS 5-year Detailed Tables API —
 * https://www.census.gov/data/developers/data-sets/acs-5year.html.
 * `CENSUS_API_KEY` is optional (raises the anonymous rate limit).
 * ACS 5-year is an annual release, not a fast-changing feed — one
 * observation per vintage year, keyed by that year, updated in place if
 * re-run within the same year.
 *
 * Round 4b: one module per metro, built by `makeFetcher` on the same
 * pattern as `airnow.ts`, so the two share every line of parsing. County
 * FIPS come from `src/data/zip-areas.ts` (Travis 48453, Bexar 48029) —
 * read out of the repo's own crosswalk rather than typed from memory.
 *
 * VINTAGE is pinned to a year confirmed released rather than computed from
 * "now" — ACS 5-year vintages lag, and a too-new guess 404s.
 *
 * Round 42 measured it instead of guessing. 2024 is served for all six
 * geographies this file reads — Travis, Bexar, Comal and Hays counties, and the
 * New Braunfels and San Marcos places — and 2025 returns 404 everywhere, so it
 * is not out. All three variables below carry an IDENTICAL label, concept,
 * group and predicateType in 2024 and 2023, which is the check that matters: a
 * variable redefined without being renamed would have moved published figures
 * silently.
 *
 * ⚠️ BUMPING THIS DOES NOT CLEAR THE "OUT OF DATE" BADGE, and nothing can.
 * `observedAt` is 1 January of the vintage year, and `dataFreshness.ts` gives
 * `census-acs` a 400-day window; the 2024 vintage is already 1,004 days old by
 * that reckoning on the day it was pinned. ACS 5-year can never satisfy a
 * 400-day window, because the vintage year is the FIRST year of a five-year
 * window and the release follows it by about a year. That is a freshness-rule
 * question, not a vintage one — see docs/audits/round-42-acs-vintage.md.
 *
 * TODO(owner): bump yearly once the next vintage is out. Round 42's probe is
 * the shape to re-run — confirm the vintage is served for ALL SIX geographies,
 * not just the counties, and re-check the three variables before flipping.
 *
 * B25035_001E = median year structure built; B25003_001E/002E = total /
 * owner-occupied housing units (all standard, well-documented ACS
 * detailed-table variable codes).
 */
const VINTAGE = 2024;
const STATE_FIPS = "48";

/** County part of the FIPS in `src/data/zip-areas.ts` — 48453 / 48029. */
const COUNTY_FIPS: Record<AreaId, { fips: string; label: string }> = {
  austin: { fips: "453", label: "Travis" },
  "san-antonio": { fips: "029", label: "Bexar" },
};

/**
 * The geography one file covers. Round 41b.
 *
 * ACS takes `for=county:NNN` and `for=place:NNNNN` through the identical query
 * — same endpoint, same variables, same parsing — so a city is a different
 * ROW of config here, not a different code path. That was the thing this round
 * set out to test, and the answer is that no special case was needed: the two
 * constructors below differ only in which clause they build.
 */
interface AcsGeography {
  /** The `for=` clause, e.g. `county:453` or `place:50820`. */
  forClause: string;
  grain: "county" | "place";
  /** How the reading is labelled — "Travis County", "San Marcos city". */
  label: string;
  fips: string;
}

function countyGeography(area: AreaId): AcsGeography {
  const c = COUNTY_FIPS[area];
  return { forClause: `county:${c.fips}`, grain: "county", label: `${c.label} County`, fips: c.fips };
}

function placeGeography(slug: string): AcsGeography {
  const loc = locationDef(slug);
  return {
    forClause: `place:${loc.censusPlaceFips}`,
    grain: "place",
    label: `${loc.label} city`,
    fips: loc.censusPlaceFips,
  };
}

interface AcsResponse extends Array<string[]> {}

function makeFetcher(location: string, geo: AcsGeography): FetcherModule<HousingStockValue> {
  return {
  datasetId: "census-acs",
  location,
  source: { name: "Census ACS", url: "https://www.census.gov/data/developers/data-sets/acs-5year.html" },
  requiredEnvVars: [],
  async fetchRaw(_ctx): Promise<Observation<HousingStockValue>[]> {
    const url = new URL(`https://api.census.gov/data/${VINTAGE}/acs/acs5`);
    url.searchParams.set("get", "NAME,B25035_001E,B25003_001E,B25003_002E");
    url.searchParams.set("for", geo.forClause);
    url.searchParams.set("in", `state:${STATE_FIPS}`);
    if (_ctx.env.CENSUS_API_KEY) url.searchParams.set("key", _ctx.env.CENSUS_API_KEY);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Census ACS fetch failed: HTTP ${res.status} from ${url.toString()}`);
    }
    const rows = (await res.json()) as AcsResponse;
    const [header, data] = rows;
    if (!data) {
      throw new Error(
        `Census ACS returned no data row for state=${STATE_FIPS} ${geo.forClause} (${geo.label})`,
      );
    }
    const col = (name: string) => data[header.indexOf(name)];

    const yearBuilt = parseFloat(col("B25035_001E"));
    const totalUnits = parseFloat(col("B25003_001E"));
    const ownerUnits = parseFloat(col("B25003_002E"));

    const value: HousingStockValue = {
      medianHomeAgeYears: Number.isFinite(yearBuilt) ? new Date().getUTCFullYear() - yearBuilt : undefined,
      ownerOccupiedPct:
        Number.isFinite(totalUnits) && totalUnits > 0 && Number.isFinite(ownerUnits)
          ? Math.round((ownerUnits / totalUnits) * 1000) / 10
          : undefined,
      geography: { grain: geo.grain, label: geo.label, fips: geo.fips },
    };

    return [
      {
        observedAt: new Date(Date.UTC(VINTAGE, 0, 1)).toISOString(),
        ingestedAt: new Date().toISOString(),
        key: `acs5-${VINTAGE}`,
        value,
      },
    ];
  },
  };
}

export const censusAcsAustin = makeFetcher("austin", countyGeography("austin"));
export const censusAcsSanAntonio = makeFetcher("san-antonio", countyGeography("san-antonio"));

/**
 * City grain. Round 41c measured that these are genuinely different figures and
 * not relabelled county ones — San Marcos city is 30% owner-occupied against
 * Hays County's 64%, because it is a university town and the county is not.
 * Publishing the county number under the city's name would have been wrong by
 * more than a rounding.
 */
export const censusAcsNewBraunfels = makeFetcher(
  "new-braunfels",
  placeGeography("new-braunfels"),
);
export const censusAcsSanMarcos = makeFetcher("san-marcos", placeGeography("san-marcos"));
