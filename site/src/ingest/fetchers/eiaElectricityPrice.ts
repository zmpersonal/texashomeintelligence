import type { FetcherModule, Observation } from "../types";
import { notImplemented } from "../notImplemented";

export interface ElectricityPriceValue {
  pricePerKwhCents: number;
}

/**
 * TODO(HANDOFF.md Seam 1): implement the real fetch.
 *
 * Source: EIA API v2, Texas residential average retail electricity price
 * — series under `electricity/retail-sales`, filtered to
 * `stateid=TX`, `sectorid=RES`. Requires `EIA_API_KEY` (free, instant
 * signup at https://www.eia.gov/opendata/register.php). One observation
 * per month; key by the month string (e.g. "2026-06") so a later
 * revision to a month's figure updates in place rather than duplicating.
 */
export const eiaElectricityPrice: FetcherModule<ElectricityPriceValue> = {
  datasetId: "eia-electricity",
  location: "texas",
  source: {
    name: "EIA Electricity Data (Texas, residential)",
    url: "https://www.eia.gov/electricity/data.php",
  },
  requiredEnvVars: ["EIA_API_KEY"],
  async fetchRaw(ctx): Promise<Observation<ElectricityPriceValue>[]> {
    notImplemented("eia-electricity/texas", ctx.window);
  },
};
