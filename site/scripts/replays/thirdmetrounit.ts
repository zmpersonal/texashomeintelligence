/*
 * Round 40 — a third metro either resolves correctly or stops the build.
 *
 * WHAT THIS EXISTS TO PREVENT. Round 39 found `lib/account/alerts.ts` resolving
 * a metro's display name with `areaId === "san-antonio" ? "San Antonio" :
 * "Austin"`. A third metro did not fail there: it was silently labelled
 * "Austin" in alert headlines sent to a homeowner about their own home. It
 * typechecked, it built, and it was wrong. Seven more assumptions of the same
 * shape were found in the Round 40 sweep.
 *
 * So the rule this file enforces is: for an area the config does not know,
 * there is NO SILENT ANSWER. Either the value is derived from `ZIP_AREAS` and
 * is therefore right by construction, or the attempt throws, or it fails to
 * compile. Never a default.
 *
 * Section 4 is the real proof and the slow one: it adds a third metro to the
 * live config, runs `tsc`, and asserts the build breaks in exactly the files
 * that need a human decision — then puts the config back. Everything it touches
 * is restored in a `finally`, and the restore is itself asserted.
 *
 * Run: npx tsx scripts/replays/thirdmetrounit.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ZIP_AREAS, areaLabel, primaryCountyName } from "../../src/data/zip-areas";
import { METROS as AC_METROS } from "../../src/data/acLifespan";
import { METROS as ROOF_METROS } from "../../src/data/roofScan";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ZIP_AREAS_SRC = path.join(SITE_DIR, "src", "data", "zip-areas.ts");

let checks = 0;
let failures = 0;
function assert(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

/** The lookups a new metro must fill in, and the files that hold them.
 *
 * SIX, not the five Round 39 predicted. The sixth is `SAMPLE_ZIP`, which this
 * round created by typing the stress-index endpoint's representative ZIP as
 * `Record<AreaId, …>` instead of leaving it a ternary that handed any third
 * metro a San Antonio ZIP. This list was written with five and section 4 failed
 * until it was corrected — which is the assertion doing its job. */
const REQUIRED_LOOKUPS: [string, string][] = [
  ["src/ingest/fetchers/airnow.ts", "ZIP_BY_LOCATION"],
  ["src/ingest/fetchers/blsWages.ts", "CBSA"],
  ["src/ingest/fetchers/censusAcs.ts", "COUNTY_FIPS"],
  ["src/ingest/fetchers/noaaStormEvents.ts", "COUNTIES_BY_LOCATION"],
  ["src/ingest/fetchers/usdaSoil.ts", "REPRESENTATIVE_POINT"],
  ["src/pages/data/stress-index/[area].json.ts", "SAMPLE_ZIP"],
];

/** Fetchers that must need NO edit for a new metro, because they read config. */
const CONFIG_DRIVEN = [
  "src/ingest/fetchers/usdm.ts",
  "src/ingest/fetchers/noaaClimate.ts",
  "src/ingest/fetchers/swdiHail.ts",
];

function main() {
  console.log("\n── 1 · an unknown area has no silent answer ──");

  // Typed `string`, not inferred: `AreaId` is now a literal union, so comparing
  // it against a foreign id is itself a type error — which is the property
  // under test, and would otherwise stop this file compiling.
  const UNKNOWN: string = "fort-worth";
  assert(
    "the unknown id is genuinely not in the config",
    !ZIP_AREAS.some((a) => a.areaId === UNKNOWN),
  );

  for (const [label, fn] of [
    ["areaLabel", areaLabel],
    ["primaryCountyName", primaryCountyName],
  ] as [string, (id: string) => string][]) {
    let threw = false;
    let message = "";
    try {
      const got = fn(UNKNOWN);
      message = `returned ${JSON.stringify(got)} instead of throwing`;
    } catch (e) {
      threw = true;
      message = e instanceof Error ? e.message : String(e);
    }
    assert(`${label}("${UNKNOWN}") throws rather than defaulting`, threw, message);
    // The specific regression: the old ternary's fallback was "Austin".
    assert(
      `${label}("${UNKNOWN}") never answers "Austin"`,
      threw && !/^Austin$/.test(message),
      message,
    );
    assert(
      `${label} names the known areas so the fix is obvious`,
      threw && ZIP_AREAS.every((a) => message.includes(a.areaId)),
      message,
    );
  }

  console.log("\n── 2 · every known area resolves to its own values ──");
  for (const area of ZIP_AREAS) {
    assert(`${area.areaId} → "${area.label}"`, areaLabel(area.areaId) === area.label);
    assert(
      `${area.areaId} → ${area.primaryCounty.name} County`,
      primaryCountyName(area.areaId) === area.primaryCounty.name,
    );
  }
  // Cross-contamination is the failure mode, so assert the labels are distinct.
  assert(
    "no two areas share a label",
    new Set(ZIP_AREAS.map((a) => a.label)).size === ZIP_AREAS.length,
  );

  console.log("\n── 3 · derived lists cannot drift from the config ──");
  // PRIMARY_FIPS cannot be imported here: `stressIndex/signals.ts` pulls in
  // `lib/datasets.ts`, whose `import.meta.glob` only exists under Vite. So this
  // asserts on the source — that the map is DERIVED rather than hand-keyed,
  // which is the property that stops it drifting. Its values are then covered
  // at runtime by the build itself, which does resolve under Vite.
  const signalsSrc = readFileSync(
    path.join(SITE_DIR, "src", "lib", "stressIndex", "signals.ts"),
    "utf8",
  );
  assert(
    "PRIMARY_FIPS is derived from ZIP_AREAS, not hand-keyed",
    /PRIMARY_FIPS[\s\S]{0,200}ZIP_AREAS\.map/.test(signalsSrc),
  );
  assert(
    "PRIMARY_FIPS holds no literal area id",
    !/PRIMARY_FIPS[^;]*"san-antonio":/.test(signalsSrc),
  );
  for (const [name, list] of [
    ["acLifespan", AC_METROS],
    ["roofScan", ROOF_METROS],
  ] as [string, readonly { id: string; label: string }[]][]) {
    assert(
      `${name}'s METROS is the config list, in config order`,
      JSON.stringify(list.map((m) => [m.id, m.label])) ===
        JSON.stringify(ZIP_AREAS.map((a) => [a.areaId, a.label])),
      JSON.stringify(list),
    );
  }

  console.log("\n── 4 · a third metro breaks the build, in named files ──");
  const original = readFileSync(ZIP_AREAS_SRC, "utf8");
  const anchor = "] as const satisfies readonly ZipArea[];";
  assert("the config literal is shaped as expected", original.includes(anchor));

  let tsc: ReturnType<typeof spawnSync>;
  try {
    writeFileSync(
      ZIP_AREAS_SRC,
      original.replace(
        anchor,
        `  {
    areaId: "${UNKNOWN}",
    label: "Fort Worth",
    primaryCounty: { name: "Tarrant", fips: "48439" },
    droughtCounties: [{ name: "Tarrant", fips: "48439" }],
    stormCounties: ["Tarrant"],
    point: { lat: 32.7555, lon: -97.3308 },
  },
${anchor}`,
      ),
    );
    tsc = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], {
      cwd: SITE_DIR,
      encoding: "utf8",
    });
  } finally {
    writeFileSync(ZIP_AREAS_SRC, original);
  }
  assert(
    "the config file was restored",
    readFileSync(ZIP_AREAS_SRC, "utf8") === original,
    "RESTORE FAILED — check git status before committing",
  );

  const out = `${tsc.stdout ?? ""}${tsc.stderr ?? ""}`;
  assert("adding a metro does not typecheck", tsc.status !== 0, `tsc exited ${tsc.status}`);

  const blamed = new Set(
    out
      .split("\n")
      .map((l) => /^(src\/[^(]+)\(/.exec(l)?.[1])
      .filter((x): x is string => Boolean(x)),
  );
  for (const [file, constant] of REQUIRED_LOOKUPS) {
    assert(`${file} demands a ${constant} row`, blamed.has(file), [...blamed].join(", "));
  }
  for (const file of CONFIG_DRIVEN) {
    assert(`${file} needs no edit — it reads the config`, !blamed.has(file));
  }
  assert(
    "no file beyond the named lookups is implicated",
    [...blamed].every((f) => REQUIRED_LOOKUPS.some(([file]) => file === f)),
    [...blamed].join(", "),
  );

  console.log("\n── 5 · the fixed assumptions stay fixed ──");
  // Regression guard. Each pattern is one this round removed; a reintroduced
  // copy would build and be wrong, which is exactly why it needs a test.
  const BANNED: [string, string, RegExp][] = [
    ["src/lib/account/alerts.ts", "metro-defaulting label ternary", /\?\s*"San Antonio"\s*:\s*"Austin"/],
    ["src/lib/belowHeroReadings.ts", "metro-defaulting county ternary", /\?\s*"Bexar"\s*:\s*"Travis"/],
    ["src/pages/home/index.astro", "metro-defaulting label ternary", /\?\s*"Austin"\s*:\s*"San Antonio"/],
    ["src/pages/home/setup.astro", "hardcoded metro array", /\["austin"\s*,\s*"san-antonio"\]/],
    ["src/pages/home/setup.astro", "metro-defaulting optgroup label", /\?\s*"Austin metro"\s*:/],
    ["src/layouts/ServicePage.astro", "two-metro cross-link flip", /\?\s*"san-antonio"\s*:\s*"austin"/],
    ["src/components/ZipPicker.astro", "hardcoded metro groups", /label:\s*"Austin metro"/],
    ["src/pages/data/stress-index/[area].json.ts", "metro-defaulting sample ZIP", /\?\s*"78704"\s*:\s*"78205"/],
    // These three read as orderings and were selections: a metro absent from the
    // array was absent from the page. They may name an order; they may not map
    // over it to build the list.
    ["src/pages/start/index.astro", "metro list built by mapping the order array", /locationOrder\s*\n?\s*\.map\(/],
    ["src/pages/services/index.astro", "metro list built by mapping the order array", /LOCATION_ORDER\.map\(/],
    ["src/pages/methodology/index.astro", "hardcoded location list", /LOCATIONS = \["austin"/],
  ];
  for (const [file, what, re] of BANNED) {
    const src = readFileSync(path.join(SITE_DIR, file), "utf8");
    // The audit and the explanatory comments quote the old code on purpose, so
    // only non-comment lines count.
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    assert(`${file}: no ${what}`, !re.test(code));
  }

  console.log(
    `\nTHIRD_METRO_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.log(`\nTHIRD_METRO_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
