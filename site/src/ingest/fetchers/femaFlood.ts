import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface FloodZoneValue {
  floodZone: string;
  note?: string;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: FEMA National Flood Hazard Layer (NFHL) — keyless ArcGIS REST
 * services, https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer.
 * This is address/parcel-level, not a time series — the "observation"
 * here is closer to a periodic re-check than a stream of events; plan
 * the real fetcher's `key` scheme (e.g. county + revision date) before
 * implementing.
 */
export const femaFlood: FetcherModule<FloodZoneValue> = {
  datasetId: "fema-nfhl",
  location: "austin",
  source: { name: "FEMA National Flood Hazard Layer", url: "https://hazards.fema.gov/gis/nfhl/" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<FloodZoneValue>[]> {
    notImplemented("fema-nfhl/austin", ctx.window);
  },
};
