#!/usr/bin/env node
/**
 * Phase 1 completeness check.
 *
 * `astro sync` already Zod-validates every entry's shape. This script
 * checks the cross-cutting rules the per-file schema can't: that the
 * full location x service matrix is actually complete (14 combinations),
 * that the two page families (SEO / PPC) have what they need, and that
 * nothing is silently missing from the registries. Fails loudly (exit 1)
 * on the first problem, printing every problem it finds, not just one.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "src", "data");

const problems = [];
const fail = (msg) => problems.push(msg);

function loadDir(name) {
  const dir = path.join(dataDir, name);
  const out = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".yaml")) continue;
    const id = file.replace(/\.yaml$/, "");
    out[id] = parse(readFileSync(path.join(dir, file), "utf8"));
  }
  return out;
}

function loadFile(name) {
  return parse(readFileSync(path.join(dataDir, name), "utf8"));
}

const EXPECTED_LOCATIONS = ["austin", "san-antonio"];
const EXPECTED_SERVICES = [
  "roofing",
  "hvac",
  "plumbing",
  "fire-damage-restoration",
  "mold-remediation",
  "electrical",
  "tree-trimming",
];
const SUPPLIED_SERVICES = ["roofing", "hvac", "plumbing"];

// --- locations ---
const locations = loadDir("locations");
for (const slug of EXPECTED_LOCATIONS) {
  if (!locations[slug]) fail(`locations: missing "${slug}.yaml"`);
}
if (Object.keys(locations).length !== EXPECTED_LOCATIONS.length) {
  fail(
    `locations: expected exactly ${EXPECTED_LOCATIONS.length}, found ${
      Object.keys(locations).length
    } (${Object.keys(locations).join(", ")})`,
  );
}

// --- services ---
const services = loadDir("services");
for (const slug of EXPECTED_SERVICES) {
  if (!services[slug]) fail(`services: missing "${slug}.yaml"`);
}
if (Object.keys(services).length !== EXPECTED_SERVICES.length) {
  fail(
    `services: expected exactly ${EXPECTED_SERVICES.length}, found ${
      Object.keys(services).length
    } (${Object.keys(services).join(", ")})`,
  );
}
for (const [slug, svc] of Object.entries(services)) {
  const isSupplied = SUPPLIED_SERVICES.includes(slug);
  if (isSupplied && svc.copyStatus !== "supplied") {
    fail(`services/${slug}: expected copyStatus "supplied", got "${svc.copyStatus}"`);
  }
  if (!isSupplied && svc.copyStatus !== "draft") {
    fail(`services/${slug}: expected copyStatus "draft", got "${svc.copyStatus}"`);
  }
  if (isSupplied && !svc.ppcHero) {
    fail(`services/${slug}: supplied service is missing ppcHero (needed for /lp/ pages)`);
  }
  if (!isSupplied && svc.ppcHero) {
    fail(`services/${slug}: draft service has a ppcHero — no PPC page is planned for it yet`);
  }
  if (!svc.sections || svc.sections.length < 3) {
    fail(`services/${slug}: expected at least 3 body sections`);
  }
  if (!svc.faq || svc.faq.length < 3) {
    fail(`services/${slug}: expected at least 3 FAQ entries`);
  }
}

// --- intake questions: one file per service, matching slugs exactly ---
const intake = loadDir("intake-questions");
for (const slug of EXPECTED_SERVICES) {
  const entry = intake[slug];
  if (!entry) {
    fail(`intake-questions: missing "${slug}.yaml"`);
    continue;
  }
  if (entry.service !== slug) {
    fail(
      `intake-questions/${slug}: internal "service" field is "${entry.service}", expected "${slug}"`,
    );
  }
  if (!entry.fields || entry.fields.length < 3) {
    fail(`intake-questions/${slug}: expected at least 3 fields`);
  }
}

// --- data sources: the registry must be complete and cover every priority feed ---
//
// This block used to assert the opposite of what it now checks: it required
// every feed to be status "sample" and failed any feed marked "live", on the
// Phase-1 assumption that no fetcher was implemented yet. Several feeds have
// since gone genuinely live, so the check failed on correct data and had to be
// ignored — a verifier nobody can trust is worse than none. What actually
// needs guarding is that the registry stays complete and that a feed's
// declared status matches the dataset file it describes.
const dataSources = loadFile("data-sources.yaml");
const priorityIds = dataSources.filter((d) => d.priority).map((d) => d.id);
const expectedPriority = ["nws-api", "noaa-storm-events", "municipal-permits", "eia-electricity"];
for (const id of expectedPriority) {
  if (!dataSources.find((d) => d.id === id)) fail(`data-sources: missing priority feed "${id}"`);
}
const VALID_STATUSES = ["sample", "live", "stale", "error", "stub"];
for (const d of dataSources) {
  if (!VALID_STATUSES.includes(d.status)) {
    fail(`data-sources/${d.id}: unknown status "${d.status}" (expected one of ${VALID_STATUSES.join(", ")})`);
  }
}
if (dataSources.length < 10) {
  fail(`data-sources: expected the full handoff §11 registry (~14 feeds), found ${dataSources.length}`);
}

// --- generated datasets: no fabricated rows under a live badge ---
//
// `seed.ts` bootstraps datasets with clearly-marked placeholder rows, and
// `runIngestion` retires them the first time a real fetch succeeds. This
// guards that invariant: a dataset presented as measured must contain no
// seeded rows, because pages compute headline figures from these files.
const generatedRoot = path.join(dataDir, "generated");

function generatedFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...generatedFiles(full));
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function looksSeeded(obs) {
  if (obs.seed === true) return true;
  if (typeof obs.key === "string" && obs.key.startsWith("sample-")) return true;
  return JSON.stringify(obs.value ?? {}).toUpperCase().includes("SAMPLE");
}

for (const filePath of generatedFiles(generatedRoot)) {
  const rel = path.relative(generatedRoot, filePath);
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  if (data.status === "sample") continue;
  const seeded = data.observations.filter(looksSeeded);
  if (seeded.length > 0) {
    fail(
      `generated/${rel}: status is "${data.status}" but ${seeded.length} observation(s) are seeded placeholders ` +
        `— run \`node scripts/purge-seed-observations.mjs\``,
    );
  }
  if (data.status !== "error" && data.observations.length === 0) {
    fail(`generated/${rel}: status is "${data.status}" with no observations`);
  }
}

// --- faq: both tags represented, 6-8 total per CLAUDE.md ---
const faqEntries = loadFile("faq.yaml");
const productCount = faqEntries.filter((f) => f.tag === "product").length;
const authorityCount = faqEntries.filter((f) => f.tag === "authority").length;
if (faqEntries.length < 6 || faqEntries.length > 8) {
  fail(`faq: expected 6-8 entries per CLAUDE.md, found ${faqEntries.length}`);
}
if (productCount === 0) fail("faq: no product-tagged questions found");
if (authorityCount === 0) fail("faq: no authority-tagged questions found");

// --- home stress index: invariants that must hold before a score is published ---
//
// These read the BUILT output when it exists, so the check runs against the
// numbers actually served rather than a re-derivation. It is skipped (not
// failed) before a first build, so `verify-content` stays runnable on a clean
// checkout. What it guards is the set of mistakes that would be invisible on
// the page: a weight table that no longer sums to 1, a score outside its own
// scale, a sample feed leaking into a published number, or a signal claiming
// to be more current than the data behind it.
const stressDir = path.join(here, "..", "dist", "client", "data", "stress-index");
if (existsSync(stressDir)) {
  const files = readdirSync(stressDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) fail("stress-index: no area files were emitted");
  for (const file of files) {
    const area = file.replace(/\.json$/, "");
    const r = JSON.parse(readFileSync(path.join(stressDir, file), "utf8"));

    const weightSum = Object.values(r.parameters.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1) > 1e-9) {
      fail(`stress-index/${area}: signal weights sum to ${weightSum}, not 1`);
    }
    const inRange = (n) => Number.isInteger(n) && n >= 0 && n <= 100;
    if (!inRange(r.composite.score)) {
      fail(`stress-index/${area}: composite ${r.composite.score} is not an integer 0-100`);
    }
    if (r.composite.weightCoverage <= 0) {
      fail(`stress-index/${area}: no signal could be computed`);
    }
    for (const sig of r.signals) {
      if (sig.computable && !inRange(sig.layerB.score)) {
        fail(`stress-index/${area}/${sig.id}: score ${sig.layerB.score} is not an integer 0-100`);
      }
      // A sample feed is fabricated placeholder data; it must never reach a score.
      for (const input of sig.layerA) {
        if (input.status === "sample") {
          fail(`stress-index/${area}/${sig.id}: reads sample feed "${input.datasetId}"`);
        }
      }
      // The signal's stated currency must not outrun its stalest input.
      const oldest = sig.layerA
        .map((i) => i.dataThrough)
        .filter(Boolean)
        .sort()[0];
      if (oldest && sig.freshness.dataThrough && sig.freshness.dataThrough > oldest) {
        fail(
          `stress-index/${area}/${sig.id}: reports data through ${sig.freshness.dataThrough}, ` +
            `newer than its stalest input (${oldest})`,
        );
      }
      // An unavailable signal must say why — that sentence is what the UI shows.
      if (!sig.computable && !sig.limitation) {
        fail(`stress-index/${area}/${sig.id}: unavailable with no stated reason`);
      }
    }
    // The compare module must stay unavailable until an input varies below county level.
    if (r.compare.available) {
      fail(`stress-index/${area}: publishes a ZIP comparison, but no input varies within a metro`);
    }
  }
}

// --- report ---
if (problems.length > 0) {
  console.error(`\n✗ Content verification failed with ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `✓ Content verified: ${EXPECTED_LOCATIONS.length} locations × ${EXPECTED_SERVICES.length} services ` +
    `(${SUPPLIED_SERVICES.length} supplied w/ PPC hero, ${
      EXPECTED_SERVICES.length - SUPPLIED_SERVICES.length
    } draft), ` +
    `${dataSources.length} data sources (${priorityIds.length} priority), ${faqEntries.length} FAQ entries.`,
);
