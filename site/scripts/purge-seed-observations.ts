#!/usr/bin/env npx tsx
/**
 * Retire fabricated rows that `seed.ts` wrote and that are still on disk.
 *
 * ── WHAT CHANGED IN ROUND 43, AND WHY THE OLD VERSION OF THIS FILE FAILED
 *
 * This script used to identify a seed row by fingerprint: `seed === true`, a
 * `sample-` key prefix, or the literal string `SAMPLE` in the value. Its own
 * comment called those "the two fingerprints `seed.ts` has ALWAYS written."
 *
 * That claim was false. Only `noaaStormEvents` and `municipalPermits` write the
 * prefix; `eiaElectricityPrice` and the `single()` helper behind all ten stub
 * feeds write a bare `monthKey`. Only three of those ten embed SAMPLE in their
 * value. Eight of the thirteen generators carried neither fingerprint, so this
 * script ran, reported success, and left nine fabricated rows in place — one of
 * which was published on the homepage under a LIVE badge for six weeks.
 *
 * It now asks `seedDetection.ts` instead, which REGENERATES each generator's
 * output and matches on (key, value). It executes the thing it is looking for
 * rather than describing it, so it cannot be wrong about a generator it has
 * never seen.
 *
 * ── THE TWO BRANCHES, UNCHANGED
 *
 *   - status "sample"  -> tag seeds with `seed: true` (keep them; a sample
 *                         dataset is *supposed* to show marked placeholders)
 *   - anything else    -> delete them (measured data must never be mixed
 *                         with fabricated data)
 *
 * Idempotent and safe to re-run: it only ever touches rows it can positively
 * reproduce from a generator.
 *
 * Run: npx tsx scripts/purge-seed-observations.ts [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scanDatasetFile } from "../src/ingest/seedDetection";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.join(here, "..", "src", "data", "generated");
const dryRun = process.argv.includes("--dry-run");

function datasetFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...datasetFiles(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

let changed = 0;
let found = 0;
for (const filePath of datasetFiles(generatedDir).sort()) {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const rel = path.relative(generatedDir, filePath);
  const seeds = scanDatasetFile(rel, data);
  if (seeds.length === 0) continue;
  found += seeds.length;

  // Report every row BEFORE acting on it. A row that was never flagged is the
  // interesting case — it is the one the old fingerprint test could not see.
  for (const s of seeds) {
    console.log(
      `         ${rel} · ${s.key} · ${JSON.stringify(s.value)} ` +
        `(flagged: ${s.flagged ? "yes" : "NO — invisible to the pre-43 guard"}, ` +
        `reproduced from a run on ${s.match.runDate})`,
    );
  }

  const seedKeys = new Set(seeds.map((s) => s.key));
  if (data.status === "sample") {
    if (seeds.every((s) => s.flagged)) continue;
    data.observations = data.observations.map((o: { key: string }) =>
      seedKeys.has(o.key) ? { ...o, seed: true } : o,
    );
    console.log(`  tag    ${rel} — marked ${seeds.length} seeded row(s) (status "sample", kept)`);
  } else {
    data.observations = data.observations.filter((o: { key: string }) => !seedKeys.has(o.key));
    console.log(
      `  purge  ${rel} — removed ${seeds.length} seeded row(s) from a "${data.status}" dataset ` +
        `(${data.observations.length} measured row(s) remain)`,
    );
  }

  changed++;
  if (!dryRun) writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

console.log();
if (found === 0) console.log("✓ No reproducible seed rows found.");
else console.log(`${found} reproducible row(s) across ${changed} file(s).`);
if (changed > 0) console.log(`${dryRun ? "[dry run] would update" : "✓ Updated"} ${changed} dataset file(s).`);
