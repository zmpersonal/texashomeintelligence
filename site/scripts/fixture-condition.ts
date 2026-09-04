/**
 * Round 9c — the synthetic condition, so the event card renders deterministically.
 *
 * -- WHY THIS EXISTS --------------------------------------------------------
 * Two `r7replay` assertions guard the event card's honesty: that it describes an
 * AREA and never claims something about the reader's address, and that it says it
 * goes away when the condition does. Both had been failing for rounds, for the
 * most boring reason available: no Austin condition is currently active, so no
 * card renders, and an unconditional presence check reads absence as failure.
 *
 * The card's data comes from `alerts[]` in the precomputed artifact the Worker
 * serves from its own assets (`src/lib/account/readIndex.ts`), keyed on the
 * home's `area_id`. So a fixture home pointed at a fixture AREA gets a fixture
 * artifact, and the two real areas are never touched.
 *
 * -- HOW SYNTHETIC IS IT, EXACTLY -------------------------------------------
 * Barely. `evaluateAlerts` fires the heat alert when the LATEST NWS observation
 * for the area forecasts a high at or above 100°F. Austin's archive holds 15
 * such readings; the most recent (2026-09-03T12:00Z, 102°F) is four
 * observations old, and the current one reads 99°F. One degree, and four hours.
 *
 * So the observation is REAL and COMMITTED: a reading NOAA/NWS actually
 * published, which really did cross the threshold. The only synthetic act is
 * treating it as the current one.
 *
 * And the COPY is not written here. It is extracted from
 * `src/lib/account/alerts.ts` - the product's own templates - every time this
 * runs. That is the point: if the fixture authored the sentences, `r7replay`
 * would be asserting that this file says "area", which proves nothing. It
 * asserts the PRODUCT says it. Change the honesty copy in `alerts.ts` and the
 * next fixture run carries the change straight into the assertion.
 *
 * -- PRODUCTION ISOLATION ---------------------------------------------------
 * Four independent reasons this cannot reach production, checked, not assumed:
 *
 *   1. It is written into `dist/`, which `site/.gitignore:2` ignores. It cannot
 *      be committed. `assertCannotReachProduction()` runs `git check-ignore`
 *      and REFUSES TO WRITE if git does not claim the path.
 *   2. Production builds generate their own `dist/` from a fresh clone at a
 *      commit. A file that cannot be committed cannot exist in that clone, so
 *      the path from this file to a deployed asset does not exist.
 *   3. `fixture-condition` is not in `areaDefinitions()`, so the real build
 *      never emits an artifact by that name and no ZIP resolves to it. The
 *      script refuses if that ever stops being true.
 *   4. Every real `home_profiles.area_id` is set from ZIP -> area resolution at
 *      signup, so no real home can read it even if it somehow shipped.
 *
 * On top of those: the artifact carries a `__fixture` block, and the alert's
 * `conditionKey` is prefixed `FIXTURE:`, so it is greppable and obvious in any
 * dump.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");

/** The fixture area. Deliberately not a place name - nothing resolves to it. */
export const FIXTURE_AREA_ID = "fixture-condition";
/** The real area whose artifact and observations the fixture borrows. */
const SOURCE_AREA_ID = "austin";
const SOURCE_AREA_LABEL = "Austin";

const ARTIFACT_DIR = join(SITE, "dist", "client", "data", "stress-index");
const SOURCE_ARTIFACT = join(ARTIFACT_DIR, `${SOURCE_AREA_ID}.json`);
export const FIXTURE_ARTIFACT = join(ARTIFACT_DIR, `${FIXTURE_AREA_ID}.json`);

const ALERTS_SRC = join(SITE, "src", "lib", "account", "alerts.ts");
const NWS_ARCHIVE = join(SITE, "src", "data", "generated", "nws-api", `${SOURCE_AREA_ID}.json`);
const ZIP_AREAS_SRC = join(SITE, "src", "lib", "zipAreas.ts");

// -- guards -----------------------------------------------------------------

function assertCannotReachProduction(): void {
  // (a) the output must be inside dist/, which the build regenerates.
  const rel = relative(SITE, FIXTURE_ARTIFACT);
  if (!rel.startsWith("dist/")) {
    throw new Error(`fixture-condition: refusing - output is not inside dist/: ${rel}`);
  }
  // (b) git must actually ignore it. Not "we believe it is ignored" - ask git.
  let ignoredBy = "";
  try {
    ignoredBy = execFileSync("git", ["check-ignore", "-v", FIXTURE_ARTIFACT], {
      cwd: SITE, encoding: "utf8",
    }).trim();
  } catch {
    throw new Error(
      `fixture-condition: REFUSING TO WRITE - git does not ignore ${rel}.\n` +
        `    This file must be uncommittable. Restore site/.gitignore's dist/ rule.`,
    );
  }
  // (c) the fixture area must not be a real area.
  const zipAreas = readFileSync(ZIP_AREAS_SRC, "utf8");
  if (zipAreas.includes(FIXTURE_AREA_ID)) {
    throw new Error(
      `fixture-condition: REFUSING - "${FIXTURE_AREA_ID}" now appears in zipAreas.ts. ` +
        `A fixture area must never be a real one.`,
    );
  }
  console.log(`  guard  uncommittable: ${ignoredBy}`);
  console.log(`  guard  "${FIXTURE_AREA_ID}" is absent from zipAreas.ts`);
}

// -- the real observation ---------------------------------------------------

interface NwsValue { forecastHighF?: number; forecastLowF?: number }

/** The most recent COMMITTED reading that really did cross the heat threshold. */
export function heatObservation(): { observedAt: string; high: number } {
  const file = JSON.parse(readFileSync(NWS_ARCHIVE, "utf8")) as {
    observations: { observedAt: string; seed?: boolean; value: NwsValue }[];
  };
  const hit = file.observations
    .filter((o) => !o.seed && typeof o.value.forecastHighF === "number" && o.value.forecastHighF >= 100)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  if (!hit) {
    throw new Error(
      `fixture-condition: no committed NWS observation for ${SOURCE_AREA_ID} forecasts >= 100F, ` +
        `so there is no real reading to build the condition on. Pick a different alert.`,
    );
  }
  return { observedAt: hit.observedAt, high: hit.value.forecastHighF! };
}

// -- the product's own copy -------------------------------------------------

export interface ExtractedTemplates {
  key: string; label: string; source: string;
  headline: string; detail: string; checklist: string[];
}

/**
 * Pulls the heat alert's template literals out of `alerts.ts`.
 *
 * Reading the product's source rather than restating it is the whole reason
 * `r7replay`'s "says area, never at your home" assertion still means something
 * once the card is fixture-driven. If this ever fails to parse, it throws -
 * a fixture that quietly falls back to its own words would be worse than none.
 */
export function extractHeatTemplates(): ExtractedTemplates {
  const src = readFileSync(ALERTS_SRC, "utf8");
  const start = src.indexOf(`key: "heat"`);
  if (start < 0) throw new Error(`fixture-condition: no heat alert in ${ALERTS_SRC}`);
  const end = src.indexOf("});", start);
  const block = src.slice(start, end);

  const one = (label: string, re: RegExp): string => {
    const m = block.match(re);
    if (!m) {
      throw new Error(
        `fixture-condition: could not read the heat alert's ${label} from alerts.ts.\n` +
          `    The product's templates moved. Fix this extractor rather than ` +
          `restating the copy here - the assertion depends on it being the product's.`,
      );
    }
    return m[1];
  };

  const label = one("label", /label:\s*"([^"]+)"/);
  const source = one("source", /source:\s*"([^"]+)"/);
  const headline = one("headline", /headline:\s*`([^`]+)`/);
  // The detail is a concatenation of adjacent template literals.
  const detailRaw = one("detail", /detail:\s*([\s\S]*?),\n\s*source:/);
  const detail = [...detailRaw.matchAll(/`([^`]*)`/g)].map((m) => m[1]).join("");
  if (!detail) throw new Error("fixture-condition: heat detail extracted empty");
  const checklistRaw = one("checklist", /checklist:\s*\[([\s\S]*?)\]/);
  const checklist = [...checklistRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (checklist.length === 0) throw new Error("fixture-condition: heat checklist extracted empty");

  return { key: "heat", label, source, headline, detail, checklist };
}

/** Fills the product's templates the way the product would fill them. */
export function renderTemplates(t: ExtractedTemplates, high: number): ExtractedTemplates {
  const fill = (s: string) =>
    s.replace(/\$\{areaLabel\(areaId\)\}/g, SOURCE_AREA_LABEL).replace(/\$\{high\}/g, String(high));
  const unresolved = (s: string) => /\$\{/.test(s);
  const out = { ...t, headline: fill(t.headline), detail: fill(t.detail) };
  if (unresolved(out.headline) || unresolved(out.detail)) {
    throw new Error(
      `fixture-condition: an interpolation in the heat template is not handled here:\n` +
        `    ${out.headline}\n    ${out.detail}`,
    );
  }
  return out;
}

// -- write ------------------------------------------------------------------

export function writeFixtureArtifact(): { path: string; alert: Record<string, unknown> } {
  if (!existsSync(SOURCE_ARTIFACT)) {
    throw new Error(
      `fixture-condition: no ${relative(SITE, SOURCE_ARTIFACT)} - run 'npm run build' first.`,
    );
  }
  assertCannotReachProduction();

  const obs = heatObservation();
  const t = renderTemplates(extractHeatTemplates(), obs.high);

  const alert = {
    key: t.key,
    label: t.label,
    // FIXTURE: so it is obvious in any dump, and so it can never collide with a
    // real conditionKey (which is `heat:<observedAt>`).
    conditionKey: `FIXTURE:${t.key}:${obs.observedAt}`,
    headline: t.headline,
    detail: t.detail,
    source: t.source,
    observedAt: obs.observedAt,
    checklist: t.checklist,
  };

  const base = JSON.parse(readFileSync(SOURCE_ARTIFACT, "utf8")) as Record<string, unknown>;
  const body = {
    __fixture: {
      isFixture: true,
      why: "Local replay harness only. Makes the event card render deterministically.",
      area: FIXTURE_AREA_ID,
      derivedFrom: `${SOURCE_AREA_ID}.json`,
      syntheticPart:
        `Only the recency. The ${obs.high}F reading at ${obs.observedAt} is a real committed ` +
        `NWS observation; it is simply not the latest one, so the product does not fire on it.`,
      copySource: "src/lib/account/alerts.ts (extracted, not restated)",
      neverCommitted: "written into dist/, which site/.gitignore ignores",
    },
    ...base,
    alerts: [alert],
  };

  writeFileSync(FIXTURE_ARTIFACT, JSON.stringify(body, null, 2));
  return { path: FIXTURE_ARTIFACT, alert: alert as unknown as Record<string, unknown> };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { path, alert } = writeFixtureArtifact();
  console.log(`\nwrote ${relative(SITE, path)}`);
  console.log(JSON.stringify(alert, null, 2));
}
