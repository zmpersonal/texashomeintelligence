/**
 * THE RULE. A reason to look at a series, and never a record of anything.
 *
 * Round 53 measured whether the description fingerprint in `ingest/descriptionShape.ts` would
 * have caught Austin's battery-storage break in 2026-07. It would have, by one rule, which is
 * this one. The full measurement is `docs/audits/round-53-fingerprint.md`; the probe's output is
 * `docs/audits/round-53-fingerprint.json` and the 612-rule sweep is `round-53-rules.json`.
 *
 * ══ A FLAG IS A SUSPICION. A DISCONTINUITY IS A RECORD. ═════════════════════
 * This is the owner's condition above the detector working at all, and it is enforced by the
 * types rather than by anyone remembering it.
 *
 * `ShapeFlag` has no `what`, no `cause`, no `discoveredAt` and no `evidence`. A
 * `Discontinuity` (`src/data/discontinuities.ts`) requires all four, and its `evidence` is typed
 * `readonly [DiscontinuityEvidence, ...DiscontinuityEvidence[]]` — a non-empty tuple, so
 * `evidence: []` is a compile error (Round 52 proved it). A flag is therefore **not assignable**
 * to a `Discontinuity`: passing one where a record is expected does not typecheck, and no
 * function in this module or any other converts between them. `discontinuityunit.ts` §7 asserts
 * the absence of that path, and that no record may cite a generated file as its only evidence —
 * so a record always points at something a human put in the repo.
 *
 * What a flag licenses is the Round 51 investigation: go to the source, find out what changed,
 * retrieve something dated that establishes it, and only then write a record. A flag that became
 * a record on its own would be recording a rumour, which is the thing Round 52 made structurally
 * impossible and this must not undo.
 *
 * It is also NOT A GATE. Nothing here is read by `tradeActivity()`, by any page, or by any
 * builder deciding what to publish; a flagged series publishes exactly what it published before.
 * `shapeflagunit.ts` asserts that too, because "it's only a detector" is the kind of claim that
 * quietly stops being true.
 */
import type { DescriptionShape } from "../ingest/descriptionShape";

/**
 * ══ THE THRESHOLDS, AND WHAT THEY ARE COMPENSATING FOR ══════════════════════
 *
 * This project's standing rule is that a tuned number says what it is compensating for. These
 * two are worse than tuned: they are a boundary that **nearly did not separate**, and the next
 * person to touch them is adjusting that boundary rather than rounding a number.
 *
 * The arithmetic, measured over 60 evaluable cells — 6 Austin categories × 10 complete months,
 * 47,599 rows (`round-53-rules.json`):
 *
 *   the break, on today's categories   energy_storage/2026-07   4.12×   0.41×   FLAGGED
 *   the break, as it was visible THEN  v2_solar/2026-07         2.97×   0.78×   FLAGGED
 *   the nearest declined cell          hvac/2026-07             1.25×   0.79×   declined
 *   declined, concentration only       roofing/2026-01          2.55×   0.86×   declined
 *   declined, concentration only       roofing/2026-06          2.55×   0.91×   declined
 *   declined, concentration only       electrical/2026-08       5.24×   0.96×   declined
 *   declined, concentration only       electrical/2026-09       2.49×   0.91×   declined
 *
 * Read the first three rows together. On today's categories the break clears the diversity test
 * with room to spare — 0.41 against 0.80. On the mapping that was actually live when it
 * happened, it cleared by **0.78 against 0.80, with an innocent cell sitting at 0.79.** One
 * percentage point of separation, on one of the two axes, in the one case that mattered.
 *
 * So:
 *
 *  1. **It is a conjunction or it is nothing.** Concentration alone fires on roofing twice and
 *     electrical twice; diversity alone fires on HVAC. Every declined cell in thirteen months
 *     fails exactly one of the two tests, several of them narrowly. Loosening either half does
 *     not make this more sensitive — it makes it a different, noisier detector.
 *  2. **`MIN_PERMITS` must stay at or below 29.** The break month held 29 permits. All 153 swept
 *     rules with an n floor of 30 miss it. 0, 10 and 20 were identical on this window; 10 is
 *     here only to keep a two-permit month from producing arithmetic nobody should read.
 *  3. **The margin is reported on every run and is not to be absorbed.** `evaluateShapeFlags`
 *     returns `margin`, which names the flagged cell closest to the boundary and the declined
 *     cell closest to it, and compares the gap between them against `ROUND_53_SEPARATION`.
 *     `tighterThanRound53` going true means a later month has crowded the boundary, and the
 *     answer to that is to re-measure and say so — not to nudge a threshold until it reads
 *     clean. Round 53's own numbers are frozen here precisely so a later run can be set against
 *     them.
 */
export const CONCENTRATION_RATIO = 2;
export const DIVERSITY_RATIO = 0.8;
export const MIN_PERMITS = 10;
/** Months of the same category that form the baseline. Three, as measured. */
export const TRAILING_MONTHS = 3;

/** Round 53's measured separation, frozen. The comparison a later run is read against. */
export const ROUND_53_SEPARATION = {
  measuredOn: "60 cells — 6 Austin categories × 10 complete months, 47,599 rows",
  break: { cell: "energy_storage/2026-07", concentration: 4.12, diversity: 0.41 },
  breakAsSeenAtTheTime: { cell: "v2_solar/2026-07", concentration: 2.97, diversity: 0.78 },
  nearestDeclined: { cell: "hvac/2026-07", concentration: 1.25, diversity: 0.79 },
  /** 0.79 − 0.78. The whole separation, on the axis that carried it, at the time. */
  diversityGap: 0.01,
} as const;

/**
 * ══ WHAT THIS CANNOT SEE ════════════════════════════════════════════════════
 * Carried in the output, not only in the audit, because the reader of a flag is the person who
 * needs it: a detector's reach is the part people forget, and a flag that arrives without it
 * reads as covering everything.
 */
export const REACH = {
  metros: ["austin"],
  seriesCovered: 6,
  seriesTotal: 13,
  sanAntonio:
    "San Antonio's permit export has no description column at all, so there is nothing to " +
    "fingerprint and no San Antonio series is covered. Its analogue is the permit-type mix — " +
    "backlog item 36. Absence of a flag there is absence of a measurement, not absence of a break.",
  detectsOnly:
    "changes that TEMPLATE wording. A source that re-words diversely, renames a permit type or " +
    "stops publishing a field leaves shape concentration untouched and will not be flagged.",
  blindSpotMeasured:
    "the same break can be visible in a SECOND category without being flagged there. Austin's " +
    "Auxiliary Power EPs are also electrical permits, so the templated wording entered " +
    "electrical too: 5.24× concentration in 2026-08 with diversity at 0.96× — declined, on " +
    "purpose, because a rule loose enough to catch it also fires on roofing 2026-01 and " +
    "2026-06. Read a flag on one category as 'at least here', never as 'only here'.",
  earliest:
    "the first COMPLETE month after a change, which is the earliest anything can be under the " +
    "completeness rule the readers already apply.",
} as const;

/** One category-month, as stored by the ingest.
 *
 * `category` accepts `null` because that is exactly what the stored values hold: Round 50's
 * all-trades row carries no category, and it is skipped below. Taking the stored type rather
 * than a narrowed copy of it means this is handed the real rows, not a transcription of them. */
export interface ShapeRow {
  category: string | null;
  month: string;
  permitCount: number;
  shape?: DescriptionShape;
}

/** The rule's inputs and verdict for one cell. Stored on the observation by the ingest. */
export interface ShapeVerdict {
  trailingTopShare: number | null;
  trailingShapesPerPermit: number | null;
  concentrationRatio: number | null;
  diversityRatio: number | null;
  /** Which of the two tests this cell passes. Both ⇒ flagged; exactly one ⇒ a near miss. */
  passed: ("concentration" | "diversity")[];
  flagged: boolean;
  /** Why it was not evaluated at all, when it was not. */
  notEvaluated?:
    | "no-description-column"
    | "no-trailing-baseline"
    | "too-few-permits"
    | "incomplete-month";
}

/**
 * A SUSPICION. Deliberately missing everything a `Discontinuity` requires — see this module's
 * header. There is no code path from one to the other, and the type is what makes that true.
 */
export interface ShapeFlag {
  category: string;
  month: string;
  permits: number;
  topShapeShare: number;
  trailingTopShare: number;
  concentrationRatio: number;
  shapesPerPermit: number;
  trailingShapesPerPermit: number;
  diversityRatio: number;
  /** How far inside the boundary it landed, per axis. Small numbers are the point. */
  margin: { concentration: number; diversity: number };
  status: "suspicion";
  nextStep: string;
}

/** A cell that passes one test and fails the other. The electrical leak lives here. */
export interface ShapeNearMiss {
  category: string;
  month: string;
  permits: number;
  concentrationRatio: number;
  diversityRatio: number;
  passed: "concentration" | "diversity";
  declined: string;
}

export interface MarginReport {
  thresholds: { concentrationRatio: number; diversityRatio: number; minPermits: number };
  /** The flagged cell closest to the boundary on the diversity axis. */
  closestFlagged: { cell: string; concentrationRatio: number; diversityRatio: number } | null;
  /** The declined cell closest to the boundary on the diversity axis. */
  closestDeclined: { cell: string; concentrationRatio: number; diversityRatio: number } | null;
  /** closestDeclined.diversity − closestFlagged.diversity, when both exist. */
  diversityGap: number | null;
  round53: typeof ROUND_53_SEPARATION;
  /** True when this window separates the two populations by LESS than Round 53 did. */
  tighterThanRound53: boolean;
  note: string;
}

export interface ShapeEvaluation {
  /** Keyed `${category} ${month}`, for the ingest to store on each observation. */
  byCell: Map<string, ShapeVerdict>;
  flags: ShapeFlag[];
  nearMisses: ShapeNearMiss[];
  margin: MarginReport;
  coverage: {
    cells: number;
    evaluated: number;
    withoutDescriptionColumn: number;
    withoutTrailingBaseline: number;
    tooFewPermits: number;
    incompleteMonth: number;
  };
  reach: typeof REACH;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const round = (x: number, places = 3): number => +x.toFixed(places);

/**
 * The rule, applied to one window of stored rows.
 *
 * Pure, and in a module that imports no dataset: `tradeActivity.ts` reaches the generated files
 * through `import.meta.glob`, which exists only under Vite, so anything importable only through
 * it can be checked by building the whole site and reading the HTML back and no other way
 * (Round 41a, Round 53). The ingest calls this with the rows it has just built — where the whole
 * thirteen-month window is already in memory, which is the structural reason the trailing
 * baseline needs nothing retained between runs — and a replay calls it with rows read off disk.
 */
export function evaluateShapeFlags(
  rows: readonly ShapeRow[],
  /**
   * The calendar month the run is in, `YYYY-MM`. Cells from it onward are not evaluated.
   *
   * Round 15's rule, which every other reader of this dataset already applies: a month that has
   * not ended cannot be complete, and a part-month's wording mix is not a month's. Round 53's
   * analysis dropped 2026-10 for exactly this reason. Optional so a replay can evaluate a fixed
   * historical window, which is the only caller that should omit it.
   */
  currentMonth?: string,
): ShapeEvaluation {
  const byCategory = new Map<string, ShapeRow[]>();
  for (const r of rows) {
    if (r.category === null || r.category === undefined) continue;
    byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  }
  for (const [, list] of byCategory) list.sort((a, b) => a.month.localeCompare(b.month));

  const byCell = new Map<string, ShapeVerdict>();
  const flags: ShapeFlag[] = [];
  const nearMisses: ShapeNearMiss[] = [];
  const coverage = {
    cells: 0,
    evaluated: 0,
    withoutDescriptionColumn: 0,
    withoutTrailingBaseline: 0,
    tooFewPermits: 0,
    incompleteMonth: 0,
  };

  for (const [category, list] of byCategory) {
    list.forEach((row, i) => {
      coverage.cells++;
      const key = `${category} ${row.month}`;
      const blank: ShapeVerdict = {
        trailingTopShare: null,
        trailingShapesPerPermit: null,
        concentrationRatio: null,
        diversityRatio: null,
        passed: [],
        flagged: false,
      };

      if (currentMonth !== undefined && row.month >= currentMonth) {
        coverage.incompleteMonth++;
        byCell.set(key, { ...blank, notEvaluated: "incomplete-month" });
        return;
      }
      const shape = row.shape;
      if (!shape || shape.topShapeShare === null || shape.shapesPerPermit === null) {
        coverage.withoutDescriptionColumn++;
        byCell.set(key, { ...blank, notEvaluated: "no-description-column" });
        return;
      }
      const prior = list.slice(Math.max(0, i - TRAILING_MONTHS), i);
      const usable = prior.filter(
        (p) => p.shape && p.shape.topShapeShare !== null && p.shape.shapesPerPermit !== null,
      );
      if (i < TRAILING_MONTHS || usable.length < TRAILING_MONTHS) {
        coverage.withoutTrailingBaseline++;
        byCell.set(key, { ...blank, notEvaluated: "no-trailing-baseline" });
        return;
      }
      const trailingTopShare = mean(usable.map((p) => p.shape!.topShapeShare!));
      const trailingShapesPerPermit = mean(usable.map((p) => p.shape!.shapesPerPermit!));
      const concentrationRatio =
        trailingTopShare > 0 ? round(shape.topShapeShare / trailingTopShare) : null;
      const diversityRatio =
        trailingShapesPerPermit > 0 ? round(shape.shapesPerPermit / trailingShapesPerPermit) : null;

      if (row.permitCount < MIN_PERMITS) {
        coverage.tooFewPermits++;
        byCell.set(key, {
          ...blank,
          trailingTopShare: round(trailingTopShare, 1),
          trailingShapesPerPermit: round(trailingShapesPerPermit),
          concentrationRatio,
          diversityRatio,
          notEvaluated: "too-few-permits",
        });
        return;
      }

      coverage.evaluated++;
      const passed: ("concentration" | "diversity")[] = [];
      if (concentrationRatio !== null && concentrationRatio >= CONCENTRATION_RATIO) {
        passed.push("concentration");
      }
      if (diversityRatio !== null && diversityRatio <= DIVERSITY_RATIO) passed.push("diversity");
      const flagged = passed.length === 2;
      byCell.set(key, {
        trailingTopShare: round(trailingTopShare, 1),
        trailingShapesPerPermit: round(trailingShapesPerPermit),
        concentrationRatio,
        diversityRatio,
        passed,
        flagged,
      });

      if (flagged && concentrationRatio !== null && diversityRatio !== null) {
        flags.push({
          category,
          month: row.month,
          permits: row.permitCount,
          topShapeShare: shape.topShapeShare,
          trailingTopShare: round(trailingTopShare, 1),
          concentrationRatio,
          shapesPerPermit: shape.shapesPerPermit,
          trailingShapesPerPermit: round(trailingShapesPerPermit),
          diversityRatio,
          margin: {
            concentration: round(concentrationRatio - CONCENTRATION_RATIO),
            diversity: round(DIVERSITY_RATIO - diversityRatio),
          },
          status: "suspicion",
          nextStep:
            "A REASON TO LOOK, not a finding and not a record. The descriptions in this " +
            "category-month collapsed onto a few wordings against its own recent history. " +
            "Establish what the source changed (Round 51 is the worked example: the city's own " +
            "manual, retrieved and dated), and only then write a discontinuity — which requires " +
            "evidence that resolves in the repo. Nothing may be withheld or relabelled on this " +
            "alone.",
        });
      } else if (passed.length === 1 && concentrationRatio !== null && diversityRatio !== null) {
        nearMisses.push({
          category,
          month: row.month,
          permits: row.permitCount,
          concentrationRatio,
          diversityRatio,
          passed: passed[0],
          declined:
            passed[0] === "concentration"
              ? `concentration ${concentrationRatio}× cleared ${CONCENTRATION_RATIO}×, but ` +
                `diversity ${diversityRatio}× did not reach ${DIVERSITY_RATIO}× — a batch of ` +
                `similarly worded permits looks like this; so does the same break seen in a ` +
                `second category (see reach.blindSpotMeasured)`
              : `diversity ${diversityRatio}× cleared ${DIVERSITY_RATIO}×, but concentration ` +
                `${concentrationRatio}× did not reach ${CONCENTRATION_RATIO}×`,
        });
      }
    });
  }

  // ── THE MARGIN, REPORTED EVERY RUN ──────────────────────────────────────
  // Both populations' closest approach to the boundary on the axis that carried the separation
  // in the one case that mattered. Surfaced rather than absorbed: see the thresholds comment.
  const evaluatedCells = [...byCell.entries()].filter(([, v]) => v.notEvaluated === undefined);
  const flaggedCells = evaluatedCells.filter(([, v]) => v.flagged);
  const declinedCells = evaluatedCells.filter(([, v]) => !v.flagged && v.diversityRatio !== null);
  const closest = (
    list: [string, ShapeVerdict][],
    pick: (a: number, b: number) => number,
  ): { cell: string; concentrationRatio: number; diversityRatio: number } | null => {
    if (list.length === 0) return null;
    const best = list.reduce((acc, cur) =>
      pick(cur[1].diversityRatio ?? 0, acc[1].diversityRatio ?? 0) === (cur[1].diversityRatio ?? 0)
        ? cur
        : acc,
    );
    return {
      cell: best[0].replace(" ", "/"),
      concentrationRatio: best[1].concentrationRatio ?? 0,
      diversityRatio: best[1].diversityRatio ?? 0,
    };
  };
  const closestFlagged = closest(flaggedCells, Math.max);
  const closestDeclined = closest(declinedCells, Math.min);
  const diversityGap =
    closestFlagged && closestDeclined
      ? round(closestDeclined.diversityRatio - closestFlagged.diversityRatio)
      : null;

  const margin: MarginReport = {
    thresholds: {
      concentrationRatio: CONCENTRATION_RATIO,
      diversityRatio: DIVERSITY_RATIO,
      minPermits: MIN_PERMITS,
    },
    closestFlagged,
    closestDeclined,
    diversityGap,
    round53: ROUND_53_SEPARATION,
    tighterThanRound53: diversityGap !== null && diversityGap < ROUND_53_SEPARATION.diversityGap,
    note:
      "The diversity axis carried the whole separation in the only case that mattered: the break " +
      "as it was visible at the time cleared at 0.78 with an innocent cell at 0.79. " +
      "`diversityGap` is this window's version of that 0.01. If it narrows, the detector is " +
      "closer to firing on an ordinary month than it was when it was measured — re-measure and " +
      "say so; do not move the threshold until it reads clean.",
  };

  return { byCell, flags, nearMisses, margin, coverage, reach: REACH };
}

/** One line per flag, for a notice a person actually reads. No numerals invented here. */
export function describeFlag(f: ShapeFlag): string {
  return (
    `${f.category}/${f.month}: descriptions templated — the commonest wording covers ` +
    `${f.topShapeShare}% of ${f.permits} permits against a ${f.trailingTopShare}% trailing ` +
    `average (${f.concentrationRatio}×), and distinct wordings per permit fell to ` +
    `${f.shapesPerPermit} from ${f.trailingShapesPerPermit} (${f.diversityRatio}×). ` +
    `A reason to look, not a finding.`
  );
}
