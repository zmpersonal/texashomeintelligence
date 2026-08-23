import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface HousingStockValue {
  medianHomeAgeYears?: number;
  ownerOccupiedPct?: number;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: Census Bureau American Community Survey (ACS) API —
 * https://www.census.gov/data/developers/data-sets/acs-5year.html.
 * `CENSUS_API_KEY` is optional (raises the anonymous rate limit); ACS is
 * annual, not a fast-changing feed, so this is closer to an occasional
 * re-check than a stream.
 */
export const censusAcs: FetcherModule<HousingStockValue> = {
  datasetId: "census-acs",
  location: "austin",
  source: { name: "Census ACS", url: "https://www.census.gov/data/developers/data-sets/acs-5year.html" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<HousingStockValue>[]> {
    notImplemented("census-acs/austin", ctx.window);
  },
};
