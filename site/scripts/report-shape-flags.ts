/**
 * Where a flag goes to be read by a person.
 *
 * ── THE SURFACE, AND WHY THIS ONE ───────────────────────────────────────────
 * A file nobody reads is this project's oldest failure mode, so the question is not where a
 * flag is recorded but where it is MET. Three candidates, and what is wrong with two of them:
 *
 *  · The dataset. It is the record — `shapeFlag` on the category-month row — and it is the
 *    wrong surface: a number in a generated JSON that changes on a schedule is exactly the file
 *    nobody opens.
 *  · The weekly Slack cycle notice. The owner reads those, which is the argument for it, and
 *    the autoposter has no once-only state on the paths that do not publish: a flag stays
 *    flagged until it ages out of a thirteen-month window, so the line would repeat for months.
 *    Repetition is how a signal becomes furniture, which is the specific failure that made
 *    `permitcountunit`'s red normal.
 *  · A GITHUB ISSUE, opened once per newly flagged cell. This is the pick. It is addressed to a
 *    person, it carries the investigation rather than a number, it is de-duplicated by its own
 *    marker so a flag can be raised exactly once ever, and closing it is a human saying "looked
 *    at". A flag is a reason to look; an issue is the shape that request already has.
 *
 * This script prints the report and never fails the run. **It is not a gate** — nothing here
 * decides what publishes, and the ingestion workflow treats a non-zero exit as a bug in this
 * script rather than a reason to stop ingesting.
 *
 * ── EXPLAINED FLAGS ARE SUPPRESSED, AND SAID TO BE ──────────────────────────
 * A cell at or after a RECORDED discontinuity for the same series is already accounted for —
 * the record exists, the investigation happened, the evidence resolves. Re-raising it would be
 * noise on day one, because the first run after the detector lands flags the storage break we
 * documented in Round 52.
 *
 * That suppression lives HERE and not in `lib/shapeFlags.ts` on purpose. The detector must not
 * import the record module: a suspicion that knows about records is one refactor away from
 * writing one, and `shapeflagunit.ts` §2 asserts the dependency direction. The reporter is the
 * human-facing layer and is allowed to know both.
 *
 * Usage (from site/):
 *   npx tsx scripts/report-shape-flags.ts            → markdown, exit 0
 *   npx tsx scripts/report-shape-flags.ts --json     → machine-readable, exit 0
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DISCONTINUITIES } from "../src/data/discontinuities";
import {
  evaluateShapeFlags,
  describeFlag,
  REACH,
  ROUND_53_SEPARATION,
  type ShapeFlag,
  type ShapeRow,
} from "../src/lib/shapeFlags";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATASET = "permit-trade-activity";
const LOCATIONS = ["austin", "san-antonio"];

interface StoredValue extends ShapeRow {
  mappingVersion: string;
}

/** A flag already accounted for by a record, with the record that accounts for it. */
interface Explained {
  flag: ShapeFlag;
  recordedFrom: string;
  recordedWhat: string;
}

function rowsFor(location: string): StoredValue[] {
  const file = join(REPO, "site", "src", "data", "generated", DATASET, `${location}.json`);
  if (!existsSync(file)) return [];
  const doc = JSON.parse(readFileSync(file, "utf8")) as {
    status?: string;
    observations: { seed?: boolean; value: StoredValue }[];
  };
  if (doc.status === "sample") return [];
  const live = doc.observations.filter((o) => !o.seed).map((o) => o.value);
  // One mapping version, newest only — the same selection every other reader makes.
  const newest = [...new Set(live.map((v) => v.mappingVersion))].sort().at(-1);
  return live.filter((v) => v.mappingVersion === newest);
}

const explainedBy = (location: string, flag: ShapeFlag): Explained | undefined => {
  const record = DISCONTINUITIES.find(
    (d) =>
      d.datasetId === DATASET &&
      (d.location === "*" || d.location === location) &&
      (d.series === "*" || d.series === flag.category) &&
      flag.month >= d.fromMonth,
  );
  return record
    ? { flag, recordedFrom: record.fromMonth, recordedWhat: record.what }
    : undefined;
};

const currentMonth = new Date().toISOString().slice(0, 7);

const unexplained: { location: string; flag: ShapeFlag }[] = [];
const explained: { location: string; explained: Explained }[] = [];
const report: string[] = [];
let evaluated = 0;
let nearMisses = 0;
let tighter = false;
const margins: string[] = [];

for (const location of LOCATIONS) {
  const rows = rowsFor(location);
  if (rows.length === 0) {
    report.push(`- **${location}** — no live rows (sample or absent).`);
    continue;
  }
  const e = evaluateShapeFlags(rows, currentMonth);
  evaluated += e.coverage.evaluated;
  nearMisses += e.nearMisses.length;
  tighter = tighter || e.margin.tighterThanRound53;
  margins.push(
    `- **${location}** — closest flagged ${e.margin.closestFlagged?.cell ?? "none"} at ` +
      `${e.margin.closestFlagged?.diversityRatio ?? "n/a"}×, closest declined ` +
      `${e.margin.closestDeclined?.cell ?? "none"} at ` +
      `${e.margin.closestDeclined?.diversityRatio ?? "n/a"}× — gap **${e.margin.diversityGap ?? "n/a"}** ` +
      `against Round 53's ${ROUND_53_SEPARATION.diversityGap}` +
      (e.margin.tighterThanRound53 ? " ⚠️ **TIGHTER THAN WHEN MEASURED**" : ""),
  );
  if (e.coverage.withoutDescriptionColumn > 0) {
    report.push(
      `- **${location}** — ${e.coverage.withoutDescriptionColumn} cell(s) carry no description ` +
        `column, so they are not measured at all. Not "no templating": no measurement.`,
    );
  }
  for (const flag of e.flags) {
    const already = explainedBy(location, flag);
    if (already) explained.push({ location, explained: already });
    else unexplained.push({ location, flag });
  }
  for (const m of e.nearMisses) {
    report.push(
      `- near miss **${location}/${m.category}/${m.month}** — passed ${m.passed}: ${m.declined}`,
    );
  }
}

const marker = (location: string, f: ShapeFlag): string =>
  `<!-- shape-flag:${location}/${f.category}/${f.month} -->`;

const lines: string[] = [];
lines.push("## Description-shape detector");
lines.push("");
if (unexplained.length === 0) {
  lines.push(
    `**No unexplained flags.** ${evaluated} category-month(s) evaluated, ${nearMisses} near ` +
      `miss(es), ${explained.length} flag(s) already accounted for by a recorded discontinuity.`,
  );
} else {
  lines.push(`**${unexplained.length} flag(s) with no recorded discontinuity to account for.**`);
  lines.push("");
  lines.push("A flag is a reason to look. It is not a finding and it is not a record:");
  lines.push("");
  for (const { location, flag } of unexplained) {
    lines.push(`### ${location}/${flag.category}/${flag.month} ${marker(location, flag)}`);
    lines.push("");
    lines.push(describeFlag(flag));
    lines.push("");
    lines.push(
      `Margins: concentration **${flag.concentrationRatio}×** (threshold 2×, ` +
        `+${flag.margin.concentration}), diversity **${flag.diversityRatio}×** (threshold 0.8×, ` +
        `−${flag.margin.diversity}).`,
    );
    lines.push("");
    lines.push("**What to do with it**");
    lines.push("");
    lines.push(
      "1. Go to the source and find out what changed — Round 51 is the worked example: the " +
        "city's own permitting manual, retrieved from an archive and dated.",
    );
    lines.push(
      "2. If something changed, write a discontinuity (`site/src/data/discontinuities.ts`) with " +
        "evidence that resolves in this repo. A record's evidence may not be this report or any " +
        "generated file — `discontinuityunit.ts` refuses it.",
    );
    lines.push(
      "3. If nothing changed, close this. A false positive is information about the detector, " +
        "and the margin below is the thing to re-read when one appears.",
    );
    lines.push(
      "4. Nothing may be withheld, relabelled or republished on the strength of this alone.",
    );
    lines.push("");
  }
}
lines.push("");
lines.push("### The margin");
lines.push("");
lines.push(...margins);
lines.push("");
lines.push(
  `The diversity axis carried the whole separation in the only case that mattered: the break as ` +
    `it was visible at the time cleared at ${ROUND_53_SEPARATION.breakAsSeenAtTheTime.diversity}× ` +
    `with an innocent cell (${ROUND_53_SEPARATION.nearestDeclined.cell}) at ` +
    `${ROUND_53_SEPARATION.nearestDeclined.diversity}×. If the gap narrows, re-measure and say ` +
    `so — do not move the threshold until it reads clean.`,
);
if (explained.length > 0) {
  lines.push("");
  lines.push("### Suppressed — already recorded");
  lines.push("");
  for (const { location, explained: x } of explained) {
    lines.push(
      `- **${location}/${x.flag.category}/${x.flag.month}** — accounted for by the ` +
        `discontinuity recorded from ${x.recordedFrom}. ${x.recordedWhat.slice(0, 160)}…`,
    );
  }
}
if (report.length > 0) {
  lines.push("");
  lines.push("### Everything else the run saw");
  lines.push("");
  lines.push(...report);
}
lines.push("");
lines.push("### What this cannot see");
lines.push("");
lines.push(
  `- **${REACH.seriesCovered} of ${REACH.seriesTotal} permit series**, Austin only. ${REACH.sanAntonio}`,
);
lines.push(`- Detects only ${REACH.detectsOnly}`);
lines.push(`- ${REACH.blindSpotMeasured}`);
lines.push(`- Fires on ${REACH.earliest}`);

const markdown = lines.join("\n") + "\n";

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        unexplained: unexplained.map(({ location, flag }) => ({
          location,
          cell: `${location}/${flag.category}/${flag.month}`,
          marker: marker(location, flag),
          title: `Description-shape flag: ${location}/${flag.category} ${flag.month}`,
          flag,
        })),
        explainedCount: explained.length,
        evaluated,
        nearMisses,
        marginTighterThanRound53: tighter,
        markdown,
      },
      null,
      2,
    ),
  );
} else {
  console.log(markdown);
}
