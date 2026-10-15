/**
 * Which months a figure may be computed from.
 *
 * ── WHY THIS IS ITS OWN MODULE ─────────────────────────────────────────────
 * Everything here is pure, and it is the layer that decides whether a figure
 * may be published at all — so it has to be testable without building the
 * site. `tradeActivity.ts` reaches the generated datasets through
 * `import.meta.glob`, which exists only under Vite, and anything importable
 * only through it can be checked by building the whole site and reading the
 * HTML back and no other way. Round 41a lifted `specObservations` out of its
 * barrel for exactly this reason, and that layer was deciding which ROWS a
 * page spoke for; this one decides which months a NUMBER speaks for.
 *
 * Re-exported from `tradeActivity.ts`; no caller of that module changed.
 */
import type { Discontinuity } from "../data/discontinuities";

/** One monthly row of `permit-trade-activity`, as stored. */
export interface TradeObservation {
  category: string;
  month: string;
  permitCount: number;
  mappingVersion: string;
  mechanisms: string[];
  sourceValues: { value: string; count: number }[];
}

/**
 * ── WHAT A BREAK DOES TO THESE FIGURES — ROUND 52 POLICY ──────────────────
 * A recorded source discontinuity (`src/data/discontinuities.ts`) is not a
 * caveat to print next to a number. It is a statement that the months on
 * either side of it were produced by different source behaviour, so a figure
 * computed across it is comparing two instruments.
 *
 * The owner's decision, measured in `docs/audits/round-52-discontinuities.md`:
 *
 *   • A MONTH-OVER-MONTH claim across a break is REFUSED and says why. There
 *     is no month-over-month figure on this surface — the site publishes a
 *     table of monthly counts and a half-over-half window — so that half of
 *     the policy lives where the claim is made: the autoposter's `_figure`,
 *     `_area_metric` and both article builders. `crossedBy.monthOverMonth` is the test, and is
 *     computed here so both readers share one span rule.
 *
 *   • A BASELINE is computed PER SIDE, never across. The window is sliced at
 *     every break it spans; each side gets its own `TradeComparison`; a side
 *     with fewer than `MIN_SEGMENT_MONTHS` complete months publishes nothing
 *     at all. The minimum governs a window that was CUT — an unbroken window
 *     is governed by whatever already governed it. The label alternative was
 *     rejected: a labelled cross-break mean is still a mean of two regimes,
 *     and a reader who quotes the number without the label — which is what an
 *     answer engine does — quotes a figure we knew was not comparable.
 *
 * The withheld case is therefore not a flag beside a number. There is no
 * number: `comparison` is undefined and `withheld` says why. A consumer
 * cannot publish a figure it was not given, which is the only form of this
 * rule that cannot fail open.
 */
export const MIN_SEGMENT_MONTHS = 6;

export interface SourceType {
  value: string;
  count: number;
}

/**
 * Everything derived from a run of months that share one source behaviour.
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
 */
export interface TradeComparison {
  /** The months this comparison speaks for, oldest first. Every figure below
   * is computed from exactly these — a page renders this table, not the whole
   * file, so a figure and the rows under it can never describe different
   * windows. */
  months: { month: string; permitCount: number }[];
  monthCount: number;
  windowStart: string;
  windowEnd: string;
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
  /** The metro's own permit-type names that rolled into this count — measured
   * over these months and no others, so the composition describes the figure
   * it sits beside. */
  sourceTypes: SourceType[];
}

/** Why a segment publishes nothing. */
export interface SegmentWithheld {
  monthCount: number;
  minimumMonths: number;
  reason: string;
}

/** One run of months between breaks. Exactly one of `comparison` /
 * `withheld` is set. */
export interface TradeSegment {
  fromMonth: string;
  toMonth: string;
  monthCount: number;
  /** The break that OPENS this segment — absent on the oldest one. */
  openedBy?: Discontinuity;
  comparison?: TradeComparison;
  withheld?: SegmentWithheld;
}

/**
 * ── SLICE AT EVERY BREAK, THEN COMPUTE ──────────────────────────────────────
 * Round 52, policy C. A break applies FROM its `fromMonth` onward, so that
 * month opens a segment and the month before it closes the previous one.
 *
 * The slicing IS the policy. There is no path through this module that
 * computes a mean, a half-over-half change or an amplitude over rows from both
 * sides of a break — not a path that computes one and labels it. A label is
 * advice; a slice is arithmetic.
 *
 * Exported and pure so the policy can be tested on rows this file constructs.
 * `tradeActivity()` reaches the generated datasets through `import.meta.glob`,
 * which exists only under Vite, so anything only reachable through it can be
 * checked by building the whole site and reading the HTML back and no other
 * way — the same reason Round 41a lifted `specObservations` out of its barrel.
 *
 * `rows` are oldest first; `breaks` are the breaks this window spans.
 */
export function segmentsOf(
  rows: TradeObservation[],
  breaks: Discontinuity[],
): TradeSegment[] {
  const cuts = [...new Set(breaks.map((d) => d.fromMonth))].sort();
  const slices: { openedBy?: Discontinuity; rows: TradeObservation[] }[] = [];
  let opened: Discontinuity | undefined;
  let remaining = rows;
  for (const cut of cuts) {
    const near = remaining.filter((r) => r.month < cut);
    if (near.length > 0) slices.push({ openedBy: opened, rows: near });
    remaining = remaining.filter((r) => r.month >= cut);
    opened = breaks.find((d) => d.fromMonth === cut);
  }
  if (remaining.length > 0) slices.push({ openedBy: opened, rows: remaining });

  return slices.map(({ openedBy, rows: seg }) => {
    const base = {
      fromMonth: seg[0].month,
      toMonth: seg[seg.length - 1].month,
      monthCount: seg.length,
      ...(openedBy ? { openedBy } : {}),
    };
    /**
     * The minimum applies to a window that WAS CUT, not to every window.
     *
     * A short unbroken window was publishable before this round and still is —
     * what governs it is the existing length gate, and raising that for every
     * series would be this round widening its own scope. What is new is that
     * the months on the far side of a break can no longer supplement the near
     * side, so a cut segment has to stand on its own months, and under six of
     * them a half-over-half comparison puts fewer than three on each side.
     *
     * Both readers draw the line in the same place: `thi_source.Series.withheld`
     * applies it to a series that spans a break and to no other, and
     * `test_discontinuities.py` reads the constant out of this file so the two
     * cannot drift.
     */
    if (breaks.length === 0 || seg.length >= MIN_SEGMENT_MONTHS) {
      return { ...base, comparison: compare(seg) };
    }
    return {
      ...base,
      withheld: {
        monthCount: seg.length,
        minimumMonths: MIN_SEGMENT_MONTHS,
        reason:
          `${seg.length} complete month${seg.length === 1 ? "" : "s"} ` +
          `(${base.fromMonth} to ${base.toMonth})` +
          (openedBy ? `, since the source change recorded at ${openedBy.fromMonth}` : "") +
          ` — under the ${MIN_SEGMENT_MONTHS}-month minimum a half-over-half comparison needs to ` +
          `put three months on each side. Nothing is derived from these months.`,
      },
    };
  });
}

/**
 * Everything derived from ONE run of months.
 *
 * Takes rows already restricted to a single side of every recorded break. It
 * has no way to check that and must never be handed a mixture — the slicing in
 * `tradeActivity()` is the only caller for exactly that reason.
 */
function compare(rows: TradeObservation[]): TradeComparison {
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
  const peak = sortedDesc[0].permitCount;
  const trough = sortedDesc[sortedDesc.length - 1].permitCount;
  const spread = peak - trough;
  const sigmaUnit = Math.sqrt(peak + trough);

  const agg = new Map<string, number>();
  for (const r of rows) {
    for (const s of r.sourceValues) agg.set(s.value, (agg.get(s.value) ?? 0) + s.count);
  }

  return {
    months,
    monthCount: n,
    windowStart: months[0].month,
    windowEnd: months[n - 1].month,
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
    amplitude: {
      spread,
      ratio: trough > 0 ? peak / trough : Infinity,
      sigma: sigmaUnit > 0 ? spread / sigmaUnit : 0,
      significant: sigmaUnit > 0 && spread / sigmaUnit > 2,
    },
    sourceTypes: [...agg.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
  };
}
