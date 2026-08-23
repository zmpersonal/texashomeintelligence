import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface StormEventValue {
  eventType: "Hail" | "Wind" | "Tornado" | "Flood";
  magnitude: string;
  county: string;
  narrative?: string;
}

const COUNTY_BY_LOCATION: Record<string, string> = {
  austin: "Travis County",
  "san-antonio": "Bexar County",
};

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 *
 * Source: NOAA NCEI Storm Events Database — https://www.ncdc.noaa.gov/stormevents/
 * Bulk CSV files (StormEvents_details-ftp_v1.0_dYYYY_*.csv.gz) are public
 * and keyless; there's also a REST-ish search UI at
 * https://www.ncdc.noaa.gov/stormevents/choosedates.jsp — confirm current
 * access method before building against either, NOAA has changed formats
 * before. Filter to `ctx.window.since..until` and the county for this
 * fetcher's `location` (see COUNTY_BY_LOCATION above). Map each row to
 * one Observation<StormEventValue> keyed by NOAA's own event ID (stable
 * across re-ingestion, so a corrected magnitude updates in place instead
 * of duplicating).
 */
function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<StormEventValue> {
  return {
    datasetId: "noaa-storm-events",
    location,
    source: {
      name: "NOAA Storm Events Database",
      url: "https://www.ncdc.noaa.gov/stormevents/",
    },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<StormEventValue>[]> {
      // county in scope for this call: COUNTY_BY_LOCATION[location] — pass
      // it to the real NOAA query once implemented.
      notImplemented(`noaa-storm-events/${location} (${COUNTY_BY_LOCATION[location]})`, ctx.window);
    },
  };
}

export const noaaStormEventsAustin = makeFetcher("austin");
export const noaaStormEventsSanAntonio = makeFetcher("san-antonio");
