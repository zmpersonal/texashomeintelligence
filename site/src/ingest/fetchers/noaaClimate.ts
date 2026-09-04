import type { FetcherModule, Observation } from "../types";
import { ZIP_AREAS } from "../../data/zip-areas";

/**
 * One month of cooling demand, and the station the reading came from.
 *
 * `coolingDegreeDaysF` is degree-days Fahrenheit, base 65F — the units NCEI
 * returns when `units=standard` is requested. It measures how much cooling a
 * month asked for. It is not a cost, a runtime, or a bill.
 *
 * `stationId` / `stationName` ride on every row deliberately. The station is
 * CHOSEN AT FETCH TIME (see `pickStation`) rather than hard-coded, so the only
 * way to audit which instrument a number came from is for the number to say
 * so. If the choice ever moves, the series shows it.
 */
export interface CoolingDegreeDayValue {
  coolingDegreeDaysF: number;
  stationId: string;
  stationName?: string;
}

/**
 * NOAA NCEI Global Summary of the Month (GSOM), via the **Access Data Service
 * v1** — https://www.ncei.noaa.gov/access/services/data/v1.
 *
 * WHY THIS ENDPOINT AND NOT CDO v2. The stub this replaces pointed at Climate
 * Data Online v2, which requires a free `NOAA_CDO_TOKEN` nobody has requested.
 * The Access Data Service serves the same GSOM archive with no token, so
 * `requiredEnvVars` stays empty and this feed adds no secret, no owner seam
 * and no cost. If a live run proves otherwise, that is the first thing to
 * check.
 *
 * WHY NO STATION ID IS WRITTEN DOWN. Round 16's standing lesson is not to
 * assert an identifier nobody has round-tripped. Rather than commit a GHCN id
 * for Camp Mabry or San Antonio International that has never been seen in a
 * response, this queries a bounding box around the representative point
 * already in `src/data/zip-areas.ts` and picks the best-covered station out of
 * what actually comes back. The two points, and therefore the two boxes, are
 * sourced from this repository. Nothing about a station is.
 *
 * ⚠️ WHAT IS STILL UNVERIFIED, IN THE `blsWages.ts` SENSE. This sandbox's
 * network policy blocks `www.ncei.noaa.gov` (403 to CONNECT), so NOT ONE
 * REQUEST BELOW HAS EVER BEEN ROUND-TRIPPED AGAINST A LIVE RESPONSE. Three
 * things in particular are constructions, not confirmed responses:
 *
 *   1. `dataTypes=CLDD` as the GSOM id for monthly cooling degree days.
 *   2. `bbox` ordering. NCEI documents north,west,south,east; this tries that
 *      first, falls back to south,west,north,east, and names both orderings in
 *      the throw message if neither answers.
 *   3. `units=standard` yielding base-65F degree days rather than Celsius.
 *
 * `.github/workflows/noaa-climate-probe.yml` (TEMP, Round 19) exists to settle
 * all three from the Actions runner, which reaches these hosts. Read its log
 * before trusting a first live run. If a run fails, check the datatype id
 * before anything else — do not just retry, and do not ship a differently
 * guessed id without checking.
 *
 * NOT BUILT THIS ROUND, deliberately: any "runs N times harder than the
 * national average" multiplier. That needs a national CDD baseline on the same
 * basis — same 65F base, same months, and a stated position on population
 * weighting — and no such series could be confirmed reachable from here. See
 * docs/audits/round-19-cooling-degree-days.md.
 */
type Metro = "austin" | "san-antonio";

const ACCESS_DATA_V1 = "https://www.ncei.noaa.gov/access/services/data/v1";
const GSOM_DATASET = "global-summary-of-the-month";
const CDD_DATATYPE = "CLDD";

/**
 * Half-width of the box drawn around each metro's representative point, in
 * degrees. ~0.35 deg is roughly 24 miles north-south: wide enough to contain a
 * metro's first-order stations, narrow enough that it cannot wander into a
 * neighbouring metro's. Austin's and San Antonio's points are ~0.84 deg apart
 * in latitude, so the two boxes cannot overlap. It is a judgement call, so it
 * is named rather than inlined.
 */
const BOX_PAD_DEGREES = 0.35;

/**
 * Station selection reads at least this much history, independent of the
 * window a given run asks for. Without it a routine incremental run would
 * choose a station from a fortnight of evidence and could silently move the
 * metro's series onto a different instrument each month. Three years is long
 * enough that the choice is stable.
 */
const SELECTION_LOOKBACK_YEARS = 3;

/** A GSOM row, as much of it as this fetcher relies on. Every field is a string. */
interface GsomRow {
  STATION?: string;
  NAME?: string;
  DATE?: string;
  CLDD?: string;
  [key: string]: string | undefined;
}

function pointFor(location: Metro): { lat: number; lon: number } {
  const area = ZIP_AREAS.find((a) => a.areaId === location);
  if (!area) {
    throw new Error(
      `noaa-climate: no area "${location}" in src/data/zip-areas.ts — cannot build a bounding box.`,
    );
  }
  return area.point;
}

/** NCEI documents bbox as north,west,south,east. Both orderings are tried. */
function boundingBoxes(location: Metro): string[] {
  const { lat, lon } = pointFor(location);
  const n = (lat + BOX_PAD_DEGREES).toFixed(4);
  const s = (lat - BOX_PAD_DEGREES).toFixed(4);
  const w = (lon - BOX_PAD_DEGREES).toFixed(4);
  const e = (lon + BOX_PAD_DEGREES).toFixed(4);
  return [`${n},${w},${s},${e}`, `${s},${w},${n},${e}`];
}

function requestUrl(bbox: string, since: string, until: string): string {
  const url = new URL(ACCESS_DATA_V1);
  url.searchParams.set("dataset", GSOM_DATASET);
  url.searchParams.set("dataTypes", CDD_DATATYPE);
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("startDate", since);
  url.searchParams.set("endDate", until);
  url.searchParams.set("format", "json");
  url.searchParams.set("includeStationName", "true");
  url.searchParams.set("units", "standard");
  return url.toString();
}

/** GSOM dates months as `YYYY-MM`. Anything else is not a month and is dropped. */
function monthKey(row: GsomRow): string | null {
  const date = (row.DATE ?? "").trim();
  return /^\d{4}-\d{2}$/.test(date) ? date : null;
}

/**
 * NCEI writes a missing value as an empty string or `-9999`. Neither is zero,
 * and a zero-degree-day month is a real January reading, so the two cases must
 * never be conflated.
 */
function cddValue(row: GsomRow): number | null {
  const raw = (row.CLDD ?? "").trim();
  if (raw === "" || raw === "-9999") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The station with the most usable CDD months wins; ties break on station id
 * ascending. Both halves matter: "most months" picks the instrument that
 * actually reports, and the tie-break makes the choice reproducible rather
 * than dependent on the order NCEI happened to return rows in.
 */
function pickStation(rows: GsomRow[]): { id: string; name?: string; count: number } | null {
  const tally = new Map<string, { name?: string; count: number }>();
  for (const row of rows) {
    const id = (row.STATION ?? "").trim();
    if (!id || monthKey(row) === null || cddValue(row) === null) continue;
    const entry = tally.get(id) ?? { name: (row.NAME ?? "").trim() || undefined, count: 0 };
    entry.count += 1;
    tally.set(id, entry);
  }
  const ranked = [...tally.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
  );
  const best = ranked[0];
  return best ? { id: best[0], name: best[1].name, count: best[1].count } : null;
}

function makeFetcher(location: Metro): FetcherModule<CoolingDegreeDayValue> {
  return {
    datasetId: "noaa-climate",
    location,
    source: {
      name: "NOAA NCEI Global Summary of the Month",
      url: "https://www.ncei.noaa.gov/access/services/data/v1",
    },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<CoolingDegreeDayValue>[]> {
      // The request always spans at least SELECTION_LOOKBACK_YEARS so the
      // station choice is made on a stable base. Emitting is a separate
      // question: every month the request returns is emitted, because
      // `mergeObservations` keys on the month, so re-stating a month already
      // held is a no-op — while withholding one would leave a hole no later
      // run goes back for.
      const lookbackFrom = new Date(ctx.window.until);
      lookbackFrom.setUTCFullYear(lookbackFrom.getUTCFullYear() - SELECTION_LOOKBACK_YEARS);
      const sinceMs = Math.min(Date.parse(ctx.window.since), lookbackFrom.getTime());
      const since = new Date(sinceMs).toISOString().slice(0, 10);
      const until = new Date(ctx.window.until).toISOString().slice(0, 10);

      const attempted: string[] = [];
      let rows: GsomRow[] = [];
      for (const bbox of boundingBoxes(location)) {
        const url = requestUrl(bbox, since, until);
        attempted.push(bbox);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`NOAA NCEI GSOM fetch failed: HTTP ${res.status} from ${url}`);
        }
        const text = await res.text();
        // NCEI answers an empty result set with an empty body, not with `[]`.
        const parsed: unknown = text.trim() === "" ? [] : JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error(`NOAA NCEI GSOM returned a non-array body for ${location} from ${url}`);
        }
        rows = parsed as GsomRow[];
        if (rows.length > 0) break;
      }

      const station = pickStation(rows);
      if (!station) {
        // Deliberately a throw, not an empty return. An empty return would let
        // `runIngestion` mark a dataset that already has live evidence "live"
        // on a run that learned nothing. A GSOM query spanning three years
        // that yields no cooling degree days means the query is wrong, and the
        // message has to carry enough to say which part.
        throw new Error(
          `NOAA NCEI GSOM returned no usable ${CDD_DATATYPE} rows for ${location} over ${since}..${until}. ` +
            `Tried bbox ordering(s) ${attempted.join(" then ")} against dataset "${GSOM_DATASET}". ` +
            `Check the datatype id and the bbox ordering before retrying — see the fetcher header.`,
        );
      }

      const ingestedAt = new Date().toISOString();
      const observations: Observation<CoolingDegreeDayValue>[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if ((row.STATION ?? "").trim() !== station.id) continue;
        const month = monthKey(row);
        const cdd = cddValue(row);
        if (month === null || cdd === null) continue;
        // One reading per month per metro. GSOM should not repeat a month for
        // one station, but a duplicate would otherwise become two rows under
        // the same key and merge order would decide which survived.
        if (seen.has(month)) continue;
        seen.add(month);
        observations.push({
          observedAt: new Date(`${month}-01T00:00:00.000Z`).toISOString(),
          ingestedAt,
          key: month,
          value: {
            coolingDegreeDaysF: cdd,
            stationId: station.id,
            stationName: station.name,
          },
        });
      }
      return observations;
    },
  };
}

export const noaaClimateAustin = makeFetcher("austin");
export const noaaClimateSanAntonio = makeFetcher("san-antonio");
