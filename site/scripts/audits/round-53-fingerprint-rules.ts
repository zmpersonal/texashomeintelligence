/**
 * Round 53 — what a RULE over the fingerprint would have done. MEASUREMENT ONLY, OFFLINE.
 *
 * Reads `docs/audits/round-53-fingerprint.json` (committed by the probe) and nothing else. No
 * network, no datasets, no ingestion. It exists so the rule can be re-stated and re-swept
 * without re-reading the source — the probe measured, this decides what the measurement means.
 *
 * Two questions, in the owner's order:
 *
 *  1. Would it have fired on `energy_storage` in 2026-07, the one break we know about? If not,
 *     the answer is no and nothing below matters.
 *  2. Would it have fired anywhere else in the thirteen months we hold? A detector that trips
 *     on ordinary vocabulary drift is worse than none, because it teaches people to ignore it.
 *
 * ── WHAT IS EVALUABLE ───────────────────────────────────────────────────────
 * A cell is (category, month). It is evaluable only when:
 *   · the month is COMPLETE — 2026-10 is dropped, the same rule `tradeActivity()` and
 *     `thi_source` already apply, because a partial month's wording mix is not a month's; and
 *   · three prior months of the same category exist to form the trailing baseline, which the
 *     probe reports as `newTokenShare: null`.
 * Everything else is reported as not-evaluated rather than silently excluded.
 *
 * ── THE SWEEP, AND WHY IT IS A SWEEP ────────────────────────────────────────
 * Any threshold here is a tuned number, and this project's standing rule is that a tuned
 * number says what it is compensating for. So no single threshold is presented as the answer:
 * every combination is run, and what gets reported is the whole surface — which combinations
 * catch the known break, how many other cells each one fires on, and which. If the answer
 * depends on a knife-edge threshold, that is visible rather than hidden.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../../../docs/audits/round-53-fingerprint.json", import.meta.url);
const OUT = new URL("../../../docs/audits/round-53-rules.json", import.meta.url);

interface Cell {
  category: string;
  month: string;
  permits: number;
  withDescription: number;
  distinctShapes: number;
  shapesPerPermit: number | null;
  topShapeShare: number | null;
  top3ShapeShare: number | null;
  distinctTokens: number;
  newTokenShare: number | null;
  jaccardVsTrailing: number | null;
}

const fingerprint = JSON.parse(readFileSync(SRC, "utf8")) as {
  window: { since: string; until: string; rowsRead: number };
  byCategoryMonth: Cell[];
  /** The pre-Round-50 solar bucket, reconstructed by the probe. Not a published series. */
  v2SolarByMonth?: Cell[];
};

/** The break this round is testing against. */
const KNOWN = { category: "energy_storage", month: "2026-07" };

const cells = fingerprint.byCategoryMonth;
const months = [...new Set(cells.map((c) => c.month))].sort();
/** The newest month in the window is partial — the probe ran mid-month. */
const partial = months[months.length - 1];
const byCat = new Map<string, Cell[]>();
for (const c of cells) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c]);
for (const [, list] of byCat) list.sort((a, b) => a.month.localeCompare(b.month));

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

interface Evaluable {
  cell: Cell;
  trailingTopShare: number;
  trailingShapesPerPermit: number;
  trailingNewTokenShare: number | null;
  /** How much the count itself moved, so a shape move can be set against a volume move. */
  countChangePct: number | null;
}

function buildEvaluable(
  series: Map<string, Cell[]>,
  evaluable: Evaluable[],
  skipped: { category: string; month: string; why: string }[],
): void {
for (const [category, list] of series) {
  list.forEach((cell, i) => {
    if (cell.month === partial) {
      skipped.push({ category, month: cell.month, why: "incomplete month at measurement time" });
      return;
    }
    if (i < 3) {
      skipped.push({ category, month: cell.month, why: "fewer than three prior months" });
      return;
    }
    const prior = list.slice(i - 3, i);
    const top = prior.map((p) => p.topShapeShare ?? 0);
    const spp = prior.map((p) => p.shapesPerPermit ?? 0);
    const nts = prior.map((p) => p.newTokenShare).filter((x): x is number => x !== null);
    evaluable.push({
      cell,
      trailingTopShare: mean(top),
      trailingShapesPerPermit: mean(spp),
      trailingNewTokenShare: nts.length === 3 ? mean(nts) : null,
      countChangePct:
        list[i - 1].permits > 0
          ? +(((cell.permits - list[i - 1].permits) / list[i - 1].permits) * 100).toFixed(1)
          : null,
    });
  });
}
}

const evaluable: Evaluable[] = [];
const skipped: { category: string; month: string; why: string }[] = [];
buildEvaluable(byCat, evaluable, skipped);

/* The same pipeline over the reconstructed v2 solar bucket, kept out of the 60 published
 * cells: it is not a series we publish, it is the series the detector would have been
 * watching in August, when the storage rows were still inside solar. */
const v2 = new Map<string, Cell[]>();
if (fingerprint.v2SolarByMonth?.length) {
  v2.set("v2_solar", [...fingerprint.v2SolarByMonth].sort((a, b) => a.month.localeCompare(b.month)));
}
const v2Evaluable: Evaluable[] = [];
buildEvaluable(v2, v2Evaluable, []);

/** One candidate rule. Every parameter is named in the output with its value. */
interface Rule {
  minPermits: number;
  topSharePoints: number | null;
  topShareRatio: number | null;
  diversityFactor: number | null;
  newTokenPoints: number | null;
}
const fires = (r: Rule, e: Evaluable): boolean => {
  const c = e.cell;
  if (c.permits < r.minPermits) return false;
  const top = c.topShapeShare ?? 0;
  if (r.topSharePoints !== null && !(top >= e.trailingTopShare + r.topSharePoints)) return false;
  if (r.topShareRatio !== null) {
    if (e.trailingTopShare <= 0) return false;
    if (!(top / e.trailingTopShare >= r.topShareRatio)) return false;
  }
  if (r.diversityFactor !== null) {
    const spp = c.shapesPerPermit ?? 1;
    if (!(spp <= e.trailingShapesPerPermit * r.diversityFactor)) return false;
  }
  if (r.newTokenPoints !== null) {
    if (e.trailingNewTokenShare === null) return false;
    if (!((c.newTokenShare ?? 0) >= e.trailingNewTokenShare + r.newTokenPoints)) return false;
  }
  return true;
};

const label = (r: Rule): string =>
  [
    `n≥${r.minPermits}`,
    r.topSharePoints !== null ? `top+${r.topSharePoints}pt` : null,
    r.topShareRatio !== null ? `top×${r.topShareRatio}` : null,
    r.diversityFactor !== null ? `diversity≤${r.diversityFactor}×` : null,
    r.newTokenPoints !== null ? `newTokens+${r.newTokenPoints}pt` : null,
  ]
    .filter(Boolean)
    .join(" & ");

const SWEEP: Rule[] = [];
for (const minPermits of [0, 10, 20, 30]) {
  for (const topSharePoints of [null, 10, 15, 20, 25, 30]) {
    for (const topShareRatio of [null, 1.5, 2, 2.5, 3]) {
      for (const diversityFactor of [null, 0.5, 0.6, 0.7, 0.8]) {
        if (topSharePoints === null && topShareRatio === null && diversityFactor === null) continue;
        SWEEP.push({
          minPermits,
          topSharePoints,
          topShareRatio,
          diversityFactor,
          newTokenPoints: null,
        });
      }
    }
  }
}
// The vocabulary half of the proposal, swept on its own so it can be judged on its own.
for (const minPermits of [0, 10, 20, 30]) {
  for (const newTokenPoints of [5, 10, 15, 20]) {
    SWEEP.push({
      minPermits,
      topSharePoints: null,
      topShareRatio: null,
      diversityFactor: null,
      newTokenPoints,
    });
  }
}

const results = SWEEP.map((rule) => {
  const hit = evaluable.filter((e) => fires(rule, e));
  const caughtKnown = hit.some(
    (e) => e.cell.category === KNOWN.category && e.cell.month === KNOWN.month,
  );
  return {
    rule: label(rule),
    parameters: rule,
    caughtKnownBreak: caughtKnown,
    totalCellsFired: hit.length,
    otherCellsFired: hit.filter(
      (e) => !(e.cell.category === KNOWN.category && e.cell.month === KNOWN.month),
    ).length,
    firedOn: hit.map((e) => `${e.cell.category}/${e.cell.month}(n=${e.cell.permits})`),
  };
});

/** The cleanest rules: they catch the break and fire on the fewest other cells. */
const catching = results.filter((r) => r.caughtKnownBreak);
const bestOtherCount = catching.length ? Math.min(...catching.map((r) => r.otherCellsFired)) : null;

/**
 * THE CONTROL, with the population it could not have seen named.
 *
 * A fingerprint that fired whenever a count moved would be measuring the count. So the two
 * cells with near-identical count moves and opposite fingerprints are reported side by side:
 * every evaluable cell whose month-over-month count move is within 20 points of the known
 * break's, with what its shape statistics did.
 */
const known = evaluable.find(
  (e) => e.cell.category === KNOWN.category && e.cell.month === KNOWN.month,
);
const control = known?.countChangePct
  ? evaluable
      .filter(
        (e) =>
          e.countChangePct !== null &&
          Math.abs(e.countChangePct - (known.countChangePct ?? 0)) <= 20 &&
          !(e.cell.category === KNOWN.category && e.cell.month === KNOWN.month),
      )
      .map((e) => ({
        cell: `${e.cell.category}/${e.cell.month}`,
        permits: e.cell.permits,
        countChangePct: e.countChangePct,
        topShapeShare: e.cell.topShapeShare,
        trailingTopShare: +e.trailingTopShare.toFixed(1),
        shapesPerPermit: e.cell.shapesPerPermit,
        trailingShapesPerPermit: +e.trailingShapesPerPermit.toFixed(3),
      }))
  : [];

/**
 * THE HARD READING OF QUESTION 1. Under the mapping live in August the templated rows were
 * inside `solar`, diluted by every genuine solar permit. For each rule that catches the break
 * on today's categories, did it also catch it on what was actually being watched then?
 */
const v2July = v2Evaluable.find((e) => e.cell.month === KNOWN.month);
const v2Verdict = SWEEP.map((rule) => ({
  rule: label(rule),
  caughtOnV3: evaluable.some(
    (e) => e.cell.category === KNOWN.category && e.cell.month === KNOWN.month && fires(rule, e),
  ),
  caughtOnV2: v2July ? fires(rule, v2July) : null,
}));

const out = {
  analysedAt: new Date().toISOString(),
  notes: {
    source: "docs/audits/round-53-fingerprint.json — the probe's committed measurement",
    policy:
      "MEASUREMENT ONLY, offline. No network, no datasets, nothing wired into ingestion. " +
      "Every threshold is swept rather than chosen, because a single threshold presented as " +
      "the answer would be a tuned number with nothing saying what it compensates for.",
    partialMonthDropped: partial,
    knownBreak: `${KNOWN.category}/${KNOWN.month}`,
  },
  coverage: {
    cellsTotal: cells.length,
    cellsEvaluable: evaluable.length,
    cellsSkipped: skipped.length,
    skipped,
    categories: [...byCat.keys()].sort(),
    monthsComplete: months.filter((m) => m !== partial),
  },
  knownBreakCell: known
    ? {
        permits: known.cell.permits,
        countChangePct: known.countChangePct,
        topShapeShare: known.cell.topShapeShare,
        trailingTopShare: +known.trailingTopShare.toFixed(1),
        shapesPerPermit: known.cell.shapesPerPermit,
        trailingShapesPerPermit: +known.trailingShapesPerPermit.toFixed(3),
        newTokenShare: known.cell.newTokenShare,
        trailingNewTokenShare:
          known.trailingNewTokenShare === null ? null : +known.trailingNewTokenShare.toFixed(1),
      }
    : null,
  controlSameCountMoveDifferentShapes: control,
  v2SolarAtTheBreak: v2July
    ? {
        cell: `v2_solar/${v2July.cell.month}`,
        permits: v2July.cell.permits,
        countChangePct: v2July.countChangePct,
        topShapeShare: v2July.cell.topShapeShare,
        trailingTopShare: +v2July.trailingTopShare.toFixed(1),
        shapesPerPermit: v2July.cell.shapesPerPermit,
        trailingShapesPerPermit: +v2July.trailingShapesPerPermit.toFixed(3),
        rulesCatchingOnV3AndV2: v2Verdict.filter((r) => r.caughtOnV3 && r.caughtOnV2).length,
        rulesCatchingOnV3Only: v2Verdict.filter((r) => r.caughtOnV3 && r.caughtOnV2 === false).length,
      }
    : null,
  v2SolarSeries: fingerprint.v2SolarByMonth ?? [],
  rulesThatCatchTheBreak: catching.length,
  rulesSwept: results.length,
  cleanest: catching.filter((r) => r.otherCellsFired === bestOtherCount),
  sweep: results,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

console.log(`evaluable cells: ${evaluable.length} (skipped ${skipped.length})`);
console.log(`\nthe known break, ${KNOWN.category}/${KNOWN.month}:`);
console.log(out.knownBreakCell);
console.log(`\ncontrol — same count move, different shapes:`);
for (const c of control) console.log(" ", c);
console.log(`\nrules swept ${results.length}; catch the break ${catching.length}`);
console.log(`cleanest (fewest other cells fired: ${bestOtherCount}):`);
for (const r of out.cleanest.slice(0, 12)) console.log(`  ${r.rule}  → ${r.firedOn.join(", ")}`);
console.log(`\nvocabulary-only rules:`);
for (const r of results.filter((x) => x.parameters.newTokenPoints !== null)) {
  console.log(
    `  ${r.rule}  caught=${r.caughtKnownBreak}  cells=${r.totalCellsFired}` +
      (r.totalCellsFired <= 8 ? `  ${r.firedOn.join(", ")}` : ""),
  );
}
console.log(`\nthe v2 reconstruction — what was actually being watched in August:`);
console.log(out.v2SolarAtTheBreak);
const bothCatch = out.cleanest.filter(
  (r) => v2Verdict.find((v) => v.rule === r.rule)?.caughtOnV2 === true,
);
console.log(`of the ${out.cleanest.length} cleanest rules, ${bothCatch.length} also catch it on v2`);
console.log(`\nwrote ${OUT.pathname}`);
