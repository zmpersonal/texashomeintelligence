import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface TdiLossValue {
  lossType: "Wind/Hail" | "Water" | "Fire";
  claimsPaidUsd?: number;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: Texas Department of Insurance county-level closed-claims /
 * paid-losses reporting — published as periodic data calls, not a
 * standing API; check TDI's current data-call publication page for the
 * latest download format before building a fetcher against it.
 */
export const tdiLosses: FetcherModule<TdiLossValue> = {
  datasetId: "tdi-losses",
  location: "austin",
  source: { name: "Texas Department of Insurance", url: "https://www.tdi.texas.gov/" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<TdiLossValue>[]> {
    notImplemented("tdi-losses/austin", ctx.window);
  },
};
