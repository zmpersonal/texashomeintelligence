/*
 * Round 43 — no fabricated row may sit in a dataset the site publishes from.
 *
 * WHAT THIS EXISTS TO PREVENT. On 2026-08-23 and 2026-08-24 the bootstrap in
 * `seed.ts` wrote fabricated rows into fourteen dataset files. Ten of them
 * carried no `seed: true` stamp, and all three guards that were supposed to
 * catch them — `runIngestion`'s retirement filter, `verify-content`'s
 * `looksSeeded`, and `purge-seed-observations`' `isSeed` — identified a seed
 * row by FINGERPRINT: the flag, a `sample-` key prefix, or the literal string
 * SAMPLE in the value. Eight of the thirteen generators write none of those, so
 * the rows were invisible to every guard, survived six weeks, and one of them —
 * a fabricated 13.88¢/kWh — was published on the homepage under a LIVE badge,
 * on `/data/texas/electricity-prices/` and its CSV, and as the entire factual
 * basis of an indexed analysis article.
 *
 * So the property under test is NOT "the purge script ran." It is that no
 * committed observation is reproducible from `seed.ts`, unless it is a tagged
 * placeholder in a dataset whose status is `sample` — which is what a sample
 * dataset is for. The test REGENERATES each generator's output rather than
 * describing it (see `src/ingest/seedDetection.ts`), because describing it is
 * the exact thing that failed.
 *
 * §3 and §4 are the non-vacuity controls, and they are not ceremony. A guard
 * whose only assertion is "we found nothing" passes identically when it is
 * broken, which is how the last one passed for six weeks. §3 proves the
 * detector catches real generator output for EVERY registered generator; §4
 * proves it does not flag measured rows; §5 reproduces the specific blind spot
 * that let this happen and asserts the new method does not share it.
 *
 * Run: npx tsx scripts/replays/seedunit.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATORS, seedObservationsFor } from "../../src/ingest/seed";
import { reproducibleFromSeed, scanDatasetFile } from "../../src/ingest/seedDetection";
import { REGISTRY } from "../../src/ingest/registry";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GEN = path.join(SITE_DIR, "src", "data", "generated");

let checks = 0;
let failures = 0;
function assert(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

function datasetFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...datasetFiles(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

/** The pre-Round-43 test, kept verbatim so §5 can show what it could not see.
 * This is the dead guard, preserved as a control — never call it for anything
 * but the comparison. */
function legacyLooksSeeded(obs: { seed?: true; key: string; value: unknown }): boolean {
  if (obs.seed === true) return true;
  if (typeof obs.key === "string" && obs.key.startsWith("sample-")) return true;
  return JSON.stringify(obs.value ?? {}).toUpperCase().includes("SAMPLE");
}

function main() {
  // ── 1 · THE ASSERTION ITSELF ────────────────────────────────────────────
  // No committed observation may be reproducible from seed.ts, except a
  // tagged row in a `sample` dataset.
  console.log("\n══ 1 · committed tree ══\n");
  let totalObservations = 0;
  const offenders: string[] = [];
  const keptPlaceholders: string[] = [];

  for (const filePath of datasetFiles(GEN).sort()) {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    const rel = path.relative(GEN, filePath);
    totalObservations += data.observations.length;
    for (const row of scanDatasetFile(rel, data)) {
      if (row.status === "sample" && row.flagged) {
        keptPlaceholders.push(`${rel}:${row.key}`);
      } else {
        offenders.push(
          `${rel}:${row.key} (status "${row.status}", ` +
            `${row.flagged ? "tagged" : "UNTAGGED"}) ${JSON.stringify(row.value)}`,
        );
      }
    }
  }

  assert(
    `no fabricated row in any non-sample dataset (${totalObservations} observations scanned)`,
    offenders.length === 0,
    offenders.join(" · "),
  );
  assert(
    "every reproducible row that remains is a tagged placeholder in a sample dataset",
    offenders.length === 0,
    `${offenders.length} not accounted for`,
  );
  console.log(
    `       ${keptPlaceholders.length} tagged placeholder(s) kept in sample datasets: ` +
      `${keptPlaceholders.join(", ") || "none"}`,
  );

  // ── 2 · THE SOURCE OF TRUTH IS ONE CODE PATH ───────────────────────────
  // If a generator is ever added without the detector seeing it, the detector
  // silently stops covering it. Assert the coverage rather than assume it.
  console.log("\n══ 2 · generator coverage ══\n");
  const generatorIds = Object.keys(GENERATORS).sort();
  assert(`GENERATORS is non-empty (${generatorIds.length} registered)`, generatorIds.length > 0);

  const registryIds = [...new Set(REGISTRY.map((e) => e.fetcher.datasetId))].sort();
  const seedable = registryIds.filter((id) => GENERATORS[id]);
  assert(
    `every generator id is a real registered dataset (${seedable.length} of ${registryIds.length} feeds are seedable)`,
    generatorIds.every((id) => registryIds.includes(id)),
    generatorIds.filter((id) => !registryIds.includes(id)).join(", "),
  );

  // ── 3 · POSITIVE CONTROL — the detector catches real generator output ───
  // For EVERY generator, at a run date that is not today, assert each row it
  // writes is detected. This is what makes §1 meaningful.
  console.log("\n══ 3 · positive control — every generator, every row ══\n");
  const pastRun = new Date(Date.UTC(2026, 7, 23)); // the real bootstrap date
  for (const entry of REGISTRY) {
    const { datasetId, location } = entry.fetcher;
    if (!GENERATORS[datasetId]) continue;
    const rows = seedObservationsFor(datasetId, location, pastRun);
    if (!rows || rows.length === 0) {
      assert(`${datasetId}/${location}: generator produced rows`, false, "none");
      continue;
    }
    const missed = rows.filter((r) => !reproducibleFromSeed(datasetId, location, r));
    assert(
      `${datasetId}/${location}: all ${rows.length} generated row(s) detected`,
      missed.length === 0,
      missed.map((m) => m.key).join(", "),
    );
  }

  // ── 4 · NEGATIVE CONTROL — measured rows are not flagged ───────────────
  // The detector deleting real history would be a worse failure than the one
  // it replaces, so prove it does not. Every row left in the tree after the
  // purge is, by construction, measured (or a tagged sample placeholder).
  console.log("\n══ 4 · negative control — measured rows survive ══\n");
  for (const rel of ["eia-electricity/texas.json", "airnow/austin.json", "nws-api/austin.json"]) {
    const data = JSON.parse(readFileSync(path.join(GEN, rel), "utf8"));
    const flagged = scanDatasetFile(rel, data);
    assert(
      `${rel}: ${data.observations.length} measured row(s), none reproducible`,
      flagged.length === 0 && data.observations.length > 0,
      flagged.map((f) => f.key).join(", "),
    );
  }
  // A value one cent off the PRNG output must NOT match: the test is exact
  // equality, not proximity. 13.87 is chosen because it is NOT in the series —
  // 13.89 is (it appears twice), which this check caught when it was first
  // written against the wrong number.
  assert(
    "a near-miss value (13.87¢) is NOT flagged",
    reproducibleFromSeed("eia-electricity", "texas", {
      key: "2026-08",
      value: { pricePerKwhCents: 13.87 },
    }) === null,
  );
  // A real PRNG value at a key outside the search window must NOT match.
  assert(
    "the 13.88¢ value at a key far outside the run-date window is NOT flagged",
    reproducibleFromSeed("eia-electricity", "texas", {
      key: "1999-01",
      value: { pricePerKwhCents: 13.88 },
    }) === null,
  );
  // The residual false-positive surface, measured rather than asserted away.
  //
  // Because the run date is searched, a generator's values are effectively
  // matchable at any key inside the window — so for a feed whose real keys
  // share the generator's key format (`eia-electricity` is the only one), a
  // future real reading landing exactly on one of the twelve PRNG floats WOULD
  // be deleted. That is a real limitation and it is written down rather than
  // hidden.
  //
  // It is the right trade in both directions. A wrongly deleted row is
  // self-healing: `mergeObservations` is keyed on `key`, so the next successful
  // fetch re-adds it. A fabricated row left in place is not self-healing — it
  // is what put 13.88¢ on the homepage. This check reports the collision
  // surface so it stays visible; it fails only if a value in the tree TODAY
  // collides, which would mean the purge had just eaten something real.
  {
    const seedValues = new Set(
      (seedObservationsFor("eia-electricity", "texas", pastRun) ?? []).map((r) =>
        JSON.stringify(r.value),
      ),
    );
    const live = JSON.parse(readFileSync(path.join(GEN, "eia-electricity", "texas.json"), "utf8"));
    const collisions = live.observations.filter((o: { value: unknown }) =>
      seedValues.has(JSON.stringify(o.value)),
    );
    assert(
      `no measured eia-electricity value collides with the ${seedValues.size} PRNG values`,
      collisions.length === 0,
      JSON.stringify(collisions),
    );
  }

  // ── 5 · THE BLIND SPOT, REPRODUCED ─────────────────────────────────────
  // Run the dead fingerprint test over the same generator output. It has to
  // MISS rows the new one catches, or the new one bought nothing.
  console.log("\n══ 5 · the pre-43 guard's blind spot ══\n");
  let legacySeen = 0;
  let legacyMissed = 0;
  const blind: string[] = [];
  for (const entry of REGISTRY) {
    const { datasetId, location } = entry.fetcher;
    if (!GENERATORS[datasetId]) continue;
    const rows = seedObservationsFor(datasetId, location, pastRun) ?? [];
    for (const r of rows) {
      // Strip the flag: that is the state these rows were actually in on disk,
      // and the flag is the only fingerprint that ever worked.
      const unflagged = { key: r.key, value: r.value };
      if (legacyLooksSeeded(unflagged)) legacySeen += 1;
      else {
        legacyMissed += 1;
        if (!blind.includes(datasetId)) blind.push(datasetId);
      }
    }
  }
  assert(
    `the fingerprint test misses unflagged seed rows (${legacyMissed} missed, ${legacySeen} caught)`,
    legacyMissed > 0,
    "if this passes with 0 missed, the new detector is redundant and this round was unnecessary",
  );
  console.log(`       datasets it could not see: ${blind.sort().join(", ")}`);
  assert(
    "the reproduction test misses none of them",
    (() => {
      for (const entry of REGISTRY) {
        const { datasetId, location } = entry.fetcher;
        if (!GENERATORS[datasetId]) continue;
        for (const r of seedObservationsFor(datasetId, location, pastRun) ?? []) {
          if (!reproducibleFromSeed(datasetId, location, r)) return false;
        }
      }
      return true;
    })(),
  );

  // ── 6 · DETERMINISM ────────────────────────────────────────────────────
  // The detector's answer must not depend on when the sweep runs, or it would
  // pass today and fail next month for no reason.
  console.log("\n══ 6 · determinism ══\n");
  const sample = { key: "2026-07", value: { aqi: 42, category: "Good" } };
  const answers = [
    new Date(Date.UTC(2026, 9, 1)),
    new Date(Date.UTC(2027, 2, 14)),
    new Date(Date.UTC(2028, 0, 1)),
  ].map((d) => reproducibleFromSeed("airnow", "austin", sample, d) !== null);
  assert("same answer from three different 'now' values", answers.every((a) => a === answers[0]));
  const twice = [1, 2].map(() =>
    JSON.stringify(seedObservationsFor("eia-electricity", "texas", pastRun)),
  );
  assert("seedObservationsFor is deterministic across calls", twice[0] === twice[1]);

  console.log(
    `\nSEED_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.log(`\nSEED_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
