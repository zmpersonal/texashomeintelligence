import type { FetcherModule, Observation } from "../types";
import { ZIP_AREAS } from "../../data/zip-areas";

/**
 * Two kinds of cooling-degree-day reading. They answer different questions and
 * must never be mixed:
 *
 *  - `normal-1991-2020` — the 30-year monthly normal. "How hard does a system
 *    work in a typical August." Twelve rows, one per calendar month. Fixed
 *    product; it does not move.
 *  - `monthly-actual` — what one specific month actually did. "How hard did
 *    last August work it." Moves every month.
 *
 * Averaging the two together, or captioning one as the other, would be a
 * category error a reader could not detect, so `kind` is on every row, the
 * observation keys are prefixed differently, and nothing here ever combines
 * them.
 */
export type CddReadingKind = "normal-1991-2020" | "monthly-actual";

export interface CoolingDegreeDayValue {
  kind: CddReadingKind;
  /** Degree-days Fahrenheit. Base 65 — see `CDD_BASE_F`. */
  coolingDegreeDaysF: number;
  /** Units, carried on the row so a stored value is self-describing. */
  units: "degree-days F";
  /** The base this figure is computed against. Documented, not inferred. */
  baseF: 65;
  /** Calendar month, 1-12. */
  month: number;
  /** GHCN station id. Required — see `sourceRef` in the round's rule. */
  sourceRef: string;
  stationName: string;
  /** Great-circle miles from the metro's representative point. */
  distanceMiles: number;
  /**
   * Years of record behind a normal. Present on `normal-1991-2020` rows only;
   * GSOM actuals are a single month's observation and have no such count.
   * This is the field station selection ranks on — see `MIN_YEARS_OF_RECORD`.
   */
  yearsOfRecord?: number;
  /** NOAA completeness flag for a normal, e.g. "C", "S", "P", "E". */
  completenessFlag?: string;
}

/**
 * NOAA NCEI, via the **Access Data Service v1** with EXPLICIT STATION IDS.
 * No token, no secret, no owner seam.
 *
 * ── HOW THIS ROUND'S MECHANISM WAS ARRIVED AT, because three rounds got it
 * wrong and the reasons are worth keeping.
 *
 * Round 19 discovered a station by bounding box so no id had to be asserted.
 * The probe measured that as a hard failure: HTTP 400,
 * `{"field":"stations","message":"A station is required."}`. Round 19b then
 * chose the static normals CSVs and ranked candidate stations by id ascending,
 * which sorts `US1` (CoCoRaHS volunteers, precipitation only) ahead of `USC`
 * and `USW`; both files it sampled had no temperature at all, and it wrongly
 * concluded the product publishes no degree days. Round 19c re-ranked USW-first
 * and measured the truth.
 *
 * The endpoint was never the problem. THE BOUNDING BOX WAS. With an explicit
 * station id both datasets answer cleanly, and both are used here:
 *
 *   dataset=normals-monthly-1991-2020&stations=<id>   -> 12 rows, MLY-CLDD-*
 *   dataset=global-summary-of-the-month&stations=<id>&dataTypes=CLDD
 *
 * NEVER ASK A SERVER TO INTERPRET A BOUNDING BOX. `search/v1/data` rejects one
 * too (400, "Invalid search options"). Station ids are resolved by downloading
 * `ghcnd-stations.txt` (132,501 records: id, lat, lon, name) and filtering it
 * LOCALLY, in this process. That is the measured mechanism.
 *
 * ── THE BASE IS DOCUMENTED, NOT INFERRED. NCEI's
 * `Readme_By-Variable_By-Station_Normals_Files.txt` states: "Note that NORMAL
 * with degree days is base 65", confirmed there by a worked example. That
 * sentence is the whole reason `baseF: 65` may be written down. A degree-day
 * figure whose base is guessed from a column name is not usable, and if the
 * column ever changes name this code throws rather than assuming.
 *
 * ── STATION QUALITY IS PART OF THE RANKING, NOT JUST DISTANCE. Kelly AFB
 * (USW00012909) sits 6.1 mi from the San Antonio point — nearer than the
 * station this selects — but every row of its normals carries `years=2` and
 * `comp_flag=E`: a two-year estimated record wearing a 30-year product's
 * clothes. Distance alone would have picked it. See `MIN_YEARS_OF_RECORD` and
 * `ESTIMATED_FLAG`.
 */
type Metro = "austin" | "san-antonio";

const ACCESS_DATA_V1 = "https://www.ncei.noaa.gov/access/services/data/v1";
const GHCND_STATIONS = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt";
const NORMALS_DATASET = "normals-monthly-1991-2020";
const GSOM_DATASET = "global-summary-of-the-month";

/** Documented in NCEI's normals readme. Never inferred from a column name. */
const CDD_BASE_F = 65 as const;

/**
 * Half-width of the local filter box around each metro point, in degrees.
 * ~0.35 deg is roughly 24 miles north-south. Austin's and San Antonio's points
 * are ~0.84 deg apart in latitude, so the two boxes cannot overlap.
 */
const BOX_PAD_DEGREES = 0.35;

/**
 * A normal built on fewer years than this is rejected. Kelly AFB's two-year
 * record is the case this exists for. 10 is a judgement call and a generous
 * one: the station selected for San Antonio carries 19-22 years and Austin's
 * 29-30, so the bar only ever excludes records that are not really normals.
 */
const MIN_YEARS_OF_RECORD = 10;

/** NOAA's completeness flag for an estimated value. Rejected outright. */
const ESTIMATED_FLAG = "E";

/** Nearest N USW stations considered before giving up. Bounds the request count. */
const MAX_CANDIDATES = 6;

interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMiles: number;
}

/** One row of either dataset. Every field arrives as a string. */
type ApiRow = Record<string, string | undefined>;

function pointFor(location: Metro): { lat: number; lon: number } {
  const area = ZIP_AREAS.find((a) => a.areaId === location);
  if (!area) {
    throw new Error(`noaa-climate: no area "${location}" in src/data/zip-areas.ts.`);
  }
  return area.point;
}

function greatCircleMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * `ghcnd-stations.txt` is ~10 MB and both metros need it. Fetched once per
 * process and shared. The promise itself is cached so two concurrent fetchers
 * cannot both start a download.
 */
let stationTablePromise: Promise<Station[]> | null = null;

async function loadStationTable(): Promise<Station[]> {
  if (!stationTablePromise) {
    stationTablePromise = (async () => {
      const res = await fetch(GHCND_STATIONS);
      if (!res.ok) {
        throw new Error(`ghcnd-stations.txt fetch failed: HTTP ${res.status} from ${GHCND_STATIONS}`);
      }
      const text = await res.text();
      const out: Station[] = [];
      // Documented fixed-width layout: id 1-11, lat 13-20, lon 22-30, name 42-71.
      for (const line of text.split("\n")) {
        if (line.length < 71) continue;
        const id = line.slice(0, 11).trim();
        const lat = Number(line.slice(12, 20));
        const lon = Number(line.slice(21, 30));
        const name = line.slice(41, 71).trim();
        if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        out.push({ id, name, lat, lon, distanceMiles: 0 });
      }
      if (out.length === 0) {
        throw new Error("ghcnd-stations.txt parsed to zero usable records — check the fixed-width offsets.");
      }
      return out;
    })().catch((err) => {
      // A failed download must not poison every later run in the same process.
      stationTablePromise = null;
      throw err;
    });
  }
  return stationTablePromise;
}

/**
 * Test-only. `stationTablePromise` is memoised for the life of the process so
 * both metros share one ~10 MB download, which is right for a one-shot ingest
 * run — but it also means a replay cannot re-exercise the parse-failure path
 * once a good table has loaded. Nothing in the ingestion path calls this.
 */
export function __resetStationTableCacheForTests(): void {
  stationTablePromise = null;
}

/**
 * USW is the first-order/airport tier — the one that reports temperature. USC
 * co-op and US1 CoCoRaHS stations are deliberately excluded rather than ranked
 * lower: Round 19b's whole failure was letting a precipitation-only tier into
 * the running at all.
 */
async function candidateStations(location: Metro): Promise<Station[]> {
  const { lat, lon } = pointFor(location);
  const all = await loadStationTable();
  return all
    .filter(
      (s) =>
        s.id.startsWith("USW") &&
        Math.abs(s.lat - lat) <= BOX_PAD_DEGREES &&
        Math.abs(s.lon - lon) <= BOX_PAD_DEGREES,
    )
    .map((s) => ({ ...s, distanceMiles: greatCircleMiles(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, MAX_CANDIDATES);
}

async function getRows(params: Record<string, string>): Promise<ApiRow[]> {
  const url = new URL(ACCESS_DATA_V1);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA NCEI fetch failed: HTTP ${res.status} from ${url.toString()}`);
  }
  const text = await res.text();
  // NCEI answers an empty result set with an empty body rather than `[]`.
  const parsed: unknown = text.trim() === "" ? [] : JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`NOAA NCEI returned a non-array body from ${url.toString()}`);
  }
  return parsed as ApiRow[];
}

/**
 * Finds a column by pattern rather than asserting its exact name, preferring a
 * CLDD-scoped one where the response carries per-element companions. The value
 * column itself is matched strictly — `MLY-CLDD-NORMAL` is the measured name,
 * and a loose match there could silently pick up a different statistic.
 */
function findColumn(row: ApiRow, strict: RegExp, loose?: RegExp): string | undefined {
  const keys = Object.keys(row);
  const exact = keys.find((k) => strict.test(k));
  if (exact) return exact;
  if (!loose) return undefined;
  return keys.find((k) => loose.test(k) && /cldd/i.test(k)) ?? keys.find((k) => loose.test(k));
}

function numberOrNull(raw: string | undefined): number | null {
  const v = (raw ?? "").trim();
  // NCEI writes a missing value as an empty string or -9999. Neither is zero,
  // and a zero-degree-day January is a real reading.
  if (v === "" || v === "-9999") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface NormalsResult {
  station: Station;
  rows: { month: number; cdd: number; years?: number; flag?: string }[];
}

/**
 * Walks candidates nearest-first and returns the first whose normals are a real
 * 30-year record. Every rejection is recorded in `rejections` with its reason,
 * because "we skipped the nearest station" is something a reader has to be able
 * to see.
 */
async function resolveNormals(location: Metro, rejections: string[]): Promise<NormalsResult> {
  const candidates = await candidateStations(location);
  if (candidates.length === 0) {
    throw new Error(
      `noaa-climate/${location}: no USW station within ${BOX_PAD_DEGREES} deg of the metro point. ` +
        "USC co-op and US1 CoCoRaHS stations are excluded on purpose — they do not report temperature.",
    );
  }

  for (const station of candidates) {
    const rows = await getRows({
      dataset: NORMALS_DATASET,
      stations: station.id,
      format: "json",
      units: "standard",
      includeStationName: "true",
    });
    const label = `${station.id} (${station.name}, ${station.distanceMiles.toFixed(1)} mi)`;
    if (rows.length === 0) {
      rejections.push(`${label}: no normals rows returned`);
      continue;
    }

    const valueCol = findColumn(rows[0], /^MLY-CLDD-NORMAL$/i);
    if (!valueCol) {
      rejections.push(
        `${label}: no MLY-CLDD-NORMAL column. Columns present: ${Object.keys(rows[0]).join(", ")}`,
      );
      continue;
    }
    const yearsCol = findColumn(rows[0], /^years[_-]?$/i, /years/i);
    const flagCol = findColumn(rows[0], /^comp[_-]?flag[_-]?$/i, /comp[_-]?flag/i);

    const parsed: NormalsResult["rows"] = [];
    let estimated = 0;
    let short = 0;
    let minYears: number | undefined;
    for (const row of rows) {
      const month = Number((row.DATE ?? "").trim());
      const cdd = numberOrNull(row[valueCol]);
      if (!Number.isInteger(month) || month < 1 || month > 12 || cdd === null) continue;
      const years = yearsCol ? numberOrNull(row[yearsCol]) ?? undefined : undefined;
      const flag = flagCol ? (row[flagCol] ?? "").trim() || undefined : undefined;
      if (flag && flag.toUpperCase() === ESTIMATED_FLAG) estimated += 1;
      if (years !== undefined) {
        minYears = minYears === undefined ? years : Math.min(minYears, years);
        if (years < MIN_YEARS_OF_RECORD) short += 1;
      }
      parsed.push({ month, cdd, years, flag });
    }

    if (parsed.length < 12) {
      rejections.push(`${label}: only ${parsed.length}/12 usable monthly normals`);
      continue;
    }
    if (estimated > 0) {
      rejections.push(
        `${label}: ${estimated}/12 month(s) flagged "${ESTIMATED_FLAG}" (estimated), ` +
          `min years of record ${minYears ?? "unknown"} — an estimated record is not a normal`,
      );
      continue;
    }
    if (short > 0) {
      rejections.push(
        `${label}: ${short}/12 month(s) built on fewer than ${MIN_YEARS_OF_RECORD} years ` +
          `(min ${minYears ?? "unknown"})`,
      );
      continue;
    }
    // `yearsCol` missing entirely is its own risk: without it nothing can tell a
    // two-year record from a thirty-year one, which is exactly the trap this
    // function exists to avoid.
    if (!yearsCol) {
      rejections.push(
        `${label}: response carries no years-of-record column, so record length cannot be checked. ` +
          `Columns present: ${Object.keys(rows[0]).join(", ")}`,
      );
      continue;
    }
    return { station, rows: parsed };
  }

  throw new Error(
    `noaa-climate/${location}: no USW station passed the record-quality bar. Rejected: ${rejections.join(" | ")}`,
  );
}

function makeFetcher(location: Metro): FetcherModule<CoolingDegreeDayValue> {
  return {
    datasetId: "noaa-climate",
    location,
    source: {
      name: "NOAA NCEI Climate Normals (1991-2020) and Global Summary of the Month",
      url: "https://www.ncei.noaa.gov/access/services/data/v1",
    },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<CoolingDegreeDayValue>[]> {
      const rejections: string[] = [];
      const { station, rows: normals } = await resolveNormals(location, rejections);
      if (rejections.length > 0) {
        // Not an error — a record of a real decision, on the run that made it.
        console.log(
          `noaa-climate/${location}: selected ${station.id} (${station.name}, ` +
            `${station.distanceMiles.toFixed(1)} mi). Rejected nearer/other candidates: ${rejections.join(" | ")}`,
        );
      }

      const ingestedAt = new Date().toISOString();
      const stationFields = {
        sourceRef: station.id,
        stationName: station.name,
        distanceMiles: Number(station.distanceMiles.toFixed(1)),
        units: "degree-days F" as const,
        baseF: CDD_BASE_F,
      };

      const observations: Observation<CoolingDegreeDayValue>[] = [];

      // ── The 30-year normal. Dated to the last year of its own period, so a
      // reader inspecting `observedAt` sees 1991-2020's endpoint rather than a
      // year the normal does not describe. `kind` and the key prefix are what
      // actually distinguish it; the date is never the discriminator.
      for (const r of normals) {
        observations.push({
          observedAt: new Date(Date.UTC(2020, r.month - 1, 1)).toISOString(),
          ingestedAt,
          key: `normal-1991-2020-${String(r.month).padStart(2, "0")}`,
          value: {
            kind: "normal-1991-2020",
            coolingDegreeDaysF: r.cdd,
            month: r.month,
            yearsOfRecord: r.years,
            completenessFlag: r.flag,
            ...stationFields,
          },
        });
      }

      // ── Recent monthly actuals, from the same station.
      const actuals = await getRows({
        dataset: GSOM_DATASET,
        stations: station.id,
        dataTypes: "CLDD",
        startDate: new Date(ctx.window.since).toISOString().slice(0, 10),
        endDate: new Date(ctx.window.until).toISOString().slice(0, 10),
        format: "json",
        units: "standard",
        includeStationName: "true",
      });

      // Round 15's lesson, and it cost a round to learn: THE CURRENT CALENDAR
      // MONTH IS ALWAYS PARTIAL. A part-month CDD total understates the month
      // by however much of it has not happened yet, and published next to
      // twelve complete months it reads as a real collapse in cooling demand.
      // Dropped, not flagged.
      const now = new Date(ctx.window.until);
      const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      let droppedPartial = 0;

      for (const row of actuals) {
        const date = (row.DATE ?? "").trim();
        if (!/^\d{4}-\d{2}$/.test(date)) continue;
        if (date >= currentMonthKey) {
          droppedPartial += 1;
          continue;
        }
        const cdd = numberOrNull(row.CLDD);
        if (cdd === null) continue;
        const month = Number(date.slice(5, 7));
        observations.push({
          observedAt: new Date(`${date}-01T00:00:00.000Z`).toISOString(),
          ingestedAt,
          key: `actual-${date}`,
          value: {
            kind: "monthly-actual",
            coolingDegreeDaysF: cdd,
            month,
            ...stationFields,
          },
        });
      }
      if (droppedPartial > 0) {
        console.log(
          `noaa-climate/${location}: dropped ${droppedPartial} row(s) at or after ${currentMonthKey} — ` +
            "the current calendar month is partial and would understate cooling demand.",
        );
      }

      const actualCount = observations.filter((o) => o.value.kind === "monthly-actual").length;
      if (actualCount === 0) {
        // Deliberately a throw. Returning only normals would leave the newest
        // observedAt at 2020, and the file would read as five years stale
        // forever while looking like a successful run.
        throw new Error(
          `noaa-climate/${location}: station ${station.id} returned no complete monthly CLDD actuals for ` +
            `${ctx.window.since}..${ctx.window.until} (${droppedPartial} partial row(s) dropped). ` +
            "Normals were retrieved; actuals were not, so this run is not a success.",
        );
      }
      return observations;
    },
  };
}

export const noaaClimateAustin = makeFetcher("austin");
export const noaaClimateSanAntonio = makeFetcher("san-antonio");
