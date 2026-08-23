import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface NwsValue {
  forecastHighF?: number;
  forecastLowF?: number;
  activeAlert?: string;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: NWS API — https://api.weather.gov (keyless; requires a
 * descriptive User-Agent header per NWS's terms of use, not a bearer
 * token). Stub only this phase — see BUILD_PLAN.md Phase 5 for why NWS
 * isn't one of the three deep-backfill feeds yet.
 */
function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<NwsValue> {
  return {
    datasetId: "nws-api",
    location,
    source: { name: "National Weather Service API", url: "https://api.weather.gov" },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<NwsValue>[]> {
      notImplemented(`nws-api/${location}`, ctx.window);
    },
  };
}

export const nwsAustin = makeFetcher("austin");
