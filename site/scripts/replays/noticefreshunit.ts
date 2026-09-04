/**
 * Round 10b — the review-cadence gate, tested at both edges.
 *
 * `assertNoticesFresh` is a build-stopping check, which makes it exactly the
 * kind of code nobody exercises until the day it fires — and the day it fires
 * is the day someone is under pressure to make it stop. So it is tested here:
 * that it passes today, that it fires one day past the cadence, that it does
 * NOT fire on the last good day, and that it rejects a malformed cadence.
 *
 * `staleNotices` takes `now` so this needs no clock manipulation and no
 * waiting three months.
 *
 * Run: npx tsx scripts/replays/noticefreshunit.ts     (from site/)
 */
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVICE_NOTICES,
  buildNow,
  staleNotices,
  assertNoticesFresh,
  reviewDueDate,
  type ServiceNotice,
} from "../../src/data/serviceNotices";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let pass = 0, fail = 0;
const A = (label: string, ok: boolean, note = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "**FAIL**"}  ${label}${note ? "  — " + note : ""}`);
};
const threw = (fn: () => void): string | null => {
  try { fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
};

console.log("\n══ THE NOTICES THAT SHIP TODAY ══");
const all = Object.entries(SERVICE_NOTICES).flatMap(([k, l]) => l.map((n) => ({ k, n })));
A("at least one dated claim is registered", all.length > 0, `${all.length} notice(s)`);
for (const { k, n } of all) {
  const due = reviewDueDate(n);
  A(`[${k}] "${n.heading.slice(0, 48)}…" is inside its cadence`,
    Date.now() <= due.getTime(),
    `confirmed ${n.confirmedOn}, every ${n.reviewEveryDays}d, due ${due.toISOString().slice(0, 10)}`);
  // A primary source is a government publisher — federal (.gov), a state
  // agency (*.<state>.gov), or the USDM's university host. Round 12 widened
  // this: the original list was federal-only and rejected tdlr.texas.gov,
  // which is exactly the kind of primary state source a page should cite.
  A(`[${k}] cites a primary source, not an aggregator`,
    /^https:\/\/([a-z0-9-]+\.)*gov\//.test(n.sourceUrl) || /^https:\/\/droughtmonitor\.unl\.edu/.test(n.sourceUrl),
    n.sourceUrl);
  // Round 14b. "Verified" without a date is a claim nobody can audit — and this
  // field now records a POSITIVE claim, not just a known gap, so it needs one.
  if (n.wordingVerifiedAgainstSource === true) {
    A(`[${k}] wording verified against source carries the date it was checked`,
      typeof n.wordingVerifiedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(n.wordingVerifiedOn),
      n.wordingVerifiedOn ?? "(missing)");
  }
  if (n.wordingVerifiedAgainstSource === false) {
    console.log(`          note: wording NOT checked against the source text — owner seam`);
  }
  if (n.urlVerifiedByFetch === false) {
    console.log(`          note: sourceUrl NOT fetch-verified from this environment — owner seam, see HANDOFF.md`);
  }
  A(`[${k}] carries a real cadence`, Number.isFinite(n.reviewEveryDays) && n.reviewEveryDays > 0,
    `${n.reviewEveryDays} days`);
}
A("nothing is stale today", staleNotices(SERVICE_NOTICES).length === 0);
A("assertNoticesFresh does not throw today", threw(() => assertNoticesFresh(SERVICE_NOTICES)) === null);

console.log("\n══ THE GATE FIRES WHEN IT SHOULD ══");
const sample: ServiceNotice = {
  heading: "Test claim",
  body: "…",
  sourceName: "IRS",
  sourceUrl: "https://www.irs.gov/",
  confirmedOn: "2026-01-01",
  reviewEveryDays: 90,
};
const fixture = { "test/page": [sample] };
const due = reviewDueDate(sample);
const dayBefore = new Date(due.getTime() - 86_400_000);
const dayAfter = new Date(due.getTime() + 86_400_000);

A("does NOT fire on the last good day", staleNotices(fixture, dayBefore).length === 0,
  dayBefore.toISOString().slice(0, 10));
A("does NOT fire exactly on the due date", staleNotices(fixture, due).length === 0,
  due.toISOString().slice(0, 10));
A("FIRES one day past the cadence", staleNotices(fixture, dayAfter).length === 1,
  dayAfter.toISOString().slice(0, 10));

const msg = threw(() => assertNoticesFresh(fixture, dayAfter));
A("assertNoticesFresh throws once past the cadence", msg !== null);
A("the error names the page, the claim and the source",
  !!msg && msg.includes("test/page") && msg.includes("Test claim") && msg.includes("irs.gov"));
A("the error says how overdue it is", !!msg && /1 day overdue/.test(msg));
A("the error says what to do, and what NOT to do",
  !!msg && /confirm the claim still/i.test(msg) && /Do NOT move the date without re-reading/i.test(msg));

console.log("\n══ THE CLOCK THE GATE RUNS ON ══");
// The single most important regression to guard. Astro evaluates modules under
// the Workers runtime, where `new Date()` at module scope returns the UNIX
// EPOCH — measured in Round 10b: `1970-01-01T00:00:00.000Z` during a real
// build. A gate written against that clock compares every review date to 1970,
// finds nothing overdue, and never fires. It looks closed and is a decoration.
// So the build injects a real timestamp, and these assertions make sure nobody
// quietly removes it.
{
  const config = readFileSync(join(SITE, "astro.config.mjs"), "utf8");
  A("astro.config.mjs injects a real build timestamp",
    /__THI_BUILD_TIME__:\s*JSON\.stringify\(new Date\(\)\.toISOString\(\)\)/.test(config));
  A("the injection sits in vite.define, so it reaches the module graph",
    /define:\s*\{[\s\S]{0,1200}__THI_BUILD_TIME__/.test(config));
  const src = readFileSync(join(SITE, "src", "data", "serviceNotices.ts"), "utf8");
  A("the gate calls buildNow(), not new Date()",
    /assertNoticesFresh\(SERVICE_NOTICES,\s*buildNow\(\)\)/.test(src));
  A("buildNow prefers the injected timestamp",
    /typeof __THI_BUILD_TIME__ === "string"/.test(src));
  A("buildNow falls back to the system clock outside a Vite build",
    /return new Date\(\);/.test(src) && buildNow().getFullYear() > 2000,
    buildNow().toISOString());
}

console.log("\n══ MALFORMED INPUT IS REJECTED, NOT IGNORED ══");
A("a zero cadence throws",
  threw(() => staleNotices({ x: [{ ...sample, reviewEveryDays: 0 }] })) !== null);
A("a negative cadence throws",
  threw(() => staleNotices({ x: [{ ...sample, reviewEveryDays: -1 }] })) !== null);
A("an unparseable confirmedOn throws",
  threw(() => staleNotices({ x: [{ ...sample, confirmedOn: "whenever" }] })) !== null);

console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
