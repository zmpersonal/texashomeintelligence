import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface DroughtValue {
  droughtIndex?: string;
  rainfallInches?: number;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: Texas Water Development Board / TexMesonet —
 * https://www.texmesonet.org (station observations) and TWDB's drought
 * reporting; confirm which endpoint is actually keyless/public before
 * building.
 */
export const twdbDrought: FetcherModule<DroughtValue> = {
  datasetId: "twdb-texmesonet",
  location: "austin",
  source: { name: "TWDB / TexMesonet", url: "https://www.texmesonet.org" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<DroughtValue>[]> {
    notImplemented("twdb-texmesonet/austin", ctx.window);
  },
};
