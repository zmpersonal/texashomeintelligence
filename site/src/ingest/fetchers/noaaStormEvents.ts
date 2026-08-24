import { gunzipSync } from "node:zlib";
import type { FetcherModule, Observation } from "../types";

export interface StormEventValue {
  eventType: "Hail" | "Wind" | "Tornado" | "Flood";
  magnitude: string;
  county: string;
  narrative?: string;
}

const LISTING_URL = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/";

// Travis County (Austin) and Bexar County (San Antonio) plus each one's
// bordering counties — CZ_NAME in the NOAA CSVs is the plain county name,
// upper-cased, no "COUNTY" suffix.
const COUNTIES_BY_LOCATION: Record<"austin" | "san-antonio", Set<string>> = {
  austin: new Set(["TRAVIS", "WILLIAMSON", "HAYS", "BASTROP", "CALDWELL", "BURNET", "BLANCO"]),
  "san-antonio": new Set(["BEXAR", "BANDERA", "MEDINA", "ATASCOSA", "WILSON", "GUADALUPE", "COMAL", "KENDALL"]),
};

// --- directory listing ------------------------------------------------

/** Filename pattern: StormEvents_details-ftp_v1.0_d{YEAR}_c{CREATED_YYYYMMDD}.csv.gz.
 * NOAA republishes a year's file with corrections over time (multiple
 * `c` dates per year) — we want the latest `c` per year. */
const DETAILS_FILE_RE = /href="(StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d{8})\.csv\.gz)"/g;

// TEMP DIAGNOSTIC LOGGING (2026-08-24): tracing where the real NCEI live
// fetch drops to 0 records. Remove once the root cause is confirmed fixed.
async function listLatestFileByYear(): Promise<Map<number, string>> {
  const res = await fetch(LISTING_URL);
  console.log(`[noaa-diag] (a) directory listing HTTP ${res.status} from ${LISTING_URL}`);
  if (!res.ok) {
    throw new Error(`NOAA Storm Events directory listing failed: HTTP ${res.status} from ${LISTING_URL}`);
  }
  const html = await res.text();
  const latestByYear = new Map<number, { created: string; filename: string }>();
  for (const match of html.matchAll(DETAILS_FILE_RE)) {
    const [, filename, yearStr, createdStr] = match;
    const year = Number(yearStr);
    const existing = latestByYear.get(year);
    if (!existing || createdStr > existing.created) {
      latestByYear.set(year, { created: createdStr, filename });
    }
  }
  console.log(
    `[noaa-diag] (a) parsed ${latestByYear.size} year-file link(s) from listing HTML (html length ${html.length})`,
  );
  if (latestByYear.size === 0) {
    console.log(`[noaa-diag] (a) first 500 chars of listing HTML: ${html.slice(0, 500)}`);
    throw new Error(`NOAA Storm Events directory listing returned no matching files at ${LISTING_URL}`);
  }
  const urlByYear = new Map<number, string>();
  for (const [year, { filename }] of latestByYear) {
    urlByYear.set(year, new URL(filename, LISTING_URL).toString());
  }
  return urlByYear;
}

function yearsInWindow(since: string, until: string): number[] {
  const startYear = new Date(since).getUTCFullYear();
  const endYear = new Date(until).getUTCFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

async function fetchYearCsv(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA Storm Events year file fetch failed: HTTP ${res.status} from ${url}`);
  }
  const gzipped = new Uint8Array(await res.arrayBuffer());
  // TextDecoder rather than Buffer#toString: avoids a type conflict
  // between @cloudflare/workers-types' ambient globals (this tsconfig's
  // only entry in `types`) and Node's Buffer overloads — this script only
  // ever runs under plain Node (via tsx), but astro check still resolves
  // this whole file's types since .astro pages import a type from it.
  return new TextDecoder("utf-8").decode(gunzipSync(gzipped));
}

// --- CSV parsing (RFC4180-ish: quoted fields, embedded commas/quotes/newlines) ---

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function rowsToRecords(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// --- row -> Observation<StormEventValue> ------------------------------

function classifyEventType(raw: string): StormEventValue["eventType"] | null {
  const t = raw.toLowerCase();
  if (t.includes("hail")) return "Hail";
  if (t.includes("wind")) return "Wind";
  if (t.includes("tornado")) return "Tornado";
  if (t.includes("flood")) return "Flood";
  return null;
}

function formatMagnitude(eventType: StormEventValue["eventType"], magnitude: string): string {
  const n = parseFloat(magnitude);
  if (eventType === "Hail") return Number.isFinite(n) ? `${n.toFixed(2)}"` : "unknown";
  if (eventType === "Wind") return Number.isFinite(n) ? `${n} mph gust` : "unknown";
  return magnitude || "unknown";
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const MAX_NARRATIVE_LENGTH = 500;

/** Row's begin time is built from BEGIN_YEARMONTH/BEGIN_DAY/BEGIN_TIME (all
 * plain numeric fields) rather than the human-readable BEGIN_DATE_TIME
 * string, which avoids parsing NOAA's "DD-MON-YY(YY)" text format. Treated
 * as UTC for simplicity — the true value is local to the event's time
 * zone, a few hours off UTC, which doesn't affect the month-level
 * bucketing this app does with it. */
function parseBeginObservedAt(row: Record<string, string>): string | null {
  const ym = row.BEGIN_YEARMONTH;
  const day = row.BEGIN_DAY;
  const time = row.BEGIN_TIME;
  if (!ym || ym.length !== 6 || !day || !time) return null;
  const year = ym.slice(0, 4);
  const month = ym.slice(4, 6);
  const dayPadded = day.padStart(2, "0");
  const timePadded = time.padStart(4, "0");
  const hour = timePadded.slice(0, 2);
  const minute = timePadded.slice(2, 4);
  const iso = `${year}-${month}-${dayPadded}T${hour}:${minute}:00.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// TEMP DIAGNOSTIC (2026-08-24): drop reason returned alongside the mapped
// observation so fetchRaw can tally exactly which stage a row fell out at
// ("state" = not Texas, "county" = Texas but not in our county set,
// "event-type" = right place, event type we don't classify, "date-window"
// / "event-id" = passed the content filters but failed a structural check).
// Collapse back to `Observation | null` once the root cause is fixed.
type MapRowResult = { obs: Observation<StormEventValue> | null; drop: string | null };

function mapRow(
  row: Record<string, string>,
  location: "austin" | "san-antonio",
  since: string,
  until: string,
): MapRowResult {
  if ((row.STATE ?? "").toUpperCase() !== "TEXAS") return { obs: null, drop: "state" };

  const county = (row.CZ_NAME ?? "").trim().toUpperCase();
  if (!COUNTIES_BY_LOCATION[location].has(county)) return { obs: null, drop: "county" };

  const eventType = classifyEventType(row.EVENT_TYPE ?? "");
  if (!eventType) return { obs: null, drop: "event-type" };

  const observedAt = parseBeginObservedAt(row);
  if (!observedAt) return { obs: null, drop: "unparseable-date" };
  if (observedAt < since || observedAt > until) return { obs: null, drop: "date-window" };

  const eventId = row.EVENT_ID;
  if (!eventId) return { obs: null, drop: "missing-event-id" };

  const narrative = (row.EVENT_NARRATIVE || row.EPISODE_NARRATIVE || "").slice(0, MAX_NARRATIVE_LENGTH) || undefined;

  return {
    obs: {
      observedAt,
      ingestedAt: new Date().toISOString(),
      key: eventId,
      value: {
        eventType,
        magnitude: formatMagnitude(eventType, row.MAGNITUDE ?? ""),
        county: titleCase(county),
        narrative,
      },
    },
    drop: null,
  };
}

/**
 * Real fetch against NOAA NCEI's public bulk Storm Events CSV archive
 * (keyless). Pure function per FetcherModule's contract: only reads from
 * the network and `ctx`, returns Observation<StormEventValue>[] — no
 * filesystem access, no persistence (that's runIngestion.ts's job).
 */
function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<StormEventValue> {
  return {
    datasetId: "noaa-storm-events",
    location,
    source: {
      name: "NOAA Storm Events Database",
      url: LISTING_URL,
    },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<StormEventValue>[]> {
      const { since, until } = ctx.window;
      const years = yearsInWindow(since, until);
      // TEMP DIAGNOSTIC (2026-08-24): remove once root cause is confirmed fixed.
      console.log(`[noaa-diag:${location}] (b) window since=${since} until=${until} -> years=[${years.join(", ")}]`);
      const fileByYear = await listLatestFileByYear();
      for (const year of years) {
        console.log(`[noaa-diag:${location}] (b) year ${year}: ${fileByYear.has(year) ? `matched -> ${fileByYear.get(year)}` : "no file published for this year"}`);
      }

      const observations: Observation<StormEventValue>[] = [];
      let totalRows = 0;
      const dropCounts: Record<string, number> = {};
      for (const year of years) {
        const url = fileByYear.get(year);
        if (!url) {
          // A requested year genuinely not published yet (e.g. very early
          // in a new calendar year) isn't a failure — skip it. A missing
          // *past* year would be unusual, but still shouldn't abort the
          // other years' worth of real data this call can still return.
          continue;
        }
        const csvText = await fetchYearCsv(url);
        const records = rowsToRecords(parseCsv(csvText));
        console.log(`[noaa-diag:${location}] (c) year ${year}: ${records.length} row(s) after gunzip + CSV parse`);
        totalRows += records.length;
        for (const record of records) {
          const { obs, drop } = mapRow(record, location, since, until);
          if (obs) {
            observations.push(obs);
          } else if (drop) {
            dropCounts[drop] = (dropCounts[drop] ?? 0) + 1;
          }
        }
      }
      const droppedState = dropCounts.state ?? 0;
      const droppedCounty = dropCounts.county ?? 0;
      const droppedEventType = dropCounts["event-type"] ?? 0;
      const afterStateAndCountyFilter = totalRows - droppedState - droppedCounty;
      const afterEventTypeFilter = afterStateAndCountyFilter - droppedEventType;
      console.log(`[noaa-diag:${location}] (c) total rows across all years after gunzip + CSV parse: ${totalRows}`);
      console.log(
        `[noaa-diag:${location}] (d) rows after Texas/county filter: ${afterStateAndCountyFilter} (dropped ${droppedState} non-Texas, ${droppedCounty} wrong-county)`,
      );
      console.log(
        `[noaa-diag:${location}] (e) rows after event-type filter: ${afterEventTypeFilter} (dropped ${droppedEventType} unclassified event type)`,
      );
      console.log(
        `[noaa-diag:${location}] final observations returned: ${observations.length} (additional drops beyond (e): ${JSON.stringify(
          Object.fromEntries(Object.entries(dropCounts).filter(([k]) => k !== "state" && k !== "county" && k !== "event-type")),
        )})`,
      );
      return observations;
    },
  };
}

export const noaaStormEventsAustin = makeFetcher("austin");
export const noaaStormEventsSanAntonio = makeFetcher("san-antonio");
