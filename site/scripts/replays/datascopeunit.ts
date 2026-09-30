/*
 * Round 41a — every observation is labelled with the scope it was measured in.
 *
 * WHAT THIS EXISTS TO PREVENT. `/data/austin/drought/` said "Every weekly U.S.
 * Drought Monitor reading recorded for Travis County" and rendered 68 rows from
 * THREE counties — three different values all dated 2026-09-22, none of them
 * labelled. The page was correct when it was written; Round 4b added Williamson
 * and Hays to the same dataset file for the stress index, and nothing told the
 * page its file had stopped being one county.
 *
 * So the property under test is not "drought.ts filters" — it is that a spec's
 * DECLARED scope and the rows every surface actually renders are the same
 * thing, and that a headline reading does not depend on the order rows happen
 * to sit in a JSON file.
 *
 * Run: npx tsx scripts/replays/datascopeunit.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Imported from the spec modules directly, NOT from `dataPages/index.ts`:
// that barrel pulls in `lib/datasets.ts`, whose `import.meta.glob` exists only
// under Vite. Round 41a moved `specObservations` and the two pure observation
// helpers into Vite-free modules precisely so this layer could be tested
// without building the site first.
import { specObservations } from "../../src/lib/dataPages/scope";
import type { DataPageSpec } from "../../src/lib/dataPages/types";
import { austinRoofing } from "../../src/lib/dataPages/austinRoofing";
import { sanAntonioStorms } from "../../src/lib/dataPages/sanAntonioStorms";
import { austinDrought, sanAntonioDrought } from "../../src/lib/dataPages/drought";
import { austinRoofPermits, sanAntonioRoofPermits } from "../../src/lib/dataPages/permits";
import { texasElectricity } from "../../src/lib/dataPages/texasElectricity";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by design
const DATA_PAGES: DataPageSpec<any>[] = [
  austinRoofing, austinRoofPermits, austinDrought,
  sanAntonioStorms, sanAntonioRoofPermits, sanAntonioDrought, texasElectricity,
];
import type { DatasetFile, Observation } from "../../src/ingest/types";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GEN = path.join(SITE_DIR, "src", "data", "generated");

let checks = 0;
let failures = 0;
function assert(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

function load(datasetId: string, location: string): DatasetFile<any> | undefined {
  const f = path.join(GEN, datasetId, `${location}.json`);
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return undefined;
  }
}

/** A deterministic reshuffle: reverse, then interleave. Anything that survives
 * this does not depend on the file's stored order. */
function reorder<T>(rows: T[]): T[] {
  const r = [...rows].reverse();
  const out: T[] = [];
  for (let i = 0; i < Math.ceil(r.length / 2); i += 1) {
    out.push(r[i]);
    const j = r.length - 1 - i;
    if (j > i) out.push(r[j]);
  }
  return out;
}

function main() {
  console.log("\n── 1 · a spec's rows are all inside its declared scope ──");
  for (const spec of DATA_PAGES) {
    const ds = load(spec.datasetId, spec.location);
    if (!ds) {
      console.log(`  ..   ${spec.location}/${spec.topic}: no committed file`);
      continue;
    }
    const rows = specObservations(spec, ds);
    if (spec.scope) {
      assert(
        `${spec.location}/${spec.topic}: every row satisfies its own scope`,
        rows.every((o: Observation<any>) => spec.scope!(o)),
      );
      const excluded = ds.observations.filter((o: Observation<any>) => !o.seed && !spec.scope!(o));
      assert(
        `${spec.location}/${spec.topic}: out-of-scope rows exist and are excluded (${excluded.length} of ${
          ds.observations.filter((o: Observation<any>) => !o.seed).length
        })`,
        rows.length + excluded.length ===
          ds.observations.filter((o: Observation<any>) => !o.seed).length,
      );
    }
    assert(`${spec.location}/${spec.topic}: no seeded row reaches a page`,
      rows.every((o: Observation<any>) => !o.seed));
    assert(`${spec.location}/${spec.topic}: newest first`,
      rows.every((o, i) => i === 0 || rows[i - 1].observedAt >= o.observedAt));
  }

  console.log("\n── 2 · a county-scoped page renders exactly one county ──");
  // Observation keys are `{fips}-{mapDate}`, so the key is the county of record.
  for (const spec of DATA_PAGES.filter((s) => s.topic === "drought")) {
    const ds = load(spec.datasetId, spec.location);
    if (!ds) continue;
    const rows = specObservations(spec, ds);
    const fips = new Set(rows.map((o: Observation<any>) => o.key.split("-")[0]));
    assert(
      `${spec.location}/${spec.topic}: exactly one county FIPS in the rendered rows`,
      fips.size === 1,
      [...fips].join(", "),
    );
    // And no two rows share a week, which is what "one county" means for a
    // weekly county feed — the defect showed up as three rows on one date.
    const dates = rows.map((o: Observation<any>) => o.observedAt);
    assert(
      `${spec.location}/${spec.topic}: no duplicated week`,
      new Set(dates).size === dates.length,
      `${dates.length} rows, ${new Set(dates).size} distinct weeks`,
    );
    // Any row the file holds for another county must really exist, or this
    // assertion is passing vacuously on a file that never had the problem.
    const all = ds.observations.filter((o: Observation<any>) => !o.seed);
    const others = new Set(all.map((o: Observation<any>) => o.key.split("-")[0]));
    assert(
      `${spec.location}/${spec.topic}: the file really does hold other counties (${others.size})`,
      others.size > 1,
      [...others].join(", "),
    );
  }

  console.log("\n── 3 · the headline reading does not depend on file order ──");
  for (const spec of DATA_PAGES) {
    const ds = load(spec.datasetId, spec.location);
    if (!ds) continue;
    const asStored = spec.stats({ dataset: ds, observations: specObservations(spec, ds) });
    const shuffled: DatasetFile<any> = { ...ds, observations: reorder(ds.observations) };
    const asShuffled = spec.stats({
      dataset: shuffled,
      observations: specObservations(spec, shuffled),
    });
    assert(
      `${spec.location}/${spec.topic}: stats identical under a reshuffled file`,
      JSON.stringify(asStored) === JSON.stringify(asShuffled),
      `${JSON.stringify(asStored?.[0])} vs ${JSON.stringify(asShuffled?.[0])}`,
    );
  }

  console.log(
    `\nDATA_SCOPE_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.log(`\nDATA_SCOPE_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
