import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface PermitValue {
  permitType: string;
  workDescription?: string;
  status: string;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 *
 * Source: City of Austin's Socrata open-data portal — Issued Construction
 * Permits dataset (search data.austintexas.gov for "Issued Construction
 * Permits"; confirm the current dataset ID, they get re-published
 * occasionally). Query via the Socrata SODA API
 * (`https://data.austintexas.gov/resource/{dataset-id}.json`), filtering
 * to mechanical/plumbing/electrical/roofing permit types and
 * `ctx.window.since..until`. `SOCRATA_APP_TOKEN` is optional — without it
 * you're rate-limited to Socrata's anonymous tier, which easily covers
 * one city's worth of daily polling. Map each row to one
 * Observation<PermitValue> keyed by the permit record's own ID field.
 */
export const austinPermits: FetcherModule<PermitValue> = {
  datasetId: "municipal-permits",
  location: "austin",
  source: {
    name: "City of Austin Issued Construction Permits (Socrata)",
    url: "https://data.austintexas.gov/",
  },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<PermitValue>[]> {
    notImplemented("municipal-permits/austin", ctx.window);
  },
};
