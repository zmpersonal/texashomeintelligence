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

async function listLatestFileByYear(): Promise<Map<number, string>> {
  const res = await fetch(LISTING_URL);
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
  if (latestByYear.size === 0) {
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

function mapRow(
  row: Record<string, string>,
  location: "austin" | "san-antonio",
  since: string,
  until: string,
): Observation<StormEventValue> | null {
  if ((row.STATE ?? "").toUpperCase() !== "TEXAS") return null;

  const county = (row.CZ_NAME ?? "").trim().toUpperCase();
  if (!COUNTIES_BY_LOCATION[location].has(county)) return null;

  const eventType = classifyEventType(row.EVENT_TYPE ?? "");
  if (!eventType) return null;

  const observedAt = parseBeginObservedAt(row);
  if (!observedAt) return null;
  if (observedAt < since || observedAt > until) return null;

  const eventId = row.EVENT_ID;
  if (!eventId) return null;

  const narrative = (row.EVENT_NARRATIVE || row.EPISODE_NARRATIVE || "").slice(0, MAX_NARRATIVE_LENGTH) || undefined;

  return {
    observedAt,
    ingestedAt: new Date().toISOString(),
    key: eventId,
    value: {
      eventType,
      magnitude: formatMagnitude(eventType, row.MAGNITUDE ?? ""),
      county: titleCase(county),
      narrative,
    },
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
      const fileByYear = await listLatestFileByYear();

      const observations: Observation<StormEventValue>[] = [];
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
        for (const record of records) {
          const obs = mapRow(record, location, since, until);
          if (obs) observations.push(obs);
        }
      }
      return observations;
    },
  };
}

export const noaaStormEventsAustin = makeFetcher("austin");
export const noaaStormEventsSanAntonio = makeFetcher("san-antonio");
