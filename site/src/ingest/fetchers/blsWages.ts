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
 * A series id is assembled from its documented OEWS parts — survey "OEU",
 * area type "M" (metropolitan), a 7-digit zero-padded CBSA code, industry
 * "000000" (cross-industry), SOC occupation 47-2152 (Plumbers,
 * Pipefitters, and Steamfitters) as "472152", and data type "08" (hourly
 * median wage).
 *
 * ⚠️ BOTH IDS ARE UNVERIFIED CONSTRUCTIONS, NOT CONFIRMED RESPONSES. This
 * sandbox's network policy blocks api.bls.gov (403 to CONNECT), so neither
 * id has ever been round-tripped against a live BLS response. This remains
 * the highest-uncertainty fetcher in the set. If a first live run's
 * `status` isn't "REQUEST_SUCCEEDED", or a series returns no data points,
 * check the id before anything else — BLS's own lookup tool at
 * https://data.bls.gov/PDQWeb/oe confirms the real one. Don't just retry,
 * and don't ship a differently-guessed id without that check.
 *
 * Round 4b, and worth stating precisely: Austin's CBSA (12420) was already
 * here and carries the same caveat. San Antonio's CBSA — 41700, San
 * Antonio-New Braunfels TX — is the one value in this round that could NOT
 * be sourced from anything in this repository. Every other new constant
 * (Bexar FIPS 48029, the San Antonio representative point) was read out of
 * `src/data/zip-areas.ts`. This one is from the published CBSA
 * definitions, and it is the single most likely thing to be wrong here.
 * Verify it on the first live run.
 */

/** CBSA code per metro, zero-padded to 7 digits inside the series id. */
const CBSA: Record<"austin" | "san-antonio", { code: string; label: string }> = {
  austin: { code: "0012420", label: "Austin-Round Rock-Georgetown MSA" },
  "san-antonio": { code: "0041700", label: "San Antonio-New Braunfels MSA" },
};

const SOC_PLUMBERS = "472152";
const DATA_TYPE_MEDIAN_HOURLY = "08";

function seriesIdFor(location: "austin" | "san-antonio"): string {
  return `OEUM${CBSA[location].code}000000${SOC_PLUMBERS}${DATA_TYPE_MEDIAN_HOURLY}`;
}

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

function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<TradeWageValue> {
  const SERIES_ID = seriesIdFor(location);
  const TRADE_LABEL = `Plumbers, Pipefitters, and Steamfitters (${CBSA[location].label})`;
  return {
  datasetId: "bls",
  location,
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
}

export const blsWagesAustin = makeFetcher("austin");
export const blsWagesSanAntonio = makeFetcher("san-antonio");
