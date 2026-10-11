/**
 * How far back each feed is re-requested on every run — the one place that
 * answers it, read by `computeFetchWindow`, by the fetcher that caps itself,
 * and by the drift probe.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Round 46 F2. `computeFetchWindow` set the incremental `since` to the NEWEST
 * observation's `observedAt`, so a revision to any older record was never
 * re-requested. `mergeObservations` replaces by key and `types.ts` names "a
 * corrected NOAA storm report" as its worked example — the correction mechanism
 * was fully built on the writing side and could only ever fire for one record.
 * `/data/texas/electricity-prices/` told readers, in rendered copy, that "the
 * newest one or two figures can move". Only the newest could.
 *
 * It also meant a series could never grow BACKWARDS. `eia-electricity` held
 * exactly twelve months because `backfillDays = 365` produced twelve on its
 * first run and the window has only moved forward since — which is why the
 * autoposter's year-over-year article has been halting: a twelve-month series
 * is always one month short of a year-over-year comparison on its newest month.
 *
 * ── HOW EACH VALUE WAS CHOSEN ─────────────────────────────────────────────
 * By the source's own revision behaviour, not by how fresh we would like the
 * data to be. The question each entry answers is: **how far back can this
 * source still change a record we have already stored?** Where a fetcher caps
 * its own request, the value MATCHES THAT CAP rather than exceeding it, so the
 * request and the cap agree instead of the window over-asking and the fetcher
 * silently clamping.
 *
 * ── COST, MEASURED ────────────────────────────────────────────────────────
 * The Round 47 drift probe ran the widest possible window — every feed's full
 * held history — across all 31 datasets in **73 seconds**, against **37
 * seconds** for the incremental window the same day. So the worst case is about
 * 2x wall time, and every value below is narrower than that worst case.
 *
 * That measurement covers **wall time and success only**. It does not measure
 * per-feed request counts against each source's rate limits, and nothing here
 * should be read as evidence about those.
 */

/** Days. Named so a bare number in the table below cannot be misread. */
const DAY = 1;

/**
 * `swdiHail` clamps every request to this, because SWDI said so in an error:
 * "maximum date range currently allowed is 744 hours". Exported so the fetcher,
 * the window and the probe all read ONE number — before Round 47 the fetcher
 * held it privately and the probe carried its own copy.
 */
export const SWDI_MAX_WINDOW_DAYS = 31 * DAY;

/**
 * How far back to re-request, per dataset id. Ids match
 * `src/data/data-sources.yaml` and `DatasetFile.datasetId`.
 */
export const REVISIT_DAYS: Record<string, number> = {
  // ── Sources that revise what they have already published ────────────────

  // The EIA revises recent months as utilities report, which the data page
  // states in rendered copy. 400 days also carries the series past thirteen
  // months, which is what a year-over-year comparison on the newest month
  // needs and what twelve months can never give.
  "eia-electricity": 400 * DAY,

  // NCEI revises storm reports, and `types.ts` uses exactly that as its
  // example of why keys replace in place. Cheap at any width: the fetcher
  // requests whole YEAR files, so 400 days is two requests rather than 400.
  "noaa-storm-events": 400 * DAY,

  // GSOM monthly actuals are revised after first publication. The 1991-2020
  // normals in the same file are not, and do not care how wide this is.
  "noaa-climate": 400 * DAY,

  // City permit tables are restated: Round 45 measured Austin's 2025-09 gaining
  // 114 HVAC permits that the incremental window had never revisited. Both of
  // these already recompute a 13-month window inside the fetcher
  // (`recountWindow`); this makes the outer window agree with it rather than
  // being quietly overridden.
  "municipal-permits": 400 * DAY,
  "permit-trade-activity": 400 * DAY,

  // Annual releases. Both already sit at their vintage date, so this changes
  // nothing today and stops a future vintage being unreachable.
  "census-acs": 800 * DAY,
  bls: 800 * DAY,

  // The U.S. Drought Monitor republishes a weekly map; revisions are rare and
  // recent when they happen. 30 days covers four maps.
  "usdm-drought": 30 * DAY,

  // ── A fetcher that caps itself. The value MATCHES the cap ────────────────
  //
  // Asking for more would not widen anything — `swdiHail` clamps to SWDI's
  // documented 744-hour ceiling — and would make the drift probe report every
  // older row as "absent" having never been requested. One number, three
  // readers.
  "swdi-nx3hail": SWDI_MAX_WINDOW_DAYS,

  // ── Sources with no history to revise ───────────────────────────────────
  //
  // These answer with the present. A wider window asks the same question and
  // gets the same answer, so it buys nothing and costs a request.
  "nws-api": 2 * DAY, // a forecast for today
  airnow: 2 * DAY, // hourly current conditions
  "austin-water-stage": 7 * DAY, // a scrape of the stage as it is now

  // One row per run, keyed by a digest of the whole table: a change makes a NEW
  // key rather than revising an old one, so there is nothing to re-request.
  "arr-collection-schedule": 2 * DAY,

  // Reference data under a point. `observedAt` is our query date, not an event
  // date (Round 46 F7), so "re-request the last N days" is not meaningful here;
  // the fetcher asks the same question each run regardless.
  "usda-soil": 2 * DAY,

  // ── Stubs. Kept explicit so wiring one to a real source forces a decision
  //    about its revision behaviour rather than inheriting a default ────────
  "fema-nfhl": 30 * DAY,
  "tdi-losses": 30 * DAY,
  ercot: 30 * DAY,
  "tx-forest-service": 30 * DAY,
};

/**
 * Fallback for a dataset id with no entry above.
 *
 * 400 days, deliberately GENEROUS, and the opposite choice from
 * `DEFAULT_MAX_DATA_AGE_DAYS` next door — which is conservative because a
 * forgotten entry there would claim currency the data does not have. Here a
 * forgotten entry means records that can never be corrected, which is the
 * failure this whole file exists to end. Forgetting should cost requests, not
 * correctness.
 */
export const DEFAULT_REVISIT_DAYS = 400 * DAY;

export function revisitDays(datasetId: string): number {
  return REVISIT_DAYS[datasetId] ?? DEFAULT_REVISIT_DAYS;
}
