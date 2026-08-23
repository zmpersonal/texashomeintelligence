import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface AirQualityValue {
  aqi?: number;
  category?: "Good" | "Moderate" | "Unhealthy for Sensitive Groups" | "Unhealthy";
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: EPA AirNow API — https://docs.airnowapi.org, requires
 * `AIRNOW_API_KEY` (free signup).
 */
export const airnow: FetcherModule<AirQualityValue> = {
  datasetId: "airnow",
  location: "austin",
  source: { name: "AirNow", url: "https://www.airnow.gov" },
  requiredEnvVars: ["AIRNOW_API_KEY"],
  async fetchRaw(ctx): Promise<Observation<AirQualityValue>[]> {
    notImplemented("airnow/austin", ctx.window);
  },
};
