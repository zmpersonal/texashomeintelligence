/**
 * Round 54 — the detector, run through the real ingest path against the live source.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * This project's standing rule is that no surface ships without someone reading the actual
 * output, not the build log. The detector is wired into `permitTradeActivityAustin.fetchRaw`,
 * which cannot be reached from an agent session (no external host is) — so this calls that
 * fetcher, unchanged and by name, on an Actions runner and writes down what came back.
 *
 * It is a VERIFICATION, not a second implementation: `fetchRaw` builds the request, classifies
 * the rows, accumulates the fingerprint and stores the verdicts exactly as a scheduled ingest
 * would. Nothing here re-derives any of that. The dataset is NOT written — the workflow asserts
 * that `src/data/generated` is untouched — so a data refresh and a code round stay separate.
 *
 * ── IT WRITES THE MEASUREMENT, NOT THE MATERIAL ─────────────────────────────
 * Every field written below is a count, a share or a verdict produced by the detector. No
 * description, and no hash of one, exists past the accumulator — see `descriptionShape.ts`.
 * The workflow's guard asserts that by walking this file's structure and reporting PATHS.
 *
 * Run: npx tsx scripts/audits/round-54-detector-live.ts   (Actions only; needs the source)
 */
import { writeFileSync } from "node:fs";
import { permitTradeActivityAustin } from "../../src/ingest/fetchers/permitTradeActivity";
import { evaluateShapeFlags, describeFlag, ROUND_53_SEPARATION } from "../../src/lib/shapeFlags";
// The reporter's suppression rule, applied here too: a flag at or after a RECORDED break for
// the same series is already accounted for. Importing the record module is fine in an audit —
// it is the human-facing layer. The DETECTOR must not, and `shapeflagunit.ts` §2 asserts it
// does not: a suspicion that knows about records is one refactor away from writing one.
import { DISCONTINUITIES } from "../../src/data/discontinuities";

const OUT = new URL("../../../docs/audits/round-54-detector-live.json", import.meta.url);

async function main(): Promise<void> {
  const now = new Date();
  // The fetcher overrides this with its own `recountWindow`, as it does in production; passing
  // the real shape of a context rather than a convenient one is the point.
  const observations = await permitTradeActivityAustin.fetchRaw({
    env: { SOCRATA_APP_TOKEN: process.env.SOCRATA_APP_TOKEN },
    window: { since: new Date(Date.UTC(now.getUTCFullYear() - 2, 0, 1)).toISOString(), until: now.toISOString() },
  });

  const values = observations.map((o) => o.value);
  const stored = values.filter((v) => v.shapeFlag !== undefined);
  const evaluation = evaluateShapeFlags(values, now.toISOString().slice(0, 7));

  // The law `shapeflagunit.ts` §6 asserts, checked here against the live run: a stored verdict
  // is a fresh evaluation of the stored rows, or the two have drifted and one of them is wrong.
  let mismatched = 0;
  for (const v of values) {
    if (!v.shapeFlag) continue;
    const fresh = evaluation.byCell.get(`${v.category} ${v.month}`);
    if (JSON.stringify(v.shapeFlag) !== JSON.stringify(fresh)) mismatched++;
  }

  const out = {
    measuredAt: now.toISOString(),
    notes: {
      question:
        "run the real ingest path against the live source: does the detector store what it " +
        "should, flag what Round 53 said it would, and leave the published figures alone?",
      policy:
        "VERIFICATION. The dataset is not written; the workflow asserts src/data/generated is " +
        "untouched. Counts, shares and verdicts only — no description and no hash of one.",
      storedVerdictMatchesFreshEvaluation: mismatched === 0,
    },
    rows: {
      observations: observations.length,
      categoryMonths: values.filter((v) => v.category !== null).length,
      allTradesRows: values.filter((v) => v.category === null).length,
      carryingShape: values.filter((v) => v.shape !== undefined).length,
      carryingVerdict: stored.length,
      storedVerdictMismatches: mismatched,
    },
    coverage: evaluation.coverage,
    flags: evaluation.flags.map((f) => {
      const record = DISCONTINUITIES.find(
        (d) =>
          d.datasetId === "permit-trade-activity" &&
          (d.location === "*" || d.location === "austin") &&
          (d.series === "*" || d.series === f.category) &&
          f.month >= d.fromMonth,
      );
      return {
        ...f,
        /** True ⇒ the reporter suppresses it and no issue is raised: the record exists. */
        explainedByRecord: record ? `recorded from ${record.fromMonth}` : null,
      };
    }),
    flagLines: evaluation.flags.map(describeFlag),
    nearMisses: evaluation.nearMisses,
    margin: evaluation.margin,
    round53: ROUND_53_SEPARATION,
    reach: evaluation.reach,
    /** Every cell's numbers, so the margin above can be re-derived from this file alone. */
    cells: values
      .filter((v) => v.category !== null)
      .map((v) => ({ category: v.category, month: v.month, permits: v.permitCount, shape: v.shape, verdict: v.shapeFlag }))
      .sort((a, b) => `${a.category}${a.month}`.localeCompare(`${b.category}${b.month}`)),
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${OUT.pathname}`);
  console.log(
    `observations ${observations.length}; shapes ${out.rows.carryingShape}; verdicts ${stored.length}; ` +
      `mismatches ${mismatched}`,
  );
  for (const line of out.flagLines) console.log(`  FLAG  ${line}`);
  for (const m of evaluation.nearMisses) {
    console.log(`  near  ${m.category}/${m.month} passed ${m.passed} (${m.concentrationRatio}× / ${m.diversityRatio}×)`);
  }
  console.log(
    `  margin — closest to missed ${evaluation.margin.closestToMissed?.cell ?? "none"} ` +
      `(inside diversity by ${evaluation.margin.closestToMissed?.insideDiversityBy ?? "n/a"}, ` +
      `Round 53: ${ROUND_53_SEPARATION.flaggedAtTheTime.insideDiversityBy}); nearest declined on ` +
      `diversity ${evaluation.margin.nearestDeclinedOnDiversity?.cell ?? "none"} ` +
      `(outside by ${evaluation.margin.nearestDeclinedOnDiversity?.outsideBy ?? "n/a"}, Round 53: ` +
      `${ROUND_53_SEPARATION.nearestDeclinedOnDiversity.outsideBy}); separation ` +
      `${evaluation.margin.diversitySeparation ?? "n/a"} vs ${ROUND_53_SEPARATION.diversitySeparation}` +
      (evaluation.margin.tighterThanRound53 ? "  *** TIGHTER ***" : ""),
  );
  if (mismatched > 0) {
    throw new Error(
      `${mismatched} stored verdict(s) differ from a fresh evaluation of the stored rows — the ` +
        `ingest and the reader disagree about the rule, which is the defect the stored verdict ` +
        `exists to prevent.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
