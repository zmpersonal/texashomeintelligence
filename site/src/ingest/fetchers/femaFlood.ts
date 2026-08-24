import type { FetcherModule, Observation } from "../types";

export interface FloodZoneValue {
  floodZone: string;
  note?: string;
}

/**
 * FEMA National Flood Hazard Layer (NFHL) — keyless ArcGIS REST,
 * https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer.
 * Layer 28 ("Flood Hazard Zones") is queried by point-in-polygon
 * intersection at a representative Austin coordinate (not verified
 * against a live response from this sandbox, which blocks
 * hazards.fema.gov — if layer 28 turns out not to be Flood Hazard Zones
 * on this MapServer instance, list the service's layers first rather
 * than guess another number).
 *
 * This is address/parcel-level, static data, not a time series — one
 * "observation" per calendar month (so a monthly re-check updates in
 * place rather than duplicating identical rows) until the Dashboard's
 * real address lookup replaces this fixed representative point.
 */
const LAYER_URL = "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query";
const REPRESENTATIVE_POINT = { lat: 30.2672, lon: -97.7431 }; // downtown Austin

interface ArcGisFeature {
  attributes?: { FLD_ZONE?: string; ZONE_SUBTY?: string };
}
interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export const femaFlood: FetcherModule<FloodZoneValue> = {
  datasetId: "fema-nfhl",
  location: "austin",
  source: { name: "FEMA National Flood Hazard Layer", url: "https://hazards.fema.gov/gis/nfhl/" },
  requiredEnvVars: [],
  async fetchRaw(_ctx): Promise<Observation<FloodZoneValue>[]> {
    const url = new URL(LAYER_URL);
    url.searchParams.set("geometry", `${REPRESENTATIVE_POINT.lon},${REPRESENTATIVE_POINT.lat}`);
    url.searchParams.set("geometryType", "esriGeometryPoint");
    url.searchParams.set("inSR", "4326");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set("outFields", "FLD_ZONE,ZONE_SUBTY");
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("f", "json");

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`FEMA NFHL query failed: HTTP ${res.status} from ${url.toString()}`);
    }
    const body = (await res.json()) as ArcGisQueryResponse;
    const feature = body.features?.[0];

    const now = new Date();
    const value: FloodZoneValue = feature?.attributes?.FLD_ZONE
      ? {
          floodZone: feature.attributes.FLD_ZONE,
          note: feature.attributes.ZONE_SUBTY || undefined,
        }
      : {
          floodZone: "X (unshaded)",
          note: "No mapped special flood hazard zone returned at this point — FEMA's default outside a mapped hazard area.",
        };

    return [
      {
        observedAt: now.toISOString(),
        ingestedAt: now.toISOString(),
        key: monthKey(now),
        value,
      },
    ];
  },
};
