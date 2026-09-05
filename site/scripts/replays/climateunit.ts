/*
 * Round 19b — the cooling-degree-day feed is in an honest unavailable state.
 *
 * WHAT THIS REPLACED. Round 19's version of this file asserted 28 things about
 * a bounding-box station-discovery fetcher. The 2026-09-05 probe dispatch
 * measured that NCEI's data service rejects bounding-box discovery outright
 * (HTTP 400, "A station is required"), so every one of those assertions was
 * testing a mechanism that does not exist. A green test over a falsified
 * mechanism is worse than no test.
 *
 * WHAT IT ASSERTS NOW. That nothing ships. Specifically: that the fetcher
 * issues NO HTTP REQUEST AT ALL, that its refusal names the measured finding
 * rather than a vague TODO, that no generated file claims a cooling-degree-day
 * reading, and that the feed is still absent from the Home Stress Index. The
 * point is the first one: a fetcher that fires a call path already measured to
 * return 400 would burn a runner cycle every day and write error files for a
 * question we already know the answer to. This is the regression guard against
 * re-shipping it.
 *
 * Run: npx tsx scripts/replays/climateunit.ts
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noaaClimateAustin, noaaClimateSanAntonio } from "../../src/ingest/fetchers/noaaClimate";
import { REGISTRY } from "../../src/ingest/registry";
import { maxDataAgeDays } from "../../src/lib/dataFreshness";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GEN = path.join(SITE_DIR, "src", "data", "generated", "noaa-climate");

let failures = 0;
let checks = 0;
function assert(label: string, cond: boolean, detail = "") {
  checks += 1;
  if (cond) console.log(`  ok   ${label}${detail ? `  — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

const WINDOW = { since: "2026-08-01T00:00:00.000Z", until: "2026-09-05T00:00:00.000Z" };

async function run() {
  // ── 1. No request is made. This is the assertion that matters.
  console.log("\n1. the falsified call path is not fired");
  let fetchCalls = 0;
  globalThis.fetch = (async (input: any) => {
    fetchCalls += 1;
    throw new Error(`unexpected network call to ${String(input)}`);
  }) as typeof fetch;

  const messages: string[] = [];
  for (const f of [noaaClimateAustin, noaaClimateSanAntonio]) {
    try {
      await f.fetchRaw({ env: {}, window: WINDOW });
      messages.push("");
    } catch (e) {
      messages.push(e instanceof Error ? e.message : String(e));
    }
  }
  assert("no HTTP request is issued by either metro", fetchCalls === 0, `fetch called ${fetchCalls}×`);
  assert("both metros refuse rather than returning rows", messages.every((m) => m !== ""));

  // ── 2. The refusal is a finding, not a shrug.
  console.log("\n2. the refusal carries what was measured");
  for (const [i, metro] of ["austin", "san-antonio"].entries()) {
    const m = messages[i];
    assert(`${metro}: names the dataset and location`, m.includes(`noaa-climate/${metro}`));
    assert(`${metro}: quotes the measured 400`, m.includes("A station is required"));
    assert(`${metro}: says the finding was measured, with a date`, m.includes("2026-09-05"));
    assert(`${metro}: points at the round's audit`, m.includes("round-19b-cdd-mechanism.md"));
    assert(
      `${metro}: does not present itself as merely unwritten`,
      !/not implemented yet/i.test(m),
      "Round 19's stub said 'not implemented yet'; this one was implemented and measured wrong",
    );
  }

  // ── 3. Nothing on disk claims a reading.
  console.log("\n3. no generated file claims a cooling-degree-day figure");
  const files = existsSync(GEN) ? readdirSync(GEN) : [];
  assert("no San Antonio file exists", !files.includes("san-antonio.json"), `files: ${files.join(", ") || "none"}`);
  for (const f of files) {
    const d = JSON.parse(readFileSync(path.join(GEN, f), "utf8"));
    assert(`${f}: status is not live`, d.status !== "live", `status=${d.status}`);
    assert(
      `${f}: carries no coolingDegreeDaysF value`,
      !d.observations.some((o: any) => o.value && "coolingDegreeDaysF" in o.value),
    );
    assert(
      `${f}: every remaining row is a marked seed`,
      d.observations.every((o: any) => o.seed === true),
      `${d.observations.filter((o: any) => o.seed !== true).length} unmarked row(s)`,
    );
  }

  // ── 4. Registration and scoring are unchanged by the falsification.
  console.log("\n4. registration and scoring");
  const entries = REGISTRY.filter((e) => e.fetcher.datasetId === "noaa-climate");
  assert("both launch metros are registered", entries.length === 2, entries.map((e) => e.fetcher.location).join(", "));
  assert("no secret is required", entries.every((e) => e.fetcher.requiredEnvVars.length === 0));
  assert(
    "the citation names the normals product, not the falsified data service",
    entries.every((e) => e.fetcher.source.url.includes("normals-monthly")),
    entries[0]?.fetcher.source.url,
  );
  const compute = readFileSync(path.join(SITE_DIR, "src", "lib", "stressIndex", "compute.ts"), "utf8");
  assert("the Home Stress Index still does not read this feed", !compute.includes("noaa-climate"));
  assert("the freshness window survived the revert", maxDataAgeDays("noaa-climate") === 75);

  console.log(`\nCLIMATE_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.log(`\nCLIMATE_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
