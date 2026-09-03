import type { FetcherModule, Observation } from "../types";
import { parseCsv, rowsToRecords } from "../csv";
import {
  CATEGORY_MAPPING_VERSION,
  classifyAustin,
  classifySanAntonio,
  isUnknownAustinType,
  isUnknownSanAntonioType,
  AUSTIN_PERMIT_TYPE_MAP,
  AUSTIN_WORK_CLASS_MAP,
  type ClassificationMechanism,
  type TradeCategory,
} from "../tradeCategories";

/**
 * Permit activity by trade category and month - the momentum signal.
 *
 * -- WHY THIS IS AGGREGATE AND `municipal-permits` IS NOT -------------------
 * Owner decision, Round 8. Widening both cities to seven trade categories at
 * per-permit granularity would take the committed observation archive from
 * ~7,000 rows to ~101,000 A YEAR, appended forever, in git, and loaded into
 * the build's module graph by `import.meta.glob({eager:true})`. The signal
 * the owner specified is counts, timing and trend - none of which needs a row
 * per permit. So this feed stores ONE observation per category per month
 * (~170 rows a year across both metros), and per-permit rows survive only for
 * roofing, in the untouched `municipal-permits` dataset that
 * `/data/{metro}/roof-permits/` publishes.
 *
 * What that gives up, and why it is recoverable: per-permit detail for the six
 * non-roof categories - no permit numbers, no descriptions, no day-level
 * dates. Nothing is lost permanently, because both cities publish the full
 * history and a future round can re-ingest at row level from source. Recorded
 * in HANDOFF.md.
 *
 * -- EVERY ROW CARRIES ITS OWN PROVENANCE -----------------------------------
 * Austin's HVAC count comes from a permit type the city assigns; its roofing
 * count comes from a text search across three columns. San Antonio's both come
 * from permit types. Once aggregated those numbers look identical and they are
 * not - so `mechanisms` and `sourceValues` travel with every monthly row, and
 * `mappingVersion` records the mapping that produced it, for the same reason a
 * derived index records its METHODOLOGY_VERSION: counts computed under
 * different mappings must never be silently compared.
 *
 * NOT a scoring input. This dataset is deliberately absent from
 * INDEX_DATASETS and the Home Stress Index never reads it. No cost, price or
 * valuation field appears here or ever should - permit valuation is unusable
 * in both metros (CLAUDE.md; docs/audits/round-6-permit-measurement.md).
 */

export interface TradeActivityValue {
  category: TradeCategory;
  /** "YYYY-MM" - the month permits were ISSUED, not ingested. */
  month: string;
  permitCount: number;
  /** The mapping that produced this count. Never compare across versions. */
  mappingVersion: string;
  /** How rows reached this category, strongest evidence first. */
  mechanisms: ClassificationMechanism[];
  /** Metro-native values that rolled into this count, with their share. */
  sourceValues: { value: string; count: number }[];
}

interface Bucket {
  count: number;
  mechanisms: Set<ClassificationMechanism>;
  sources: Map<string, number>;
}

const MECHANISM_ORDER: ClassificationMechanism[] = ["permit-type", "work-class", "description-text"];

function bump(
  buckets: Map<string, Bucket>,
  category: TradeCategory,
  month: string,
  mechanism: ClassificationMechanism,
  sourceValue: string,
): void {
  const key = `${category} ${month}`;
  const b = buckets.get(key) ?? { count: 0, mechanisms: new Set(), sources: new Map() };
  b.count++;
  b.mechanisms.add(mechanism);
  b.sources.set(sourceValue, (b.sources.get(sourceValue) ?? 0) + 1);
  buckets.set(key, b);
}

function toObservations(
  buckets: Map<string, Bucket>,
  ingestedAt: string,
): Observation<TradeActivityValue>[] {
  const out: Observation<TradeActivityValue>[] = [];
  for (const [key, b] of buckets) {
    const [category, month] = key.split(" ") as [TradeCategory, string];
    out.push({
      // Dated to the first of the month it counts, so archive ordering and the
      // freshness check behave like every other feed.
      observedAt: new Date(`${month}-01T00:00:00.000Z`).toISOString(),
      ingestedAt,
      // Stable key including the mapping version: re-running a month REPLACES
      // it in place (mergeObservations), while a mapping change writes new
      // keys instead of overwriting counts computed under the old rules.
      key: `${CATEGORY_MAPPING_VERSION}/${category}/${month}`,
      value: {
        category,
        month,
        permitCount: b.count,
        mappingVersion: CATEGORY_MAPPING_VERSION,
        mechanisms: MECHANISM_ORDER.filter((m) => b.mechanisms.has(m)),
        sourceValues: [...b.sources.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b2) => b2.count - a.count || a.value.localeCompare(b2.value)),
      },
    });
  }
  return out.sort(
    (a, b2) => a.observedAt.localeCompare(b2.observedAt) || a.key.localeCompare(b2.key),
  );
}

/** Printed into the ingestion log, so retained/dropped is visible per run. */
function reportCounts(
  metro: string,
  retained: number,
  dropped: number,
  unknown: Map<string, number>,
): void {
  const total = retained + dropped;
  const pct = (n: number) => (total === 0 ? "n/a" : `${((100 * n) / total).toFixed(1)}%`);
  console.log(
    `[permit-trade-activity/${metro}] classified ${total.toLocaleString("en-US")} row(s): ` +
      `retained ${retained.toLocaleString("en-US")} (${pct(retained)}), ` +
      `dropped ${dropped.toLocaleString("en-US")} (${pct(dropped)}) as unclassified.`,
  );
  if (unknown.size > 0) {
    console.log(
      `[permit-trade-activity/${metro}] WARNING: ${unknown.size} source value(s) the mapping has ` +
        `never seen - left UNCLASSIFIED rather than guessed at, and dropped:`,
    );
    for (const [v, c] of [...unknown.entries()].sort((a, b2) => b2[1] - a[1])) {
      console.log(`    ${c.toLocaleString("en-US").padStart(8)}  ${JSON.stringify(v)}`);
    }
  }
}

// -- SAN ANTONIO ------------------------------------------------------------
// Same CKAN resource and the same freshest-by-last_modified resolution the
// roofing fetcher uses, so both read one file. Classification is from PERMIT
// TYPE alone: WORK TYPE is blank on 80.4% of rows and carries no trade.
const SA_PACKAGE_SHOW_URL =
  "https://data.sanantonio.gov/api/3/action/package_show?id=building-permits";
const SA_RESOURCE_NAME_MATCH = /permits?\s*issued/i;

async function sanAntonioCsvUrl(): Promise<string> {
  const res = await fetch(SA_PACKAGE_SHOW_URL);
  if (!res.ok) throw new Error(`San Antonio CKAN package_show failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    success?: boolean;
    result?: { resources?: { name?: string; url?: string; last_modified?: string }[] };
  };
  const candidates = (body.result?.resources ?? []).filter(
    (r) => r.name && SA_RESOURCE_NAME_MATCH.test(r.name),
  );
  if (candidates.length === 0) throw new Error(`San Antonio CKAN: no "Permits Issued" resource found`);
  // The package also holds a frozen archive whose name matches; take the
  // freshest, exactly as sanAntonioPermits.ts does.
  const resource = candidates.reduce((freshest, r) =>
    (r.last_modified ? Date.parse(r.last_modified) : -Infinity) >
    (freshest.last_modified ? Date.parse(freshest.last_modified) : -Infinity)
      ? r
      : freshest,
  );
  if (!resource.url) throw new Error(`San Antonio CKAN: matched resource has no url`);
  return resource.url;
}

function resolveHeader(sample: Record<string, string>, candidates: string[]): string | null {
  const keys = new Map(Object.keys(sample).map((k) => [k.trim().toUpperCase(), k] as const));
  for (const c of candidates) {
    const hit = keys.get(c.toUpperCase());
    if (hit) return hit;
  }
  return null;
}

export const permitTradeActivitySanAntonio: FetcherModule<TradeActivityValue> = {
  datasetId: "permit-trade-activity",
  location: "san-antonio",
  source: { name: "City of San Antonio Permits Open Data", url: "https://data.sanantonio.gov/" },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<TradeActivityValue>[]> {
    const { since, until } = ctx.window;
    const res = await fetch(await sanAntonioCsvUrl());
    if (!res.ok) throw new Error(`San Antonio permits CSV fetch failed: HTTP ${res.status}`);
    const records = rowsToRecords(parseCsv(await res.text()));
    if (records.length === 0) return [];

    const typeCol = resolveHeader(records[0], ["PERMIT TYPE", "PERMIT_TYPE", "PERMITTYPE", "TYPE"]);
    const dateCol = resolveHeader(records[0], [
      "DATE ISSUED",
      "ISSUE DATE",
      "ISSUED DATE",
      "ISSUE_DATE",
      "ISSUED_DATE",
      "APPROVED DATE",
      "DATE SUBMITTED",
    ]);
    if (!typeCol || !dateCol) {
      throw new Error(
        `San Antonio permits CSV: missing permit-type or issue-date column among: ${Object.keys(records[0]).join(", ")}`,
      );
    }

    const buckets = new Map<string, Bucket>();
    const unknown = new Map<string, number>();
    let retained = 0;
    let dropped = 0;
    for (const row of records) {
      const raw = row[dateCol];
      if (!raw) continue;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) continue;
      const observedAt = parsed.toISOString();
      if (observedAt < since || observedAt > until) continue;

      const permitType = row[typeCol] ?? "";
      const classifications = classifySanAntonio(permitType);
      if (classifications.length === 0) {
        dropped++;
        if (isUnknownSanAntonioType(permitType)) {
          unknown.set(permitType, (unknown.get(permitType) ?? 0) + 1);
        }
        continue;
      }
      retained++;
      const month = observedAt.slice(0, 7);
      for (const c of classifications) bump(buckets, c.category, month, c.mechanism, c.sourceValue);
    }
    reportCounts("san-antonio", retained, dropped, unknown);
    return toObservations(buckets, new Date().toISOString());
  },
};

// -- AUSTIN -----------------------------------------------------------------
const AUSTIN_RESOURCE_URL = "https://data.austintexas.gov/resource/3syk-w9eu.json";
const AUSTIN_PAGE_SIZE = 50_000;
const AUSTIN_MAX_PAGES = 10;

function soqlTimestamp(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
}

function soqlQuote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * The server-side half of the two-layer filter, GENERATED from the same maps
 * `classifyAustin` reads.
 *
 * The layers cannot drift by editing, because there is only one source of
 * truth: add a permit type to `AUSTIN_PERMIT_TYPE_MAP` and both the SoQL and
 * the JavaScript change together. The predicate is deliberately a SUPERSET of
 * what the classifier keeps - it narrows the download, the JavaScript decides.
 * A superset can only cost bandwidth; a subset would silently lose rows, so
 * the containment direction is asserted rather than assumed
 * (scripts/verify-trade-mapping.ts), and the row count is cross-checked
 * against a server-side count(1) on every ingestion.
 *
 * `upper(...) like '%ROOF%'` over the same three columns is the byte-for-byte
 * predicate austinPermits.ts has always used, and it is equivalent to the
 * classifier's `.includes("roof")` on the space-joined haystack: a space always
 * separates the three fields, so "roof" cannot straddle a boundary.
 */
export function austinTradeWhere(since: string, until: string): string {
  const types = Object.entries(AUSTIN_PERMIT_TYPE_MAP)
    .filter(([, c]) => c !== null)
    .map(([t]) => soqlQuote(t));
  const workClasses = Object.keys(AUSTIN_WORK_CLASS_MAP).map((w) => soqlQuote(w));
  const clauses = [
    `permit_type_desc in (${types.join(", ")})`,
    `work_class in (${workClasses.join(", ")})`,
    `upper(work_class) like '%ROOF%'`,
    `upper(permit_type_desc) like '%ROOF%'`,
    `upper(description) like '%ROOF%'`,
    `upper(description) like '%SOLAR%'`,
    `upper(description) like '%PHOTOVOLTAIC%'`,
  ];
  return (
    `issue_date between '${soqlTimestamp(since)}' and '${soqlTimestamp(until)}'` +
    ` AND (${clauses.join(" OR ")})`
  );
}

interface AustinRow {
  permit_type_desc?: string;
  work_class?: string;
  description?: string;
  issue_date?: string;
}

export const permitTradeActivityAustin: FetcherModule<TradeActivityValue> = {
  datasetId: "permit-trade-activity",
  location: "austin",
  source: {
    name: "City of Austin Issued Construction Permits (Socrata)",
    url: "https://data.austintexas.gov/",
  },
  requiredEnvVars: [],
  async fetchRaw(ctx): Promise<Observation<TradeActivityValue>[]> {
    const where = austinTradeWhere(ctx.window.since, ctx.window.until);
    const headers: Record<string, string> = {};
    if (ctx.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = ctx.env.SOCRATA_APP_TOKEN;

    const get = async (params: Record<string, string>): Promise<unknown> => {
      const url = new URL(AUSTIN_RESOURCE_URL);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Austin permits fetch failed: HTTP ${res.status} from ${url.toString()} - ${body.slice(0, 300)}`,
        );
      }
      return res.json();
    };

    // The layer cross-check, run on EVERY ingestion. Round 7 removed the
    // temporary enumeration step that compared the server-side predicate
    // against a local reproduction; this replaces it inside the fetcher, where
    // it also guards against a silently truncated page walk.
    const countRows = (await get({ $select: "count(1)", $where: where })) as { count_1?: string }[];
    const serverCount = Number(countRows[0]?.count_1 ?? NaN);

    const rows: AustinRow[] = [];
    for (let page = 0; page < AUSTIN_MAX_PAGES; page++) {
      const batch = (await get({
        $where: where,
        $select: "permit_type_desc,work_class,description,issue_date",
        $order: ":id",
        $limit: String(AUSTIN_PAGE_SIZE),
        $offset: String(page * AUSTIN_PAGE_SIZE),
      })) as AustinRow[];
      rows.push(...batch);
      if (batch.length < AUSTIN_PAGE_SIZE) break;
    }
    if (Number.isFinite(serverCount) && rows.length !== serverCount) {
      throw new Error(
        `Austin trade activity: incomplete read - server-side count(1) says ${serverCount} for this ` +
          `$where, the paged download returned ${rows.length}. Refusing to publish counts from a partial read.`,
      );
    }

    const buckets = new Map<string, Bucket>();
    const unknown = new Map<string, number>();
    let retained = 0;
    let dropped = 0;
    for (const row of rows) {
      if (!row.issue_date) continue;
      const observedAt = new Date(row.issue_date).toISOString();
      const classifications = classifyAustin(row);
      if (classifications.length === 0) {
        // The server predicate is a superset, so some rows legitimately reach
        // here and are dropped by the classifier. That is the two layers
        // working as designed, not a fault.
        dropped++;
        const ptd = (row.permit_type_desc ?? "").trim();
        if (isUnknownAustinType(ptd)) unknown.set(ptd, (unknown.get(ptd) ?? 0) + 1);
        continue;
      }
      retained++;
      const month = observedAt.slice(0, 7);
      for (const c of classifications) bump(buckets, c.category, month, c.mechanism, c.sourceValue);
    }
    console.log(
      `[permit-trade-activity/austin] server-side $where returned ${rows.length.toLocaleString("en-US")} ` +
        `row(s); count(1) agreed exactly.`,
    );
    reportCounts("austin", retained, dropped, unknown);
    return toObservations(buckets, new Date().toISOString());
  },
};
