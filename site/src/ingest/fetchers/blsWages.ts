import type { FetcherModule, Observation } from "../types";

export interface TradeWageValue {
  trade: string;
  medianHourlyWageUsd?: number;
}

/**
 * BLS Occupational Employment and Wage Statistics (OEWS) via the public
 * Time Series API — https://www.bls.gov/developers/. `BLS_API_KEY`
 * (`registrationkey`) is optional: BLS's v2 endpoint accepts unregistered
 * requests too, just under v1-era limits (25 queries/day/IP, fewer years
 * of history). We always hit the v2 path and only append
 * `registrationkey` when present.
 *
 * SERIES_ID is an OEWS series id assembled from its documented parts —
 * survey "OEU", area type "M" (metropolitan), area code = Austin-Round
 * Rock-Georgetown TX MSA CBSA 12420 (zero-padded to 7 digits), industry
 * "000000" (cross-industry), SOC occupation 47-2152 (Plumbers,
 * Pipefitters, and Steamfitters) as "472152", data type "08" (hourly
 * median wage) => "OEUM001242000000047215208". This is a best-effort
 * construction from documented OEWS series-id conventions, NOT verified
 * against a live BLS response from this sandbox (its network policy
 * blocks api.bls.gov) — this is the single highest-uncertainty fetcher
 * in this batch. If the first live run's `status` isn't
 * "REQUEST_SUCCEEDED" or the series comes back with no data points,
 * that's the first thing to check (BLS's series-id lookup tool at
 * https://data.bls.gov/PDQWeb/oe confirms the real id) — don't just
 * retry, and don't ship a differently-guessed id without that check.
 */
const SERIES_ID = "OEUM001242000000047215208";
const TRADE_LABEL = "Plumbers, Pipefitters, and Steamfitters (Austin-Round Rock-Georgetown MSA)";

interface BlsSeriesDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
}
interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: { series?: { seriesID: string; data?: BlsSeriesDataPoint[] }[] };
}

export const blsWages: FetcherModule<TradeWageValue> = {
  datasetId: "bls",
  location: "austin",
  source: { name: "BLS Occupational Employment and Wage Statistics", url: "https://www.bls.gov/oes/" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<TradeWageValue>[]> {
    const startYear = new Date(ctx.window.since).getUTCFullYear();
    const endYear = new Date(ctx.window.until).getUTCFullYear();

    const url = new URL(`https://api.bls.gov/publicAPI/v2/timeseries/data/${SERIES_ID}`);
    url.searchParams.set("startyear", String(startYear));
    url.searchParams.set("endyear", String(endYear));
    if (ctx.env.BLS_API_KEY) url.searchParams.set("registrationkey", ctx.env.BLS_API_KEY);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`BLS OEWS fetch failed: HTTP ${res.status} from ${url.toString()}`);
    }
    const body = (await res.json()) as BlsResponse;
    if (body.status !== "REQUEST_SUCCEEDED") {
      throw new Error(`BLS OEWS request not successful: status=${body.status} message=${(body.message ?? []).join("; ")}`);
    }
    const series = body.Results?.series?.find((s) => s.seriesID === SERIES_ID);
    const points = series?.data ?? [];
    if (points.length === 0) {
      throw new Error(`BLS OEWS series ${SERIES_ID} returned no data points for ${startYear}-${endYear}`);
    }

    const observations: Observation<TradeWageValue>[] = [];
    for (const point of points) {
      const wage = parseFloat(point.value);
      if (!Number.isFinite(wage)) continue;
      // OEWS is an annual series; represent each year as its own
      // observation dated to that year's reference period.
      observations.push({
        observedAt: new Date(Date.UTC(Number(point.year), 0, 1)).toISOString(),
        ingestedAt: new Date().toISOString(),
        key: `${SERIES_ID}-${point.year}`,
        value: { trade: TRADE_LABEL, medianHourlyWageUsd: wage },
      });
    }
    return observations;
  },
};
