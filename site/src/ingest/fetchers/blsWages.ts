import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface TradeWageValue {
  trade: string;
  medianHourlyWageUsd?: number;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: BLS Occupational Employment and Wage Statistics (OEWS) API —
 * https://www.bls.gov/developers/, `BLS_API_KEY` optional (raises the
 * daily request limit).
 */
export const blsWages: FetcherModule<TradeWageValue> = {
  datasetId: "bls",
  location: "austin",
  source: { name: "BLS Occupational Employment and Wage Statistics", url: "https://www.bls.gov/oes/" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<TradeWageValue>[]> {
    notImplemented("bls/austin", ctx.window);
  },
};
