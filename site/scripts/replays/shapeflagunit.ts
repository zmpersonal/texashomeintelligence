/*
 * Round 54 — the description-shape detector: the rule, its margin, and the two conditions it
 * was built under.
 *
 * The owner set two conditions above the detector working at all, and §1 and §2 are those:
 *
 *   1. THE THRESHOLD IS THE WEAK POINT AND MUST BE VISIBLE AS ONE. 0.78 against 0.80 with an
 *      innocent cell at 0.79 is not a margin. The margin is therefore computed and reported on
 *      every run, and a narrowing is surfaced rather than absorbed — asserted here by moving a
 *      cell toward the boundary and watching `tighterThanRound53` go true.
 *   2. A FLAG IS A SUSPICION, NEVER A DISCONTINUITY. Asserted three ways: the type (a flag is
 *      missing every field a record requires, so the assignment does not compile — §2 records
 *      the compiler's own words), the dependency direction (neither module imports the other),
 *      and admissibility (`discontinuityunit.ts` §7 refuses a record whose only evidence is a
 *      generated file).
 *
 * And the claim that has to stay true as this ages: IT IS NOT A GATE. §5 asserts that a flagged
 * series publishes exactly what an unflagged one does.
 *
 * Run: npx tsx scripts/replays/shapeflagunit.ts   (from site/)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ShapeAccumulator, normaliseDescription } from "../../src/ingest/descriptionShape";
import {
  CONCENTRATION_RATIO,
  DIVERSITY_RATIO,
  MIN_PERMITS,
  REACH,
  ROUND_53_SEPARATION,
  evaluateShapeFlags,
  describeFlag,
  type ShapeRow,
} from "../../src/lib/shapeFlags";
import { segmentsOf } from "../../src/lib/tradeSegments";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
let pass = 0,
  fail = 0;
const A = (label: string, ok: boolean, detail = ""): void => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ""}`);
  }
};

/**
 * A category-month built by hand: `n` permits, `top` of them sharing one wording and the rest
 * in groups of `groupSize`.
 *
 * The varied wordings differ by WORDS, not digits — `w(i)` is a letter string — because the
 * normalisation collapses every run of digits to `#`, so "unit 1" and "unit 2" are one shape.
 * That is the point of the measure and it is easy to write a fixture that accidentally proves
 * the opposite: the first version of this helper numbered its descriptions and produced nine
 * "quiet" months that were 90% one shape.
 */
const w = (i: number): string => {
  const a = String.fromCharCode(97 + (i % 26));
  const b = String.fromCharCode(97 + (Math.floor(i / 26) % 26));
  const c = String.fromCharCode(97 + (Math.floor(i / 676) % 26));
  return `${a}${b}${c}zz`; // 17,576 distinct words — enough for a 1,000-permit fixture
};

/**
 * A cell from hand-set NUMBERS rather than from descriptions.
 *
 * `shape` is counts and shares by design, so building one directly is building the real thing,
 * and it is the only way to land a ratio exactly on a boundary — which is what §1's margin
 * assertions need. Fixtures that go through the accumulator are used wherever the wording
 * itself is the subject.
 */
const raw = (
  category: string,
  month: string,
  permits: number,
  topShapeShare: number,
  shapesPerPermit: number,
): ShapeRow => ({
  category,
  month,
  permitCount: permits,
  shape: {
    withDescription: permits,
    emptyDescriptions: 0,
    distinctShapes: Math.round(permits * shapesPerPermit),
    shapesPerPermit,
    topShapeShare,
    top3ShapeShare: Math.min(100, topShapeShare * 2),
  },
});

const cell = (category: string, month: string, n: number, top: number, groupSize = 1): ShapeRow => {
  const acc = new ShapeAccumulator();
  for (let i = 0; i < top; i++) {
    acc.record(category, month, `t${i}`, "install battery backup system and meter socket");
  }
  let written = top;
  for (let g = 0; written < n; g++) {
    for (let k = 0; k < groupSize && written < n; k++, written++) {
      acc.record(category, month, `u${written}`, `replace ${w(g)} heater in the ${w(g + 7)} room`);
    }
  }
  return { category, month, permitCount: n, shape: acc.summarise().get(`${category} ${month}`) };
};

const months = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-${String(from + i).padStart(2, "0")}`);

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n══ 1 · THE RULE, AND THE MARGIN IT IS REPORTED WITH ══\n");

{
  // Nine months of varied wording, then one templated month: the shape of the break.
  const quiet = months(1, 9).map((m) => cell("energy_storage", m, 20, 2));
  const broken = cell("energy_storage", "2026-10", 30, 26);
  const e = evaluateShapeFlags([...quiet, broken]);
  A("a templated month is flagged", e.flags.length === 1, JSON.stringify(e.flags[0]?.month));
  A("…and the flag is a suspicion, with the next step on it",
    e.flags[0]?.status === "suspicion" && /reason to look/i.test(e.flags[0]?.nextStep ?? ""));
  A("…and it carries both ratios and both margins",
    (e.flags[0]?.concentrationRatio ?? 0) >= CONCENTRATION_RATIO &&
      (e.flags[0]?.diversityRatio ?? 1) <= DIVERSITY_RATIO &&
      e.flags[0]?.margin.concentration !== undefined &&
      e.flags[0]?.margin.diversity !== undefined);
  A("…and nothing else in the window is flagged", e.flags.length === 1);
  A("the describe line quotes only figures the flag holds",
    describeFlag(e.flags[0]).includes(String(e.flags[0].topShapeShare)) &&
      describeFlag(e.flags[0]).includes(String(e.flags[0].permits)));

  // NON-VACUITY: the same nine months with a tenth that is merely BUSY, not templated.
  const busy = evaluateShapeFlags([...quiet, cell("energy_storage", "2026-10", 120, 12)]);
  A("a month that merely got busier is NOT flagged", busy.flags.length === 0,
    `${busy.nearMisses.length} near miss(es)`);
}

{
  /*
   * THE MARGIN. Condition 1: a narrowing must surface, not be absorbed — and it must not cry
   * wolf, or a real narrowing gets ignored. Both halves are asserted here.
   *
   * The axes are read separately and each only among the cells that could cross it: a cell
   * that failed concentration is not competing on diversity. The first version of this
   * compared every declined cell on the diversity axis and reported a NEGATIVE gap against
   * live data (energy_storage/2026-09 sits at 0.193, declined on concentration), i.e. "tighter
   * than when measured" on a window with no false positive in it.
   */
  const base = [
    ...months(1, 9).map((m) => raw("storage", m, 100, 10, 1)),
    raw("storage", "2026-10", 100, 30, 0.6), // 3.0× and 0.60 → flagged, comfortably
    ...months(1, 9).map((m) => raw("roofing", m, 100, 10, 1)),
    raw("roofing", "2026-10", 100, 25, 0.9), // 2.5× and 0.90 → declined ON DIVERSITY
    ...months(1, 9).map((m) => raw("hvac", m, 100, 10, 1)),
    raw("hvac", "2026-10", 100, 12, 0.2), // 1.2× and 0.20 → declined ON CONCENTRATION
  ];
  const e = evaluateShapeFlags(base);
  A("the margin names the flagged cell closest to being missed",
    e.margin.closestToMissed?.cell === "storage/2026-10",
    JSON.stringify(e.margin.closestToMissed));
  A("…the nearest declined cell ON THE DIVERSITY AXIS cleared concentration first",
    e.margin.nearestDeclinedOnDiversity?.cell === "roofing/2026-10",
    JSON.stringify(e.margin.nearestDeclinedOnDiversity));
  A("…the nearest declined cell ON THE CONCENTRATION AXIS cleared diversity first",
    e.margin.nearestDeclinedOnConcentration?.cell === "hvac/2026-10",
    JSON.stringify(e.margin.nearestDeclinedOnConcentration));
  A("…a cell declined on the OTHER axis is not compared on this one",
    e.margin.nearestDeclinedOnDiversity?.cell !== "hvac/2026-10" &&
      (e.margin.diversitySeparation ?? 0) > 0,
    `separation ${e.margin.diversitySeparation}`);
  A("…and that window is NOT reported as tighter than when it was measured",
    e.margin.tighterThanRound53 === false,
    `separation ${e.margin.diversitySeparation} vs ${ROUND_53_SEPARATION.diversitySeparation}`);
  A("…and Round 53's own margins are frozen to be read against",
    e.margin.round53.flaggedAtTheTime.insideDiversityBy === 0.016 &&
      e.margin.round53.nearestDeclinedOnDiversity.outsideBy === 0.061 &&
      e.margin.round53.diversitySeparation === 0.077);

  // NOW CROWD IT, exactly: a flagged cell 0.005 inside the threshold where Round 53's was
  // 0.016 inside. Sensitivity has narrowed and it must say so.
  const thin = evaluateShapeFlags(
    base.map((r) =>
      r.category === "storage" && r.month === "2026-10" ? raw("storage", "2026-10", 100, 30, 0.795) : r,
    ),
  );
  A("a flagged cell closer to the threshold than Round 53's trips `tighterThanRound53`",
    thin.margin.tighterThanRound53 === true &&
      (thin.margin.closestToMissed?.insideDiversityBy ?? 1) === 0.005,
    JSON.stringify(thin.margin.closestToMissed));

  // And the specificity half: an innocent cell that clears concentration and lands closer to
  // the boundary than roofing/2026-01 did.
  const crowded = evaluateShapeFlags(
    base.map((r) =>
      r.category === "roofing" && r.month === "2026-10" ? raw("roofing", "2026-10", 100, 25, 0.83) : r,
    ),
  );
  A("an innocent cell crowding the boundary trips it too",
    crowded.margin.tighterThanRound53 === true &&
      (crowded.margin.nearestDeclinedOnDiversity?.outsideBy ?? 1) === 0.03,
    JSON.stringify(crowded.margin.nearestDeclinedOnDiversity));
  A("…and the note names both margins and says not to move the threshold",
    /SENSITIVITY/.test(e.margin.note) && /SPECIFICITY/.test(e.margin.note) &&
      /not to move a threshold/.test(e.margin.note));
}

{
  // The n floor must stay at or below 29: the break month held 29 permits.
  A(`MIN_PERMITS (${MIN_PERMITS}) cannot miss a 29-permit break`, MIN_PERMITS <= 29);
  const quiet = months(1, 9).map((m) => cell("energy_storage", m, 15, 1));
  const small = evaluateShapeFlags([...quiet, cell("energy_storage", "2026-10", 29, 25)]);
  A("…proven on a 29-permit month", small.flags.length === 1, `${small.flags.length} flag(s)`);
}

{
  // Each test alone is dirty — the measured reason the rule is a conjunction.
  // The electrical shape, at electrical's scale: 1,000 permits almost all worded differently,
  // then 100 of them sharing one wording. Concentration goes up tenfold; diversity barely
  // moves, because 900 varied wordings are still 900 varied wordings. This is the live cell
  // (electrical/2026-08: 5.24× and 0.96×) reproduced by construction.
  const quiet = months(1, 9).map((m) => cell("roofing", m, 1000, 10));
  const concentrationOnly = evaluateShapeFlags([...quiet, cell("roofing", "2026-10", 1000, 100)]);
  A("concentration alone does not flag", concentrationOnly.flags.length === 0);
  A("…it is reported as a near miss naming which half it passed",
    concentrationOnly.nearMisses.some((m) => m.passed === "concentration"),
    concentrationOnly.nearMisses[0]?.declined.slice(0, 60));
  A("…and the near miss names the second-category blind spot",
    concentrationOnly.nearMisses.some((m) => /blindSpotMeasured|second category/i.test(m.declined)));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n══ 2 · A FLAG IS A SUSPICION, NOT A RECORD ══\n");
/*
 * The compile-time half, which cannot be asserted at runtime — it is asserted by the compiler
 * and recorded here. Adding this to any file:
 *
 *   export function proof(flag: ShapeFlag): Discontinuity {
 *     return flag;
 *   }
 *
 * fails with, verbatim from `npx tsc --noEmit` on 2026-10-16:
 *
 *   src/lib/__flagproof.ts(4,3): error TS2740: Type 'ShapeFlag' is missing the following
 *   properties from type 'Discontinuity': datasetId, location, series, fromMonth, and 4 more.
 *
 * Written, run, read, and deleted. The "4 more" are `what`, `cause`, `discoveredAt` and
 * `evidence` — the four that make a record a record, and `evidence` is itself a non-empty tuple
 * so even a hand-written record cannot have none. The runtime half below is the dependency
 * direction and the shape of the flag object.
 */
{
  const flagSrc = readFileSync(join(REPO, "site", "src", "lib", "shapeFlags.ts"), "utf8");
  const recordSrc = readFileSync(join(REPO, "site", "src", "data", "discontinuities.ts"), "utf8");
  const imports = (src: string): string[] =>
    [...src.matchAll(/^\s*import[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  A("the detector does not import the record module",
    !imports(flagSrc).some((i) => i.includes("discontinuities")),
    imports(flagSrc).join(", "));
  A("the record module does not import the detector",
    !imports(recordSrc).some((i) => i.includes("shapeFlags") || i.includes("descriptionShape")),
    imports(recordSrc).join(", ") || "(no imports)");
  A("neither module mentions writing the other's file",
    !/writeFileSync|appendFile/.test(flagSrc) && !/writeFileSync|appendFile/.test(recordSrc));

  const quiet = months(1, 9).map((m) => cell("energy_storage", m, 20, 2));
  const flag = evaluateShapeFlags([...quiet, cell("energy_storage", "2026-10", 30, 26)]).flags[0];
  for (const required of ["what", "cause", "discoveredAt", "evidence", "datasetId"]) {
    A(`a flag carries no \`${required}\` — the field a record requires`,
      !(required in (flag as unknown as Record<string, unknown>)));
  }
  A("a flag says what it is, in the object itself", flag.status === "suspicion");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n══ 3 · IT STORES THE MEASUREMENT, NOT THE MATERIAL ══\n");
{
  const acc = new ShapeAccumulator();
  const secret = "INSTALL BATTERY BACKUP FOR MR HARGROVE AT 123 EXAMPLE STREET 13.5 KWH";
  acc.record("energy_storage", "2026-10", "P1", secret);
  acc.record("energy_storage", "2026-10", "P2", secret.replace("13.5", "27"));
  const stored = acc.summarise().get("energy_storage 2026-10")!;
  const serialised = JSON.stringify(stored);
  A("the stored cell is numbers only",
    Object.values(stored).every((v) => v === null || typeof v === "number"), serialised);
  for (const word of ["HARGROVE", "hargrove", "EXAMPLE", "battery", "street"]) {
    A(`no trace of "${word}" survives`, !serialised.toLowerCase().includes(word.toLowerCase()));
  }
  A("no hash survives either — nothing to test a guessed description against",
    !/[0-9a-f]{10}/.test(serialised), serialised);
  A("the two wordings differing only in digits are ONE shape", stored.distinctShapes === 1,
    `${stored.distinctShapes} shape(s) from 2 permits`);
  A("normalisation is what makes that true",
    normaliseDescription("A 13.5 KWH  unit") === "a # kwh unit",
    normaliseDescription("A 13.5 KWH  unit"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n══ 4 · THE REACH IS IN THE OUTPUT, NOT ONLY THE AUDIT ══\n");
{
  const quiet = months(1, 9).map((m) => cell("solar", m, 30, 3));
  // A San Antonio-shaped row: no description column, so no shape at all.
  const sa: ShapeRow = { category: "roofing", month: "2026-05", permitCount: 500 };
  const e = evaluateShapeFlags([...quiet, sa]);
  A("every evaluation carries the reach", e.reach === REACH);
  A("…naming the series it covers and the total", REACH.seriesCovered === 6 && REACH.seriesTotal === 13);
  A("…naming San Antonio and item 36", /San Antonio/.test(REACH.sanAntonio) && /item 36/.test(REACH.sanAntonio));
  A("…saying absence of a flag there is absence of a MEASUREMENT",
    /absence of a measurement/i.test(REACH.sanAntonio));
  A("…naming the only class of change it detects", /TEMPLATE/i.test(REACH.detectsOnly));
  A("…and carrying the measured second-category blind spot with its numbers",
    /electrical/i.test(REACH.blindSpotMeasured) && /5\.24/.test(REACH.blindSpotMeasured));
  A("a row with no description column is counted, not silently skipped",
    e.coverage.withoutDescriptionColumn === 1, JSON.stringify(e.coverage));
  A("the incomplete month is not evaluated when the run names it",
    evaluateShapeFlags([...quiet], "2026-09").coverage.incompleteMonth === 1,
    JSON.stringify(evaluateShapeFlags([...quiet], "2026-09").coverage));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n══ 5 · A DETECTOR, NOT A GATE ══\n");
{
  /*
   * The owner's line: "Nothing about this changes what publishes." A flag must not reach the
   * layer that decides which months a figure may be computed from. `segmentsOf` is that layer
   * (Round 52), so the same rows are run through it with and without a flag present and the
   * published figures must be identical.
   */
  const rows = months(1, 9).map((m) => ({
    category: "energy_storage",
    month: m,
    permitCount: 20,
    mappingVersion: "trades-v3",
    mechanisms: ["work-class"],
    sourceValues: [{ value: "Auxiliary Power", count: 20 }],
  }));
  const plain = JSON.stringify(segmentsOf(rows, []));
  const flaggedRows = rows.map((r, i) => ({
    ...r,
    shape: cell("energy_storage", r.month, 20, i === 8 ? 18 : 2).shape,
    shapeFlag: { flagged: i === 8, passed: ["concentration", "diversity"] },
  }));
  const withFlags = JSON.stringify(segmentsOf(flaggedRows, []));
  A("the published figures are byte-identical with a flag present", plain === withFlags);

  const libSrc = readFileSync(join(REPO, "site", "src", "lib", "tradeSegments.ts"), "utf8");
  const activitySrc = readFileSync(join(REPO, "site", "src", "lib", "tradeActivity.ts"), "utf8");
  A("the publishing layer never mentions a flag",
    !/shapeFlag|shapeFlags|flagged/.test(libSrc) && !/shapeFlag|shapeFlags|flagged/.test(activitySrc));

  const pages = ["src/components/BelowHero.astro", "src/pages/tools/roof-scan/index.astro"];
  for (const rel of pages) {
    const src = readFileSync(join(REPO, "site", rel), "utf8");
    A(`${rel} reads no flag`, !/shapeFlag|flagged/.test(src));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n══ 6 · THE LIVE DATASET, AND THE STORED VERDICT ══\n");
{
  /*
   * Measured against what is on disk rather than asserted as a value — a replay that reports a
   * value is not a check, so what is ASSERTED here are the laws: a stored verdict must equal a
   * fresh evaluation of the stored rows, and no verdict may exist where no shape does.
   */
  const file = join(REPO, "site", "src", "data", "generated", "permit-trade-activity", "austin.json");
  const doc = JSON.parse(readFileSync(file, "utf8")) as {
    observations: { seed?: boolean; value: ShapeRow & { shapeFlag?: unknown; mappingVersion: string } }[];
  };
  const live = doc.observations.filter((o) => !o.seed).map((o) => o.value);
  const newest = [...new Set(live.map((v) => v.mappingVersion))].sort().at(-1);
  const current = live.filter((v) => v.mappingVersion === newest);
  const withShape = current.filter((v) => v.shape);
  console.log(
    `  (${current.length} rows on ${newest}, ${withShape.length} carrying a shape)`,
  );
  if (withShape.length === 0) {
    console.log("  — no shapes on disk yet; the ingest has not run since the detector landed.");
    A("a row without a shape carries no verdict",
      current.every((v) => v.shapeFlag === undefined));
  } else {
    const fresh = evaluateShapeFlags(current);
    let mismatched = 0;
    for (const v of current) {
      const expected = fresh.byCell.get(`${v.category} ${v.month}`);
      const stored = v.shapeFlag;
      if (!stored) continue;
      if (JSON.stringify(stored) !== JSON.stringify(expected)) mismatched++;
    }
    A("every stored verdict equals a fresh evaluation of the stored rows", mismatched === 0,
      `${mismatched} mismatch(es)`);
    A("no row carries a verdict without a shape",
      current.every((v) => !v.shapeFlag || v.shape !== undefined));
    for (const f of fresh.flags) console.log(`  live flag: ${describeFlag(f)}`);
    console.log(
      `  live margin: closest to missed ${fresh.margin.closestToMissed?.cell ?? "none"} inside ` +
        `by ${fresh.margin.closestToMissed?.insideDiversityBy ?? "n/a"} (Round 53: ` +
        `${ROUND_53_SEPARATION.flaggedAtTheTime.insideDiversityBy}); separation ` +
        `${fresh.margin.diversitySeparation ?? "n/a"} vs ${ROUND_53_SEPARATION.diversitySeparation}` +
        (fresh.margin.tighterThanRound53 ? "  *** TIGHTER ***" : ""),
    );
  }
}

console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
console.log(`SHAPE_FLAG_UNIT_STATUS=${fail === 0 ? "ok" : "fail"} checks=${pass + fail} failures=${fail}`);
process.exit(fail === 0 ? 0 : 1);
