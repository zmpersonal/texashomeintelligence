/**
 * How old a dataset's newest record may be before it stops being current.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * `DatasetFile.status` records one thing: whether the most recent ingest
 * ATTEMPT succeeded. It says nothing about how old the records themselves
 * are. `bls/austin` is the case that makes the difference obvious — its last
 * fetch succeeded today, and its newest record is from January 2025. Under
 * the old rule that file rendered a `LIVE` badge beside a twenty-month-old
 * date, and the badge contradicted the date next to it.
 *
 * So currency is now a question about the DATA, answered against a per-source
 * expectation, and the fetch outcome is reported separately.
 *
 * ── HOW EACH WINDOW WAS CHOSEN ────────────────────────────────────────────
 * Each value is the source's own publication cadence plus enough slack to
 * absorb one missed ingestion run (ingestion is daily). It is deliberately
 * NOT "how fresh we would like this to be": several of these sources publish
 * on a long lag by nature, and a badge that called NOAA Storm Events stale
 * for being three months behind would be crying wolf about the source working
 * exactly as designed.
 *
 * Where a cadence could not be established from the fetcher, its source URL,
 * or the shape of the data, the comment says so and the window is the
 * conservative one — short, so an unverified guess errs toward admitting
 * staleness rather than claiming currency we cannot support.
 *
 * ── WHAT THIS CANNOT DO ───────────────────────────────────────────────────
 * This measures the data's age at RENDER time. For the public pages that is
 * BUILD time, because they are static — so it catches a dataset that was
 * already old when the site was built (the `bls` case), but it cannot catch a
 * deployment that has since aged in place. Nothing in static HTML can, short
 * of client-side JS, which would put a fact outside server-rendered HTML and
 * break CLAUDE.md's rule. Deploy age is a separate, unsolved problem recorded
 * in docs/audits/round-0d-freshness-and-alerts.md.
 */

/** Days. Named so a bare number in the table below can never be misread. */
const DAY = 1;

/**
 * Maximum age of the newest observation, per dataset id. Ids match
 * `src/data/data-sources.yaml` and `DatasetFile.datasetId`.
 */
export const MAX_DATA_AGE_DAYS: Record<string, number> = {
  // NWS forecasts refresh several times a day; we ingest daily. Two days
  // allows exactly one missed run before the reading stops being current.
  "nws-api": 2 * DAY,

  // AirNow is a current-conditions endpoint (hourly), ingested daily. Same
  // one-missed-run allowance as NWS.
  airnow: 2 * DAY,

  // The U.S. Drought Monitor publishes one map per week, released Thursdays.
  // Ten days covers the weekly cadence plus a missed run either side.
  "usdm-drought": 10 * DAY,

  // Austin Water publishes the drought stage on an HTML page with no fixed
  // cadence — it changes only when the stage changes. The reading is
  // nonetheless a scrape that must be recent to be trusted (HANDOFF Seam 6:
  // the scraper fails closed and the feed goes stale rather than guessing),
  // so this is a short window on our own re-check, not on the city's changes.
  "austin-water-stage": 7 * DAY,

  // City open-data permit tables refresh on their own schedule — observed
  // roughly daily, but not contractually. Two weeks tolerates a quiet stretch
  // without tolerating a dead feed.
  "municipal-permits": 14 * DAY,

  // The Austin Resource Recovery address table is republished irregularly by
  // the city; `observedAt` is our ingest date rather than a city timestamp,
  // so this window measures our own re-check, like austin-water-stage.
  "arr-collection-schedule": 14 * DAY,

  // NCEI publishes Storm Events as bulk CSVs updated monthly, and the data
  // itself runs two to four months behind real time — that lag is the
  // source's, not ours. 150 days is monthly cadence plus the documented lag;
  // past that, the bulk files have genuinely stopped arriving.
  "noaa-storm-events": 150 * DAY,

  // EIA retail-sales price is a MONTHLY series published with roughly a
  // two-month lag. 100 days is that lag plus one monthly cycle.
  "eia-electricity": 100 * DAY,

  // Census ACS 5-year is an ANNUAL release (the fetcher's own header says so:
  // "an annual release, not a fast-changing feed"). 400 days is one year plus
  // five weeks, so a normal release window never trips it.
  "census-acs": 400 * DAY,

  // BLS OEWS is an ANNUAL release — May reference period, published the
  // following spring. Same 400-day allowance as ACS. This is the dataset that
  // exposed the old badge: the fetch succeeds, and the newest record is still
  // from the last published vintage.
  bls: 400 * DAY,

  // SSURGO soil is reference data, not a time series — the map unit under a
  // point does not change year to year, and `observedAt` is our query date.
  // A long window is honest here; a short one would flag a feed that has
  // nothing new to say. 400 days re-checks it about annually.
  "usda-soil": 400 * DAY,

  // ── Cadence NOT established. These five are stub fetchers with sample
  // data, so they never reach the age check today (a `sample` file reports no
  // dates at all). Each carries the conservative 30-day window so that if one
  // is ever wired to a real source without revisiting this table, it errs
  // toward admitting staleness rather than claiming currency.
  ercot: 30 * DAY, // ERCOT load; real cadence unverified.
  "fema-nfhl": 30 * DAY, // NFHL flood layers; republication cadence unverified.
  "noaa-climate": 30 * DAY, // Climate normals; update cadence unverified.
  "tdi-losses": 30 * DAY, // TDI loss data; publication cadence unverified.
  "tx-forest-service": 30 * DAY, // TFS wildfire risk; cadence unverified.
};

/**
 * Fallback for a dataset id with no entry above — deliberately the
 * conservative stub window rather than something generous, so forgetting to
 * add a dataset here produces an over-cautious badge instead of a false
 * `LIVE`.
 */
export const DEFAULT_MAX_DATA_AGE_DAYS = 30 * DAY;

export function maxDataAgeDays(datasetId: string): number {
  return MAX_DATA_AGE_DAYS[datasetId] ?? DEFAULT_MAX_DATA_AGE_DAYS;
}

/**
 * What a badge may claim.
 *
 * Age-based staleness (`out-of-date`) and ingest failure (`feed-down`) are
 * separate states on purpose: "we could not reach the source" and "we reached
 * it and it has nothing newer" are different facts about the number on screen,
 * and a reader deciding whether to trust it needs to tell them apart.
 */
export type DisplayStatus =
  | "sample" // fabricated placeholder, never a measurement
  | "unavailable" // no valid value has ever been obtained
  | "feed-down" // last fetch failed; showing the last known good value
  | "out-of-date" // fetch succeeded, but the newest record is past its window
  | "current"; // within the window — the only state that may claim currency

/**
 * Resolve what the badge may say.
 *
 * `dataThrough` (the newest `observedAt`) is the field that decides currency —
 * the age of the DATA. `lastSuccessAt` (the fetch) never makes old data
 * current; it only distinguishes `feed-down` from the rest.
 *
 * Precedence, most severe first: a fabricated file, then a feed that has never
 * worked, then a feed that just failed, then data that is merely old. A failed
 * feed outranks age because it is the more actionable fact and it implies the
 * data is not being refreshed anyway; the date rendered beside the badge still
 * tells the reader exactly how old the value is.
 *
 * With no `dataThrough` at all there is nothing to measure, so a feed that is
 * otherwise healthy reports `out-of-date` rather than `current` — again the
 * conservative direction.
 */
export function resolveDisplayStatus(input: {
  datasetId: string;
  feedStatus: "sample" | "stale" | "live" | "error";
  dataThrough?: string;
  now?: Date;
}): DisplayStatus {
  if (input.feedStatus === "sample") return "sample";
  if (input.feedStatus === "error") return "unavailable";
  if (input.feedStatus === "stale") return "feed-down";

  if (!input.dataThrough) return "out-of-date";

  const ageDays = dataAgeDays(input.dataThrough, input.now);
  if (ageDays === undefined) return "out-of-date"; // unparseable date
  return ageDays > maxDataAgeDays(input.datasetId) ? "out-of-date" : "current";
}

/** Whole days between `dataThrough` and now; undefined if unparseable. */
export function dataAgeDays(dataThrough: string, now: Date = new Date()): number | undefined {
  const then = new Date(dataThrough).getTime();
  if (Number.isNaN(then)) return undefined;
  return Math.floor((now.getTime() - then) / 86_400_000);
}
