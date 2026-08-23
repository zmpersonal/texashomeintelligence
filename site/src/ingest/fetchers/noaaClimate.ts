import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface ClimateNormalValue {
  normalHighF?: number;
  normalLowF?: number;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: NOAA Climate Data Online (CDO) API — https://www.ncdc.noaa.gov/cdo-web/webservices/v2,
 * requires a free token (`NOAA_CDO_TOKEN`, not yet requested as an env
 * var since this feed is stub-only this phase).
 */
export const noaaClimate: FetcherModule<ClimateNormalValue> = {
  datasetId: "noaa-climate",
  location: "austin",
  source: { name: "NOAA Climate Data Online", url: "https://www.ncdc.noaa.gov/cdo-web/" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<ClimateNormalValue>[]> {
    notImplemented("noaa-climate/austin", ctx.window);
  },
};
