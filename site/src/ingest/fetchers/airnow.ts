import type { FetcherModule, Observation } from "../types";

export interface AirQualityValue {
  aqi?: number;
  category?: "Good" | "Moderate" | "Unhealthy for Sensitive Groups" | "Unhealthy" | "Very Unhealthy" | "Hazardous";
}

/**
 * EPA AirNow current-observation API — https://docs.airnowapi.org.
 * Requires `AIRNOW_API_KEY` (free signup). This is a current-conditions
 * endpoint (not a historical time series), so unlike NOAA/EIA this
 * doesn't backfill `ctx.window` — each run appends (or updates in place,
 * if re-run within the same observed hour) one reading per location,
 * keyed by the API's own DateObserved+HourObserved+ReportingArea. AirNow
 * returns one row per monitored pollutant (O3, PM2.5, ...); we report
 * the worst (highest AQI) of the returned rows, per AQI convention.
 */
const ZIP_BY_LOCATION: Record<"austin" | "san-antonio", string> = {
  austin: "78701",
  "san-antonio": "78205",
};

interface AirNowObservation {
  DateObserved?: string;
  HourObserved?: number;
  ReportingArea?: string;
  ParameterName?: string;
  AQI?: number;
  Category?: { Number?: number; Name?: string };
}

function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<AirQualityValue> {
  return {
    datasetId: "airnow",
    location,
    source: { name: "AirNow", url: "https://www.airnow.gov" },
    requiredEnvVars: ["AIRNOW_API_KEY"],
    async fetchRaw(ctx): Promise<Observation<AirQualityValue>[]> {
      const url = new URL("https://www.airnowapi.org/aq/observation/zipCode/current/");
      url.searchParams.set("format", "application/json");
      url.searchParams.set("zipCode", ZIP_BY_LOCATION[location]);
      url.searchParams.set("distance", "25");
      url.searchParams.set("API_KEY", ctx.env.AIRNOW_API_KEY!);

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`AirNow fetch failed: HTTP ${res.status} from ${url.toString()}`);
      }
      const rows = (await res.json()) as AirNowObservation[];
      if (rows.length === 0) return [];

      const worst = rows.reduce((max, row) => ((row.AQI ?? -1) > (max.AQI ?? -1) ? row : max), rows[0]);
      if (!worst.DateObserved || worst.AQI == null) return [];

      const observedAt = new Date(`${worst.DateObserved}T${String(worst.HourObserved ?? 0).padStart(2, "0")}:00:00.000Z`).toISOString();
      return [
        {
          observedAt,
          ingestedAt: new Date().toISOString(),
          key: `${worst.ReportingArea ?? location}-${worst.DateObserved}-${worst.HourObserved}`,
          value: {
            aqi: worst.AQI,
            category: worst.Category?.Name as AirQualityValue["category"],
          },
        },
      ];
    },
  };
}

export const airnowAustin = makeFetcher("austin");
export const airnowSanAntonio = makeFetcher("san-antonio");
