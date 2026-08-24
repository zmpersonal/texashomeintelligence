import type { FetcherModule, Observation } from "../types";

export interface PermitValue {
  permitType: string;
  workDescription?: string;
  status: string;
  /** Job valuation in USD, when the source dataset provides one. */
  valuationUsd?: number;
}

/**
 * City of Austin Issued Construction Permits (Socrata SODA API),
 * https://data.austintexas.gov/resource/3syk-w9eu.json — dataset id
 * "3syk-w9eu" ("Issued Construction Permits"), confirm it's still current
 * if this ever 404s (Austin occasionally re-publishes datasets under a
 * new id). Keyless; `SOCRATA_APP_TOKEN` is optional and only raises the
 * anonymous rate limit — sent as `X-App-Token` when present.
 *
 * Filters to roofing-relevant permits via a SoQL `$where` clause matching
 * `work_class`/`permit_type_desc`/`description` against "roof" — field
 * names are Austin's documented Socrata columns for this dataset, but not
 * independently verified against a live response from this sandbox (its
 * network policy blocks data.austintexas.gov); if the first live run
 * comes back with 0 records after the Texas/county-equivalent filter,
 * check these column names first, the same way the NOAA round's window
 * bug was found — not by guessing.
 */
const RESOURCE_URL = "https://data.austintexas.gov/resource/3syk-w9eu.json";
const PAGE_SIZE = 5000;
const MAX_PAGES = 20; // hard stop so a runaway loop can't hang a cron job

function soqlTimestamp(iso: string): string {
  // SoQL floating_timestamp literals have no trailing "Z"/offset.
  return iso.replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
}

interface AustinPermitRow {
  permit_number?: string;
  permit_type_desc?: string;
  work_class?: string;
  description?: string;
  status_current?: string;
  issued_date?: string;
  total_valuation_remodel?: string;
  building_valuation?: string;
  total_job_valuation?: string;
}

function parseValuation(row: AustinPermitRow): number | undefined {
  for (const field of [row.total_job_valuation, row.building_valuation, row.total_valuation_remodel]) {
    const n = field ? parseFloat(field) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function isRoofingRelated(row: AustinPermitRow): boolean {
  const haystack = `${row.work_class ?? ""} ${row.permit_type_desc ?? ""} ${row.description ?? ""}`.toLowerCase();
  return haystack.includes("roof");
}

export const austinPermits: FetcherModule<PermitValue> = {
  datasetId: "municipal-permits",
  location: "austin",
  source: {
    name: "City of Austin Issued Construction Permits (Socrata)",
    url: "https://data.austintexas.gov/",
  },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<PermitValue>[]> {
    const { since, until } = ctx.window;
    const where = `issued_date between '${soqlTimestamp(since)}' and '${soqlTimestamp(until)}' AND (upper(work_class) like '%ROOF%' OR upper(permit_type_desc) like '%ROOF%' OR upper(description) like '%ROOF%')`;

    const headers: Record<string, string> = {};
    if (ctx.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = ctx.env.SOCRATA_APP_TOKEN;

    const observations: Observation<PermitValue>[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(RESOURCE_URL);
      url.searchParams.set("$where", where);
      url.searchParams.set("$order", "issued_date");
      url.searchParams.set("$limit", String(PAGE_SIZE));
      url.searchParams.set("$offset", String(page * PAGE_SIZE));

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`Austin permits fetch failed: HTTP ${res.status} from ${url.toString()}`);
      }
      const rows = (await res.json()) as AustinPermitRow[];
      if (rows.length === 0) break;

      for (const row of rows) {
        if (!isRoofingRelated(row)) continue; // belt-and-suspenders vs. the $where clause
        if (!row.permit_number || !row.issued_date) continue;
        const observedAt = new Date(row.issued_date).toISOString();
        observations.push({
          observedAt,
          ingestedAt: new Date().toISOString(),
          key: row.permit_number,
          value: {
            permitType: row.work_class || row.permit_type_desc || "Roofing",
            workDescription: row.description?.slice(0, 300),
            status: row.status_current || "Unknown",
            valuationUsd: parseValuation(row),
          },
        });
      }
      if (rows.length < PAGE_SIZE) break;
    }
    return observations;
  },
};
