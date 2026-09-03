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
 *
 * ── WHAT THE COLUMNS ACTUALLY CONTAIN (enumerated live, run #32) ──────
 * Two of them do not carry what their names suggest, and both mattered:
 *
 * `WORK TYPE` -- which `cols.description` below resolves to -- is NOT a
 * description field. It is a construction-status flag: blank on 111,797 of
 * 139,124 rows (80.4%), and otherwise only "New", "Existing" or "Other".
 * That is the whole reason `workDescription` is "" on every San Antonio
 * observation. It is not a mapping bug and there is no better column to
 * point at: this resource has no free-text scope-of-work field at all. It
 * also means the roof filter below is effectively matching on PERMIT TYPE
 * alone for San Antonio, since the other half of its haystack is empty
 * four times out of five.
 *
 * `DECLARED VALUATION` is populated only on COMMERCIAL permit types. It is
 * 97.78% null across the file, and the per-type split is close to binary:
 * 0.00% on every residential and trade type (Mechanical 0/16,395, Re-Roof
 * 0/10,161, Electrical 0/13,977, Foundation Repair 0/5,243) against
 * near-100% on commercial ones (Comm New Building 915/915, Comm Finish Out
 * 258/258). San Antonio requires a declared valuation only on commercial
 * permits. This is a property of the source, not of `parseValuation`, and
 * it is why San Antonio cost figures cannot be anchored on permit
 * valuation the way Austin's can.
 *
 * The package also contains a frozen historical archive resource,
 * "PERMITS ISSUED 2020-2024" (capped at 2024-12-31), whose name also
 * matches a loose "permits issued" pattern — see findPermitsIssuedCsvUrl's
 * freshest-by-last_modified tiebreak below, which is what actually
 * prevents that archive from being picked over the live resource.
 */
const PACKAGE_SHOW_URL = "https://data.sanantonio.gov/api/3/action/package_show?id=building-permits";
const RESOURCE_NAME_MATCH = /permits?\s*issued/i;

interface CkanPackageShowResponse {
  success: boolean;
  result?: {
    resources?: { name?: string; url?: string; format?: string; last_modified?: string; created?: string }[];
  };
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
  // Confirmed against a live run: the "building-permits" package has more
  // than one resource whose name matches /permits?\s*issued/i -- a frozen
  // historical archive ("PERMITS ISSUED 2020-2024", capped at 2024-12-31)
  // alongside the actually-current one ("PERMITS ISSUED", last_modified
  // updated same-week as the query). Picking the first regex match (array
  // order put the archive first) silently fed the archive into every
  // ingestion run instead of the live resource. Disambiguate by
  // last_modified: among every name match, take the most recently
  // modified one (an unset last_modified sorts last, not first).
  const candidates = body.result.resources.filter((r) => r.name && RESOURCE_NAME_MATCH.test(r.name));
  if (candidates.length === 0) {
    const names = body.result.resources.map((r) => r.name).join(", ");
    throw new Error(`San Antonio CKAN: no resource matching "Permits Issued" found among: ${names}`);
  }
  const resource = candidates.reduce((freshest, r) => {
    const freshestTime = freshest.last_modified ? Date.parse(freshest.last_modified) : -Infinity;
    const rTime = r.last_modified ? Date.parse(r.last_modified) : -Infinity;
    return rTime > freshestTime ? r : freshest;
  });
  if (!resource.url) {
    throw new Error(`San Antonio CKAN: matched resource "${resource.name}" has no url`);
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
      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) continue;
      const observedAt = parsedDate.toISOString();
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
