import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface SoilValue {
  soilType?: string;
  drainageClass?: string;
  shrinkSwellPotential?: "Low" | "Moderate" | "High";
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 * Source: USDA Soil Data Access (SDA) — https://sdmdataaccess.nrcs.usda.gov,
 * a SOAP/REST-ish query service over SSURGO soil survey data. Keyless.
 * Relevant here mainly for shrink-swell potential (foundation context).
 */
export const usdaSoil: FetcherModule<SoilValue> = {
  datasetId: "usda-soil",
  location: "austin",
  source: { name: "USDA Soil Data Access", url: "https://sdmdataaccess.nrcs.usda.gov" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<SoilValue>[]> {
    notImplemented("usda-soil/austin", ctx.window);
  },
};
