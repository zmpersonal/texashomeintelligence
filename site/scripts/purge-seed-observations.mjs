#!/usr/bin/env node
/**
 * Retire seeded SAMPLE rows that are still sitting in generated datasets.
 *
 * `seed.ts` bootstraps every dataset with fabricated rows so pages have
 * something clearly-marked to render before a feed goes live. Until now those
 * rows survived `mergeObservations` forever, so eight datasets that have since
 * gone live were still carrying fabricated observations underneath a LIVE
 * badge — and the Austin roofing page was computing its "largest reported
 * hail" headline partly from invented magnitudes.
 *
 * `runIngestion` now drops seeded rows on the first successful fetch, so this
 * is a one-time cleanup of what's already committed. It is idempotent and safe
 * to re-run: it only ever removes rows it can positively identify as seeds.
 *
 *   - status "sample"  -> tag seeds with `seed: true` (keep them; a sample
 *                         dataset is *supposed* to show marked placeholders)
 *   - anything else    -> delete them (measured data must never be mixed
 *                         with fabricated data)
 *
 * Run: node scripts/purge-seed-observations.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.join(here, "..", "src", "data", "generated");
const dryRun = process.argv.includes("--dry-run");

/**
 * A row is a seed if it says so, or if it still carries one of the two
 * fingerprints `seed.ts` has always written: the `sample-` key prefix used by
 * the multi-row generators, or a literal "SAMPLE" marker inside the value that
 * the single-row generators embed. No upstream feed emits either.
 */
function isSeed(obs) {
  if (obs.seed === true) return true;
  if (typeof obs.key === "string" && obs.key.startsWith("sample-")) return true;
  return JSON.stringify(obs.value ?? {}).toUpperCase().includes("SAMPLE");
}

function datasetFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...datasetFiles(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

let changed = 0;
for (const filePath of datasetFiles(generatedDir).sort()) {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const rel = path.relative(generatedDir, filePath);
  const seeds = data.observations.filter(isSeed);
  if (seeds.length === 0) continue;

  if (data.status === "sample") {
    const alreadyTagged = seeds.every((o) => o.seed === true);
    if (alreadyTagged) continue;
    data.observations = data.observations.map((o) => (isSeed(o) ? { ...o, seed: true } : o));
    console.log(`  tag    ${rel} — marked ${seeds.length} seeded row(s) (status "sample", kept)`);
  } else {
    data.observations = data.observations.filter((o) => !isSeed(o));
    console.log(
      `  purge  ${rel} — removed ${seeds.length} seeded row(s) from a "${data.status}" dataset ` +
        `(${data.observations.length} measured row(s) remain)`,
    );
  }

  changed++;
  if (!dryRun) writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

if (changed === 0) console.log("✓ No seeded rows needed retiring.");
else console.log(`\n${dryRun ? "[dry run] would update" : "✓ Updated"} ${changed} dataset file(s).`);
