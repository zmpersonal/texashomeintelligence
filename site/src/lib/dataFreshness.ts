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

  // ── Round 4b. The three windows above are keyed by dataset id, not by
  // dataset+location, so San Antonio's new census-acs / usda-soil / bls
  // files inherit exactly the same window as Austin's. That is correct
  // rather than convenient: a source's publication cadence is a property of
  // the source, and ACS, OEWS and SSURGO publish on one national schedule
  // for every county. No new entries are needed, and adding per-metro
  // duplicates would invite the two drifting apart.
  //
  //   census-acs  → 400d, ACS 5-year is annual for Bexar exactly as for Travis
  //   bls         → 400d, OEWS is annual for the San Antonio MSA as for Austin's
  //   usda-soil   → 400d, SSURGO is the same reference dataset either point

  // Round 19d. One `noaa-climate` file per metro now holds TWO kinds of row,
  // and the window has to be reasoned about for each — but only one of them can
  // ever drive it.
  //
  //   normal-1991-2020 — the fixed 30-year monthly normal. It does not go stale
  //     on any cadence this site cares about: NCEI republishes normals once a
  //     decade, so the next edition is the 2001-2030 series and that is years
  //     away. Its rows are dated to 2020, the last year of their own period, so
  //     if a file ever contained ONLY normals its newest observedAt would read
  //     about five years old and any sane window would flag it. That is why the
  //     fetcher throws rather than returning normals alone — a normals-only file
  //     is not a successful run, and the badge should never have to paper over
  //     one.
  //
  //   monthly-actual — GSOM, one row per complete calendar month. This is what
  //     the window is actually set for, because it is always the newest row.
  //
  // 120 days, made of four things that each have to fit:
  //   1. month-start dating — a row is dated to the 1st of the month it covers,
  //      so it is up to 31 days old the moment it is complete;
  //   2. THE CURRENT CALENDAR MONTH IS ALWAYS PARTIAL and the fetcher drops it
  //      (Round 15's lesson: a part-month total understates and reads as a real
  //      collapse in demand). That costs up to another 31 days by design;
  //   3. GSOM's own publication lag. NOT MEASURED — the probe characterised the
  //      endpoint, not its cadence — so this is a bound, not an observation.
  //      Revisit it against a few real runs;
  //   4. a missed weekly ingestion run.
  // It errs toward admitting staleness: too tight would badge a perfectly
  // current series as out of date every month, which is the failure mode that
  // matters here.
  "noaa-climate": 120 * DAY,

  // Round 22. SWDI nx3hail, radar-derived hail signatures.
  //
  // THIS IS THE ONE WINDOW IN THIS TABLE WHERE ABSENCE OF EVENTS AND FAILURE
  // OF THE FEED LOOK THE SAME. `dataThrough` is the newest SIGNATURE, not the
  // newest fetch — so a quiet winter and a broken fetcher both age the data
  // identically. `lastSuccessAt` is what distinguishes them, and DataStatus
  // renders it beside the badge; the age check cannot.
  //
  // Sized from what was measured rather than guessed: the Round 21b dispatch
  // found signatures in TWELVE OF TWELVE consecutive 31-day windows for both
  // metros — zero empty. So the longest observed gap is under 31 days, and 200
  // days is roughly six times that. It tolerates a full quiet season without
  // crying stale, which is the failure that would matter here: badging a
  // correct "no hail near the city lately" as a data problem teaches a reader
  // to distrust an honest empty state.
  //
  // Round 15's lesson applies to the CONSUMER, not to the fetcher: the current
  // 31-day window is always partial, so a count taken from it is a count so
  // far. No record is dropped for that — dropping a hail signature because the
  // month is unfinished would discard a real event — but nothing may compare a
  // partial window's count against a complete one.
  "swdi-nx3hail": 200 * DAY,

  // ── Cadence NOT established. These four are stub fetchers with sample
  // data, so they never reach the age check today (a `sample` file reports no
  // dates at all). Each carries the conservative 30-day window so that if one
  // is ever wired to a real source without revisiting this table, it errs
  // toward admitting staleness rather than claiming currency.
  // Round 8. Trade-activity aggregates are rebuilt from the same city tables
  // municipal-permits reads, on the same daily cadence. But each observation is
  // dated to the FIRST of the month it counts, so the newest row is up to a
  // month old by construction - the window has to absorb that or a perfectly
  // healthy feed would read as out of date on the 30th.
  "permit-trade-activity": 45 * DAY,

  ercot: 30 * DAY, // ERCOT load; real cadence unverified.
  "fema-nfhl": 30 * DAY, // NFHL flood layers; republication cadence unverified.
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
