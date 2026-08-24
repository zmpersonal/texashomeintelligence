import type { FetcherModule, Observation } from "../types";
import type { PermitValue } from "./austinPermits";
import { parseCsv, rowsToRecords } from "../csv";

/**
 * City of San Antonio open data — CKAN (NOT Socrata), keyless.
 * `package_show?id=building-permits` returns the dataset's resource list;
 * we find the one named "Permits Issued" and download its CSV.
 *
 * The CKAN package id ("building-permits") and the "Permits Issued"
 * resource name are per the task brief; the CSV's actual column headers
 * are not independently verified against a live response from this
 * sandbox (its network policy blocks data.sanantonio.gov). Rather than
 * hardcode a guessed header spelling and risk silently matching nothing
 * (the same class of risk NOAA's CZ_NAME/CZ_FIPS choice was), header
 * resolution below tries several plausible spellings per logical field
 * and picks whichever is actually present — if the first live run comes
 * back empty, log the CSV's real header row first.
 */
const PACKAGE_SHOW_URL = "https://data.sanantonio.gov/api/3/action/package_show?id=building-permits";
const RESOURCE_NAME_MATCH = /permits?\s*issued/i;

interface CkanPackageShowResponse {
  success: boolean;
  result?: { resources?: { name?: string; url?: string; format?: string }[] };
}

async function findPermitsIssuedCsvUrl(): Promise<string> {
  const res = await fetch(PACKAGE_SHOW_URL);
  if (!res.ok) {
    throw new Error(`San Antonio CKAN package_show failed: HTTP ${res.status} from ${PACKAGE_SHOW_URL}`);
  }
  const body = (await res.json()) as CkanPackageShowResponse;
  if (!body.success || !body.result?.resources) {
    throw new Error(`San Antonio CKAN package_show returned no resources for "building-permits"`);
  }
  const resource = body.result.resources.find((r) => r.name && RESOURCE_NAME_MATCH.test(r.name));
  if (!resource?.url) {
    const names = body.result.resources.map((r) => r.name).join(", ");
    throw new Error(`San Antonio CKAN: no resource matching "Permits Issued" found among: ${names}`);
  }
  return resource.url;
}

/** Tries each candidate header spelling (case/whitespace-insensitive) in
 * order, returns the first that's actually a key in this CSV's rows. */
function resolveHeader(sampleRow: Record<string, string>, candidates: string[]): string | null {
  const normalizedKeys = new Map(Object.keys(sampleRow).map((k) => [k.trim().toUpperCase(), k] as const));
  for (const candidate of candidates) {
    const match = normalizedKeys.get(candidate.toUpperCase());
    if (match) return match;
  }
  return null;
}

function parseValuation(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const sanAntonioPermits: FetcherModule<PermitValue> = {
  datasetId: "municipal-permits",
  location: "san-antonio",
  source: {
    name: "City of San Antonio Permits Open Data",
    url: "https://data.sanantonio.gov/",
  },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<PermitValue>[]> {
    const { since, until } = ctx.window;
    const csvUrl = await findPermitsIssuedCsvUrl();
    const res = await fetch(csvUrl);
    if (!res.ok) {
      throw new Error(`San Antonio permits CSV fetch failed: HTTP ${res.status} from ${csvUrl}`);
    }
    const csvText = await res.text();
    const records = rowsToRecords(parseCsv(csvText));
    if (records.length === 0) return [];

    const cols = {
      permitNumber: resolveHeader(records[0], ["PERMIT #", "PERMIT NUMBER", "PERMIT_NUMBER", "PERMITNO", "PERMIT NO"]),
      permitType: resolveHeader(records[0], ["PERMIT TYPE", "PERMIT_TYPE", "PERMITTYPE", "TYPE"]),
      description: resolveHeader(records[0], ["WORK DESCRIPTION", "DESCRIPTION", "WORK_DESCRIPTION", "SCOPE OF WORK"]),
      status: resolveHeader(records[0], ["STATUS", "PERMIT STATUS", "PERMIT_STATUS"]),
      issueDate: resolveHeader(records[0], ["ISSUE DATE", "ISSUED DATE", "ISSUE_DATE", "ISSUED_DATE", "APPROVED DATE"]),
      valuation: resolveHeader(records[0], ["VALUATION", "JOB VALUATION", "ESTIMATED COST", "PROJECT VALUATION"]),
    };
    if (!cols.issueDate) {
      throw new Error(
        `San Antonio permits CSV: couldn't find an issue-date column among headers: ${Object.keys(records[0]).join(", ")}`,
      );
    }

    const observations: Observation<PermitValue>[] = [];
    for (const row of records) {
      const type = cols.permitType ? row[cols.permitType] : "";
      const description = cols.description ? row[cols.description] : "";
      const haystack = `${type} ${description}`.toLowerCase();
      if (!haystack.includes("roof")) continue;

      const rawDate = row[cols.issueDate];
      if (!rawDate) continue;
      const observedAt = new Date(rawDate).toISOString();
      if (Number.isNaN(new Date(observedAt).getTime())) continue;
      if (observedAt < since || observedAt > until) continue;

      const permitNumber = cols.permitNumber ? row[cols.permitNumber] : undefined;
      const key = permitNumber || `${observedAt}-${(cols.description ? row[cols.description] : "").slice(0, 40)}`;

      observations.push({
        observedAt,
        ingestedAt: new Date().toISOString(),
        key,
        value: {
          permitType: type || "Roofing",
          workDescription: description?.slice(0, 300),
          status: (cols.status ? row[cols.status] : "") || "Unknown",
          valuationUsd: parseValuation(cols.valuation ? row[cols.valuation] : undefined),
        },
      });
    }
    return observations;
  },
};
