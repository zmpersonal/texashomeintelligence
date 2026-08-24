import type { FetcherModule, Observation } from "../types";
import type { PermitValue } from "./austinPermits";
import { parseCsv, rowsToRecords } from "../csv";

/**
 * City of San Antonio open data — CKAN (NOT Socrata), keyless.
 * `package_show?id=building-permits` returns the dataset's resource list;
 * we find the one named "Permits Issued" and download its CSV.
 *
 * The CKAN package id ("building-permits") and the "Permits Issued"
 * resource name are per the task brief. Real header row (confirmed
 * against a live Actions run): PERMIT TYPE, PERMIT #, PROJECT NAME,
 * WORK TYPE, ADDRESS, LOCATION, X_COORD, Y_COORD, DATE SUBMITTED,
 * DATE ISSUED, DECLARED VALUATION, AREA (SF), PRIMARY CONTACT, CD, NCD,
 * HD — no free-text description column, no status column (every row in
 * this resource is issued by definition). Header resolution below still
 * tries several plausible spellings per logical field rather than
 * hardcoding the exact real names, so a future column rename degrades
 * gracefully instead of breaking outright.
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
      // Real CSV (confirmed live) has no free-text description column at
      // all — "WORK TYPE" and "PROJECT NAME" are the closest proxies for
      // scope-of-work text to filter/display.
      description: resolveHeader(records[0], ["WORK TYPE", "PROJECT NAME", "WORK DESCRIPTION", "DESCRIPTION", "WORK_DESCRIPTION", "SCOPE OF WORK"]),
      status: resolveHeader(records[0], ["STATUS", "PERMIT STATUS", "PERMIT_STATUS"]),
      // Real header is "DATE ISSUED" (word order reversed from the
      // original guess "ISSUE DATE"/"ISSUED DATE") — confirmed live.
      issueDate: resolveHeader(records[0], ["DATE ISSUED", "ISSUE DATE", "ISSUED DATE", "ISSUE_DATE", "ISSUED_DATE", "APPROVED DATE", "DATE SUBMITTED"]),
      valuation: resolveHeader(records[0], ["DECLARED VALUATION", "VALUATION", "JOB VALUATION", "ESTIMATED COST", "PROJECT VALUATION"]),
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
          // No status column exists in the real CSV — this resource is
          // specifically "Permits Issued", so every row is issued by definition.
          status: (cols.status ? row[cols.status] : "") || "Issued",
          valuationUsd: parseValuation(cols.valuation ? row[cols.valuation] : undefined),
        },
      });
    }
    return observations;
  },
};
