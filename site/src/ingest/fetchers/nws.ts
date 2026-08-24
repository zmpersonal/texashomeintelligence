import type { FetcherModule, Observation } from "../types";

export interface NwsValue {
  forecastHighF?: number;
  forecastLowF?: number;
  activeAlert?: string;
}

/**
 * NWS API — https://api.weather.gov, keyless but requires a descriptive
 * User-Agent per NWS's terms of use (a contact, not a secret — safe to
 * commit). Flow: /points/{lat},{lon} -> properties.forecast URL ->
 * forecast periods; /alerts/active?point={lat},{lon} for any active
 * alert. This is a current-conditions feed (forecast, not history), so
 * like AirNow it doesn't backfill `ctx.window` — one observation per
 * run, keyed by the forecast period's own start time.
 */
const USER_AGENT = "TexasHomeIntelligence.com (https://texashomeintelligence.com)";
const COORDS: Record<"austin", { lat: number; lon: number }> = {
  austin: { lat: 30.2672, lon: -97.7431 },
};

interface ForecastPeriod {
  startTime: string;
  isDaytime: boolean;
  temperature: number;
}
interface PointsResponse {
  properties?: { forecast?: string };
}
interface ForecastResponse {
  properties?: { periods?: ForecastPeriod[] };
}
interface AlertsResponse {
  features?: { properties?: { headline?: string; event?: string } }[];
}

async function nwsFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" } });
  if (!res.ok) {
    throw new Error(`NWS fetch failed: HTTP ${res.status} from ${url}`);
  }
  return (await res.json()) as T;
}

function makeFetcher(location: "austin"): FetcherModule<NwsValue> {
  const { lat, lon } = COORDS[location];
  return {
    datasetId: "nws-api",
    location,
    source: { name: "National Weather Service API", url: "https://api.weather.gov" },
    requiredEnvVars: [],
    async fetchRaw(_ctx): Promise<Observation<NwsValue>[]> {
      const points = await nwsFetch<PointsResponse>(`https://api.weather.gov/points/${lat},${lon}`);
      const forecastUrl = points.properties?.forecast;
      if (!forecastUrl) {
        throw new Error(`NWS points response for ${lat},${lon} had no forecast URL`);
      }
      const forecast = await nwsFetch<ForecastResponse>(forecastUrl);
      const periods = forecast.properties?.periods ?? [];
      if (periods.length === 0) {
        throw new Error(`NWS forecast for ${lat},${lon} returned no periods`);
      }

      const daytime = periods.find((p) => p.isDaytime);
      const nighttime = periods.find((p) => !p.isDaytime);

      let activeAlert: string | undefined;
      try {
        const alerts = await nwsFetch<AlertsResponse>(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
        const first = alerts.features?.[0]?.properties;
        activeAlert = first?.headline ?? first?.event;
      } catch {
        // Alerts are a bonus signal, not the reason this fetch exists —
        // a transient failure here shouldn't sink the forecast data.
      }

      return [
        {
          observedAt: new Date(periods[0].startTime).toISOString(),
          ingestedAt: new Date().toISOString(),
          key: periods[0].startTime,
          value: {
            forecastHighF: daytime?.temperature,
            forecastLowF: nighttime?.temperature,
            activeAlert,
          },
        },
      ];
    },
  };
}

export const nwsAustin = makeFetcher("austin");
