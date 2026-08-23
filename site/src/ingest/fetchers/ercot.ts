import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface GridConditionValue {
  conditionLabel?: "Normal" | "Conservation Appeal" | "Watch" | "EEA1" | "EEA2" | "EEA3";
  demandMw?: number;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: ERCOT public reports — https://www.ercot.com/gridmktinfo/dashboards,
 * some as downloadable CSV/XML, no documented single REST API; confirm
 * the current data-access method before building.
 */
export const ercot: FetcherModule<GridConditionValue> = {
  datasetId: "ercot",
  location: "texas",
  source: { name: "ERCOT", url: "https://www.ercot.com" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<GridConditionValue>[]> {
    notImplemented("ercot/texas", ctx.window);
  },
};
