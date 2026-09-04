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
 * ── THE TREND THRESHOLD ───────────────────────────────────────────────────
 * A permit count is a count of events, so its month-to-month wobble is
 * Poisson: the standard deviation of a monthly count with mean m is √m, which
 * is 100/√m as a percentage. A half-over-half change smaller than that is
 * indistinguishable from counting noise, and this module refuses to call it a
 * trend — `clearsThreshold` is false and the page says so rather than making
 * the claim. It is deliberately the conservative form: the noise on a
 * six-month SUM is smaller still (1/√6 of it), so testing the change against
 * the single-month figure sets a higher bar than the comparison strictly
 * needs.
 *
 * All arithmetic here is deterministic. No model output, ever (COST.md rule 2).
 */
import { findDataset, freshnessOf, type Freshness } from "./datasets";
import type { DatasetFile } from "../ingest/types";
import {
  SAN_ANTONIO_PERMIT_TYPE_MAP,
  AUSTIN_PERMIT_TYPE_MAP,
  type TradeCategory,
} from "../ingest/tradeCategories";

interface TradeObservation {
  category: string;
  month: string;
  permitCount: number;
  mappingVersion: string;
  mechanisms: string[];
  sourceValues: { value: string; count: number }[];
}

export interface SourceType {
  value: string;
  count: number;
}

export interface TradeActivity {
  category: string;
  location: string;
  /** Months present, oldest first. */
  months: { month: string; permitCount: number }[];
  monthCount: number;
  total: number;
  /** Rounded — a mean of counts is not a precise quantity. */
  meanPerMonth: number;
  firstHalf: number;
  secondHalf: number;
  /** Percent change, first half of the window to second. */
  changePct: number;
  /** 100/√mean — the counting-noise floor a claim must clear. */
  noisePct: number;
  /** True when |changePct| exceeds the noise floor. */
  clearsThreshold: boolean;
  /** "rose" | "fell" | "held roughly flat" — derived, never asserted. */
  direction: "rose" | "fell" | "flat";
  /** Highest-count months, highest first. */
  peakMonths: { month: string; permitCount: number }[];
  /** Lowest-count month in the window. */
  troughMonth: { month: string; permitCount: number };
  /**
   * Round 12. SEASONALITY IS A DIFFERENT QUESTION FROM TREND, and conflating
   * them produces a false claim. San Antonio roofing is the case that proves
   * it: half-over-half it is flat to 0.1%, well inside the noise floor, so no
   * trend is reportable — and yet the window runs 634 permits in one month and
   * 270 in another, a 2.3x swing that is nowhere near noise.
   *
   * Trend asks "is the second half different from the first". Seasonality asks
   * "is the peak different from the trough". A series can be dead flat on the
   * first and violently seasonal on the second, which is exactly what a roofing
   * series does: it rises and falls within the year and lands where it started.
   *
   * Tested the same way as the trend — against counting noise. The difference
   * between two Poisson counts has standard deviation sqrt(peak + trough), so
   * `amplitudeSigma` is how many of those the observed spread is. Above 2 the
   * spread cannot be explained by counting noise.
   */
  amplitude: {
    spread: number;
    ratio: number;
    sigma: number;
    /** True when the peak-to-trough spread exceeds counting noise. */
    significant: boolean;
  };
  /** The metro's own permit-type names that rolled into this category. */
  sourceTypes: SourceType[];
  /** How rows were classified: permit-type / work-class / description-text. */
  mechanisms: string[];
  mappingVersion: string;
  windowStart: string;
  windowEnd: string;
  /** Permit types the mapping assigns to this category, whether or not any
   * were issued in this window. `sourceTypes.length` is how many actually
   * issued — the two differ and the page must not conflate them. */
  mappedTypeCount: number;
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

  const rows = dataset.observations
    .filter((o) => !o.seed && o.value.category === category)
    .map((o) => o.value)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length === 0) return undefined;

  const months = rows.map((r) => ({ month: r.month, permitCount: r.permitCount }));
  const total = rows.reduce((s, r) => s + r.permitCount, 0);
  const n = rows.length;
  const mean = total / n;

  // Split into halves. An odd month count drops the middle month from both
  // sides rather than letting it land on one — a half-over-half comparison
  // with unequal denominators is not a comparison.
  const half = Math.floor(n / 2);
  const firstHalf = rows.slice(0, half).reduce((s, r) => s + r.permitCount, 0);
  const secondHalf = rows.slice(n - half).reduce((s, r) => s + r.permitCount, 0);
  const changePct = firstHalf === 0 ? 0 : ((secondHalf - firstHalf) / firstHalf) * 100;
  const noisePct = mean > 0 ? (100 * Math.sqrt(mean)) / mean : Infinity;
  const clearsThreshold = Math.abs(changePct) > noisePct;

  const sortedDesc = [...months].sort((a, b) => b.permitCount - a.permitCount);

  const agg = new Map<string, number>();
  for (const r of rows) {
    for (const s of r.sourceValues) agg.set(s.value, (agg.get(s.value) ?? 0) + s.count);
  }
  const sourceTypes = [...agg.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return {
    category,
    location,
    months,
    monthCount: n,
    total,
    meanPerMonth: Math.round(mean),
    firstHalf,
    secondHalf,
    changePct,
    noisePct,
    clearsThreshold,
    direction: !clearsThreshold ? "flat" : changePct > 0 ? "rose" : "fell",
    peakMonths: sortedDesc.slice(0, 3),
    troughMonth: sortedDesc[sortedDesc.length - 1],
    amplitude: (() => {
      const peak = sortedDesc[0].permitCount;
      const trough = sortedDesc[sortedDesc.length - 1].permitCount;
      const spread = peak - trough;
      const sigmaUnit = Math.sqrt(peak + trough);
      return {
        spread,
        ratio: trough > 0 ? peak / trough : Infinity,
        sigma: sigmaUnit > 0 ? spread / sigmaUnit : 0,
        significant: sigmaUnit > 0 && spread / sigmaUnit > 2,
      };
    })(),
    sourceTypes,
    mechanisms: [...new Set(rows.flatMap((r) => r.mechanisms))],
    mappingVersion: rows[0].mappingVersion,
    windowStart: months[0].month,
    windowEnd: months[n - 1].month,
    mappedTypeCount: mappedTypeCount(location, category),
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
