import type { FetcherModule, Observation } from "../types";

export interface HousingStockValue {
  medianHomeAgeYears?: number;
  ownerOccupiedPct?: number;
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
 * VINTAGE is pinned to a year confidently already released as of this
 * writing rather than computed from "now" — ACS 5-year vintages lag
 * ~1-2 years and bumping this needs a human to confirm the new vintage
 * is actually published before flipping it (a too-new guess 404s and
 * this stays "sample" rather than fabricating anything, but a stale
 * pin just means slightly older housing-stock data, which is fine for
 * an annual series). TODO(owner): bump yearly once the next vintage is out.
 *
 * B25035_001E = median year structure built; B25003_001E/002E = total /
 * owner-occupied housing units (all standard, well-documented ACS
 * detailed-table variable codes).
 */
const VINTAGE = 2023;
const STATE_FIPS = "48";

/** County part of the FIPS in `src/data/zip-areas.ts` — 48453 / 48029. */
const COUNTY_FIPS: Record<"austin" | "san-antonio", { fips: string; label: string }> = {
  austin: { fips: "453", label: "Travis" },
  "san-antonio": { fips: "029", label: "Bexar" },
};

interface AcsResponse extends Array<string[]> {}

function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<HousingStockValue> {
  const county = COUNTY_FIPS[location];
  return {
  datasetId: "census-acs",
  location,
  source: { name: "Census ACS", url: "https://www.census.gov/data/developers/data-sets/acs-5year.html" },
  requiredEnvVars: [],
  async fetchRaw(_ctx): Promise<Observation<HousingStockValue>[]> {
    const url = new URL(`https://api.census.gov/data/${VINTAGE}/acs/acs5`);
    url.searchParams.set("get", "NAME,B25035_001E,B25003_001E,B25003_002E");
    url.searchParams.set("for", `county:${county.fips}`);
    url.searchParams.set("in", `state:${STATE_FIPS}`);
    if (_ctx.env.CENSUS_API_KEY) url.searchParams.set("key", _ctx.env.CENSUS_API_KEY);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Census ACS fetch failed: HTTP ${res.status} from ${url.toString()}`);
    }
    const rows = (await res.json()) as AcsResponse;
    const [header, data] = rows;
    if (!data) {
      throw new Error(`Census ACS returned no data row for state=${STATE_FIPS} county=${county.fips} (${county.label})`);
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

export const censusAcsAustin = makeFetcher("austin");
export const censusAcsSanAntonio = makeFetcher("san-antonio");
