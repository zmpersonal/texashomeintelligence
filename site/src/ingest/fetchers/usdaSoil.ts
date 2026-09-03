import type { FetcherModule, Observation } from "../types";

export interface SoilValue {
  soilType?: string;
  drainageClass?: string;
  shrinkSwellPotential?: "Low" | "Moderate" | "High";
}

/**
 * USDA Soil Data Access (SDA) Tabular service — POST a SQL-like query
 * (SDA's own dialect over SSURGO tables) to
 * https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest, keyless. Uses
 * SDA's documented `SDA_Get_Mukey_from_intersection_with_WktWgs84`
 * helper to resolve the map unit at a representative Austin point, then
 * the dominant component's `compname`/`drainagecl` (both real, verified
 * SSURGO column names). `shrinkSwellPotential` is deliberately left
 * undefined rather than guessed — SDA exposes shrink-swell only via a
 * `cointerp` interpretation-table join whose exact rule name/output
 * shape isn't confirmed from this sandbox (network policy blocks
 * sdmdataaccess.nrcs.usda.gov); fabricating a Low/Moderate/High label
 * from an unconfirmed query would be presenting a guess as a fact about
 * a specific property, which CLAUDE.md rules out. Wire the interp join
 * once the first live run's raw response confirms the real shape.
 *
 * Static data, not a time series — one "observation" per calendar month
 * (a monthly re-check updates in place) until the Dashboard's real
 * address lookup replaces this fixed representative point.
 *
 * Round 4b: one module per metro via `makeFetcher`, same pattern as
 * `airnow.ts`. Both representative points are the `point` already recorded
 * for each area in `src/data/zip-areas.ts`, so the two agree with the rest
 * of the app rather than being separately chosen coordinates.
 */
const SDA_URL = "https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest";

/** Matches `AREA_DEFINITIONS[].point` in `src/data/zip-areas.ts`. */
const REPRESENTATIVE_POINT: Record<"austin" | "san-antonio", { lat: number; lon: number }> = {
  austin: { lat: 30.2672, lon: -97.7431 }, // downtown Austin
  "san-antonio": { lat: 29.4241, lon: -98.4936 }, // downtown San Antonio
};

function queryFor(point: { lat: number; lon: number }): string {
  return `
SELECT TOP 1 mu.muname, c.compname, c.drainagecl
FROM mapunit mu
INNER JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'
WHERE mu.mukey IN (
  SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${point.lon} ${point.lat})')
)
ORDER BY c.comppct_r DESC
`.trim();
}

interface SdaResponse {
  Table?: string[][];
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<SoilValue> {
  const point = REPRESENTATIVE_POINT[location];
  return {
  datasetId: "usda-soil",
  location,
  source: { name: "USDA Soil Data Access", url: "https://sdmdataaccess.nrcs.usda.gov" },
  requiredEnvVars: [],
  async fetchRaw(_ctx): Promise<Observation<SoilValue>[]> {
    const res = await fetch(SDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "JSON+COLUMNNAME", query: queryFor(point) }),
    });
    if (!res.ok) {
      throw new Error(`USDA Soil Data Access query failed: HTTP ${res.status} from ${SDA_URL}`);
    }
    const body = (await res.json()) as SdaResponse;
    const [header, dataRow] = body.Table ?? [];
    if (!header || !dataRow) {
      throw new Error(`USDA Soil Data Access returned no map unit at ${point.lat},${point.lon} (${location})`);
    }
    const col = (name: string) => dataRow[header.indexOf(name)];

    const now = new Date();
    return [
      {
        observedAt: now.toISOString(),
        ingestedAt: now.toISOString(),
        key: monthKey(now),
        value: {
          soilType: col("muname") || col("compname") || undefined,
          drainageClass: col("drainagecl") || undefined,
          // shrinkSwellPotential intentionally omitted — see file header comment.
        },
      },
    ];
  },
  };
}

export const usdaSoilAustin = makeFetcher("austin");
export const usdaSoilSanAntonio = makeFetcher("san-antonio");
