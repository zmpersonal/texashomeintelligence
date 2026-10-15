/**
 * Build-time readings over `permit-trade-activity`.
 *
 * Round 8 has been ingesting seven trade categories per metro, per month, with
 * provenance and a mapping version, since it landed — and until this round no
 * page read a single row of it.
 *
 * ── WHAT THIS MAY AND MAY NOT SAY ─────────────────────────────────────────
 * Permits are an ACTIVITY instrument, not a price instrument (CLAUDE.md's
 * engineering rules; measured end to end in
 * `docs/audits/round-6-permit-measurement.md`). Counts, timing, seasonality
 * and within-city trade mix are supported. No cost, price or "typical spend"
 * figure is derivable from this feed in either metro, and nothing here
 * computes one.
 *
 * Nor is anything compared ACROSS metros. Austin classifies partly by
 * description text and San Antonio entirely by permit type; the two are
 * different instruments pointed at different cities, and the owner's Round 8
 * decision was that each city gets the better reading its own source supports,
 * labelled for what it is.
 *
 * The threshold a trend claim must clear, and what a recorded source
 * discontinuity does to every figure here, are documented on
 * `TradeComparison` and `MIN_SEGMENT_MONTHS` below.
 *
 * All arithmetic here is deterministic. No model output, ever (COST.md rule 2).
 */
import { findDataset, freshnessOf, type Freshness } from "./datasets";
import { discontinuitiesCrossed, type Discontinuity } from "../data/discontinuities";
// The pure half — which months a figure may be computed from, and the figures
// themselves. Its own module so it is testable outside a Vite build; see its
// header. Re-exported below so this file stays the one import for callers.
import {
  MIN_SEGMENT_MONTHS,
  segmentsOf,
  type SegmentWithheld,
  type SourceType,
  type TradeComparison,
  type TradeObservation,
  type TradeSegment,
} from "./tradeSegments";
export {
  MIN_SEGMENT_MONTHS,
  segmentsOf,
  type SegmentWithheld,
  type SourceType,
  type TradeComparison,
  type TradeObservation,
  type TradeSegment,
};
// Round 10b: a module-scope `new Date()` reads 1970 under the Workers runtime
// Astro builds against. Anything needing the real build date uses this.
import { buildNow } from "../data/serviceNotices";
import type { DatasetFile } from "../ingest/types";
import {
  SAN_ANTONIO_PERMIT_TYPE_MAP,
  AUSTIN_PERMIT_TYPE_MAP,
  type TradeCategory,
} from "../ingest/tradeCategories";







export interface TradeActivity {
  category: string;
  location: string;
  /**
   * Breaks this window SPANS — Round 52. Built with the record rather than
   * after it: `discontinuities.ts` has a consumer from the day it exists,
   * because a recorded fact nothing consults is the defect this family keeps
   * producing (Round 46 a config key with no consumer, Round 49 a consumer
   * with no config, Round 50 a stored field with no reader).
   *
   * `spansDiscontinuity` is the one-line test a caller needs; `crossedBy` says
   * which computations cross, because they do not all cross the same breaks: a
   * month-over-month on two post-break months crosses nothing while the
   * window's mean crosses everything.
   */
  spansDiscontinuity: boolean;
  discontinuities: Discontinuity[];
  crossedBy: { window: Discontinuity[]; monthOverMonth: Discontinuity[] };
  /** The window cut at every break it spans, oldest first. One segment when it
   * spans none — in which case `segments[0].comparison` is the whole window and
   * every figure is what it was before this round. */
  segments: TradeSegment[];
  /** The newest segment's figures: what a page or a builder may publish now.
   * Undefined when that segment is too short to support them, and then
   * `withheld` says so. Nothing falls back to an older segment — history under
   * a retired source behaviour is not the current reading, and substituting it
   * would be the quiet wrong answer this policy exists to prevent. */
  comparison?: TradeComparison;
  withheld?: SegmentWithheld;
  /** How rows were classified: permit-type / work-class / description-text. */
  mechanisms: string[];
  mappingVersion: string;
  /** Every mapping version present on disk for this series, newest last. */
  mappingVersionsOnDisk: string[];
  /** Permit types the mapping assigns to this category, whether or not any
   * were issued in this window. `sourceTypes.length` is how many actually
   * issued — the two differ and the page must not conflate them. */
  mappedTypeCount: number;
  /** Months dropped because the calendar month had not finished at build time.
   * Reported so a page can say the window is complete rather than implying it. */
  droppedIncompleteMonths: string[];
  freshness: Freshness;
  dataset: DatasetFile<TradeObservation>;
}

const MAPS: Record<string, Record<string, TradeCategory | null>> = {
  "san-antonio": SAN_ANTONIO_PERMIT_TYPE_MAP,
  austin: AUSTIN_PERMIT_TYPE_MAP,
};

/** How many permit types the mapping assigns to this category in this metro. */
export function mappedTypeCount(location: string, category: string): number {
  const map = MAPS[location];
  if (!map) return 0;
  return Object.values(map).filter((c) => c === category).length;
}

export function tradeActivity(location: string, category: string): TradeActivity | undefined {
  const dataset = findDataset<TradeObservation>("permit-trade-activity", location);
  if (!dataset || dataset.status === "sample") return undefined;

  /**
   * ── DROP THE MONTH THAT HAS NOT FINISHED ──────────────────────────────
   * Round 15. The ingestion window runs to `now` (`computeFetchWindow`), so the
   * CURRENT calendar month is always present and always partial. San Antonio
   * never exposed this — its feed lags and its newest month is complete — but
   * Austin's does, and the damage is not subtle. Measured on 2026-09-04, with
   * four days of September in the file:
   *
   *   hvac      1,037 in August, 111 in September  →  an 11x "trough"
   *   solar       224 in August,   9 in September  →  a  25x "trough"
   *
   * Every one of those would have been reported as seasonality at 30σ, and the
   * half-over-half trend would have been dragged down by a sixth of the second
   * half being four days long. A partial month is not a quiet month.
   *
   * The rule is the one thing that is provable from the clock: a month that has
   * not ended cannot be complete. Nothing else is inferred — a month that is
   * merely sparse stays in.
   */
  const currentMonth = buildNow().toISOString().slice(0, 7);
  /**
   * ── ONE METHODOLOGY VERSION, NOT A MIXTURE ────────────────────────────
   * Round 45. `toObservations` keys every row `${mappingVersion}/${category}/
   * ${month}` and its comment promises that "a mapping change writes new keys
   * instead of overwriting counts computed under the old rules". The writing
   * half of that was true. The reading half did not exist: this function took
   * every observation for the category regardless of version, and reported
   * `rows[0].mappingVersion` as though one row could speak for all of them.
   *
   * So the first bump of that constant would have SUMMED the old and new rows
   * for every recounted month — a silent doubling, presented under whichever
   * version happened to sort first. The mechanism that was supposed to protect
   * a methodology change was the thing that would have broken it.
   *
   * Round 45 is that first bump (`trades-v1` → `trades-v2`, row counts → distinct
   * permit counts), so the reading half is built here: take the newest version
   * present and nothing else. Older rows stay on disk as history — "store
   * history, never overwrite" — and stop being published.
   */
  const forCategory = dataset.observations
    .filter((o) => !o.seed && o.value.category === category)
    .map((o) => o.value);
  const versions = [...new Set(forCategory.map((v) => v.mappingVersion))].sort();
  const newest = versions.at(-1);
  const all = forCategory
    .filter((v) => v.mappingVersion === newest)
    .sort((a, b) => a.month.localeCompare(b.month));
  const droppedIncompleteMonths = all.filter((r) => r.month >= currentMonth).map((r) => r.month);
  const rows = all.filter((r) => r.month < currentMonth);
  if (rows.length === 0) return undefined;

  // Round 52. The whole window, and separately the last two months — the span a
  // month-over-month claim actually makes.
  const windowBreaks = discontinuitiesCrossed(
    "permit-trade-activity", location, category,
    rows[0].month, rows[rows.length - 1].month);
  const momBreaks = rows.length >= 2
    ? discontinuitiesCrossed("permit-trade-activity", location, category,
                             rows[rows.length - 2].month, rows[rows.length - 1].month)
    : [];

  const segments = segmentsOf(rows, windowBreaks);
  const current = segments[segments.length - 1];

  return {
    category,
    location,
    spansDiscontinuity: windowBreaks.length > 0,
    discontinuities: windowBreaks,
    crossedBy: { window: windowBreaks, monthOverMonth: momBreaks },
    segments,
    // Exactly one of the two, and the withheld case carries no number at all.
    ...(current.comparison
      ? { comparison: current.comparison }
      : { withheld: current.withheld }),
    mechanisms: [...new Set(rows.flatMap((r) => r.mechanisms))],
    // Safe now that `all` is filtered to one version — and asserted, because
    // "rows[0] speaks for all of them" is exactly the assumption that made the
    // version mechanism decorative.
    mappingVersion: newest ?? rows[0].mappingVersion,
    mappingVersionsOnDisk: versions,
    mappedTypeCount: mappedTypeCount(location, category),
    droppedIncompleteMonths,
    freshness: freshnessOf(dataset),
    dataset,
  };
}

/** "September 2025" from "2025-09". Months are month-precision keys, not
 * timestamps, so this must not go through Date and pick up a timezone. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}
/** "2025-09" -> "2025-09-01", for <time datetime>. */
export function monthDatetime(month: string): string {
  return `${month}-01`;
}

/** A percentage, rounded the way the page states it. Counts do not support
 * decimals beyond one place, and one place is already generous. */
export function pct(n: number): string {
  return `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
}
