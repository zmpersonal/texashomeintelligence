import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";
import type { PermitValue } from "./austinPermits";

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 *
 * Source: City of San Antonio's open-data portal (data.sanantonio.gov),
 * building/trade permit dataset — confirm current dataset ID and whether
 * it's Socrata or a different platform (San Antonio has used both
 * Socrata and ArcGIS Open Data for different datasets; verify before
 * assuming the same SODA query shape as Austin). Filter to
 * `ctx.window.since..until`, map each row to one Observation<PermitValue>
 * keyed by the permit record's own ID field.
 */
export const sanAntonioPermits: FetcherModule<PermitValue> = {
  datasetId: "municipal-permits",
  location: "san-antonio",
  source: {
    name: "City of San Antonio Permits Open Data",
    url: "https://data.sanantonio.gov/",
  },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<PermitValue>[]> {
    notImplemented("municipal-permits/san-antonio", ctx.window);
  },
};
