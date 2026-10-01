/**
 * Apply `redactPersonalShapes` to work descriptions already on disk.
 *
 * ── WHY A SCRIPT AND NOT JUST THE FETCHER ─────────────────────────────────
 * Round 45 wired redaction into `austinPermits.ts`, which covers every row the
 * fetcher writes from then on. It does not cover rows already committed: the
 * municipal-permits fetcher has an incremental window, so an observation
 * ingested before the redaction existed is merged forward untouched. The guard
 * in `permitcountunit.ts` caught exactly that — nine address shapes and one
 * phone shape still in `municipal-permits/austin.json` after the fetcher was
 * fixed and the pipeline had run.
 *
 * So this runs once over the committed tree. It is deterministic, offline, and
 * idempotent: re-running it changes nothing, because redacted text carries no
 * shape to match. Run it from `site/`:
 *
 *   npx tsx scripts/redact-committed-descriptions.ts          # report only
 *   npx tsx scripts/redact-committed-descriptions.ts --write   # rewrite
 *
 * ── WHAT IT MUST NOT DO ───────────────────────────────────────────────────
 * `dataPages/permits.ts` and `textMatchComposition.ts` classify published
 * composition figures by testing this same free text, so a redaction that
 * removes a classifying word moves a published number. The script therefore
 * checks every classifier verdict on the before and after text and REFUSES to
 * write if any of them flips — the figures are not permitted to move as a side
 * effect of a privacy fix.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactPersonalShapes } from "../src/ingest/redactPersonalShapes";
import { RE_ROOF_TEXT } from "../src/lib/dataPages/permits";
import { AUSTIN_SOLAR_TEXT } from "../src/ingest/tradeCategories";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEN = path.join(SITE, "src", "data", "generated", "municipal-permits");
const WRITE = process.argv.includes("--write");

/** Every text predicate a published figure is computed from. */
const CLASSIFIERS: { name: string; re: RegExp }[] = [
  { name: "RE_ROOF_TEXT", re: RE_ROOF_TEXT },
  { name: "AUSTIN_SOLAR_TEXT", re: AUSTIN_SOLAR_TEXT },
];

let scanned = 0;
let changed = 0;
const flips: string[] = [];

for (const file of readdirSync(GEN).filter((f) => f.endsWith(".json"))) {
  const full = path.join(GEN, file);
  const raw = readFileSync(full, "utf8");
  const data = JSON.parse(raw) as {
    observations: { key: string; value: { workDescription?: string } }[];
  };
  let touched = false;
  for (const o of data.observations) {
    const before = o.value?.workDescription;
    if (typeof before !== "string" || !before) continue;
    scanned += 1;
    const { text: after, removed } = redactPersonalShapes(before);
    if (removed.length === 0) continue;
    for (const c of CLASSIFIERS) {
      if (new RegExp(c.re.source, c.re.flags.replace("g", "")).test(before) !==
          new RegExp(c.re.source, c.re.flags.replace("g", "")).test(after)) {
        flips.push(`${file}:${o.key} — ${c.name} verdict changes`);
      }
    }
    changed += 1;
    console.log(`${file} ${o.key}`);
    for (const r of removed) console.log(`   ${r.kind}: ${JSON.stringify(r.matched)}`);
    console.log(`   -> ${after.replace(/\s+/g, " ").slice(0, 160)}`);
    o.value.workDescription = after;
    touched = true;
  }
  if (touched && WRITE && flips.length === 0) {
    // Match the generator's formatting exactly so the diff is the redactions
    // and nothing else.
    const trailingNewline = raw.endsWith("\n") ? "\n" : "";
    writeFileSync(full, JSON.stringify(data, null, 2) + trailingNewline);
    console.log(`   (written: ${file})`);
  }
}

console.log(`\nscanned ${scanned} work description(s); ${changed} redacted`);
if (flips.length > 0) {
  console.log(`REFUSING TO WRITE — a classifier verdict would change:`);
  for (const f of flips) console.log(`  ${f}`);
  process.exit(1);
}
if (!WRITE) console.log("(dry run — pass --write to apply)");
