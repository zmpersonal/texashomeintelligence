import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface FireDangerValue {
  fireDangerLevel?: "Low" | "Moderate" | "High" | "Very High" | "Extreme";
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: Texas A&M Forest Service current situation / fire danger
 * products — https://tfsweb.tamu.edu/; confirm whether a machine-readable
 * feed exists or this needs to be scraped from a published map/report.
 */
export const txForestService: FetcherModule<FireDangerValue> = {
  datasetId: "tx-forest-service",
  location: "texas",
  source: { name: "Texas A&M Forest Service", url: "https://tfsweb.tamu.edu/" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<FireDangerValue>[]> {
    notImplemented("tx-forest-service/texas", ctx.window);
  },
};
