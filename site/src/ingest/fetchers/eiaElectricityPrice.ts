import type { FetcherModule, Observation } from "../types";

export interface ElectricityPriceValue {
  pricePerKwhCents: number;
}

/**
 * EIA API v2 — Texas residential average retail electricity price,
 * `electricity/retail-sales` route, `stateid=TX` `sectorid=RES`, monthly
 * frequency. Requires `EIA_API_KEY` (free instant signup at
 * https://www.eia.gov/opendata/register.php).
 *
 * `price` in the response is already cents per kWh (EIA's documented
 * unit for this route), matching `pricePerKwhCents` directly. One
 * observation per month, keyed by the `period` string (e.g. "2026-06")
 * so a later revision to a month's figure updates in place.
 */
const BASE_URL = "https://api.eia.gov/v2/electricity/retail-sales/data/";

function monthStr(iso: string): string {
  return iso.slice(0, 7);
}

interface EiaDataRow {
  period?: string;
  price?: number | string;
}
interface EiaResponse {
  response?: { data?: EiaDataRow[]; total?: number };
}

export const eiaElectricityPrice: FetcherModule<ElectricityPriceValue> = {
  datasetId: "eia-electricity",
  location: "texas",
  source: {
    name: "EIA Electricity Data (Texas, residential)",
    url: "https://www.eia.gov/electricity/data.php",
  },
  requiredEnvVars: ["EIA_API_KEY"],
  async fetchRaw(ctx): Promise<Observation<ElectricityPriceValue>[]> {
    const { since, until } = ctx.window;
    const url = new URL(BASE_URL);
    url.searchParams.set("api_key", ctx.env.EIA_API_KEY!);
    url.searchParams.set("frequency", "monthly");
    url.searchParams.append("data[]", "price");
    url.searchParams.append("facets[stateid][]", "TX");
    url.searchParams.append("facets[sectorid][]", "RES");
    url.searchParams.set("start", monthStr(since));
    url.searchParams.set("end", monthStr(until));
    url.searchParams.set("sort[0][column]", "period");
    url.searchParams.set("sort[0][direction]", "asc");
    url.searchParams.set("length", "5000");

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`EIA electricity price fetch failed: HTTP ${res.status} from ${url.toString()}`);
    }
    const body = (await res.json()) as EiaResponse;
    const rows = body.response?.data ?? [];

    const observations: Observation<ElectricityPriceValue>[] = [];
    for (const row of rows) {
      if (!row.period) continue;
      const price = typeof row.price === "string" ? parseFloat(row.price) : row.price;
      if (!Number.isFinite(price)) continue;
      observations.push({
        observedAt: new Date(`${row.period}-01T00:00:00.000Z`).toISOString(),
        ingestedAt: new Date().toISOString(),
        key: row.period,
        value: { pricePerKwhCents: price as number },
      });
    }
    return observations;
  },
};
