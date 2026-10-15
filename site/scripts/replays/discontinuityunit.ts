/*
 * Round 52 — a discontinuity carries evidence, and the span test is exact.
 *
 * TWO JOBS. The first is the owner's requirement that evidence be structurally
 * required, not optional: the TYPE makes `evidence: []` a compile error (proven
 * — "Source has 0 element(s) but target requires 1"), and this makes a
 * FABRICATED entry a build error, by resolving every path against the repo.
 * A break with no evidence is a rumour, and a rumour here would license
 * withholding or relabelling a published figure on a hunch.
 *
 * The second is the span test, which is the only real logic in the record and
 * the easiest thing to get wrong by one month. A break at M separates months
 * before M from M onward, so a span crosses it only when it starts before M and
 * reaches M or later. Every boundary below is asserted, including the two that
 * look alike and are not: a span ENDING at M-1 crosses nothing, and a span
 * STARTING at M crosses nothing either.
 *
 * Run: npx tsx scripts/replays/discontinuityunit.ts   (from site/)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCONTINUITIES,
  discontinuitiesCrossed,
} from "../../src/data/discontinuities";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
let pass = 0, fail = 0;
const A = (label: string, ok: boolean, detail = ""): void => {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ""}`); }
};

console.log("\n══ 1 · EVERY BREAK CARRIES EVIDENCE THAT RESOLVES ══\n");
A(`the registry is non-empty (${DISCONTINUITIES.length})`, DISCONTINUITIES.length > 0);
for (const d of DISCONTINUITIES) {
  const id = `${d.datasetId}/${d.location}/${d.series}@${d.fromMonth}`;
  A(`${id}: has at least one evidence entry`, d.evidence.length > 0);
  for (const [i, e] of d.evidence.entries()) {
    A(`  evidence[${i}] says what it is`, e.what.trim().length > 10, e.what.slice(0, 48));
    A(`  evidence[${i}] carries a url or a path`, Boolean(e.url || e.path));
    if (e.path) {
      A(`  evidence[${i}] path exists in this repo`, existsSync(join(REPO, e.path)), e.path);
    }
    if (e.url) {
      // Not fetched: no replay should depend on a third party being up. Asserted
      // to be openable in shape, and the archived COPY is the durable evidence —
      // which is why the storage break carries a committed JSON beside the URL.
      A(`  evidence[${i}] url is absolute https`, /^https:\/\/\S+$/.test(e.url), e.url.slice(0, 54));
    }
  }
  A(`${id}: fromMonth is YYYY-MM`, /^\d{4}-\d{2}$/.test(d.fromMonth), d.fromMonth);
  A(`${id}: discoveredAt is a date`, /^\d{4}-\d{2}-\d{2}$/.test(d.discoveredAt), d.discoveredAt);
  A(`${id}: says what changed, in the source's terms`, d.what.length > 60);
  // A URL alone is not durable evidence: the live document can change under us,
  // which is exactly what happened to the thing this break records.
  A(`${id}: at least one evidence entry is a REPO PATH, not only a link`,
    d.evidence.some((e) => Boolean(e.path)));
}

console.log("\n══ 2 · THE SPAN TEST, AT EVERY BOUNDARY ══\n");
const D = "permit-trade-activity", L = "austin", S = "energy_storage", M = "2026-07";
const n = (a: string, b: string) => discontinuitiesCrossed(D, L, S, a, b).length;
A("a span straddling the break crosses it", n("2026-06", "2026-09") === 1, `${n("2026-06", "2026-09")}`);
A("a span ending the month BEFORE the break crosses nothing", n("2025-09", "2026-06") === 0);
A("a span starting AT the break crosses nothing", n(M, "2026-09") === 0);
A("a span entirely after the break crosses nothing", n("2026-08", "2026-09") === 0);
A("a span entirely before the break crosses nothing", n("2025-09", "2026-01") === 0);
A("the tightest straddle — M-1 to M — crosses it", n("2026-06", M) === 1);
A("a single month AT the break crosses nothing", n(M, M) === 0);
A("reversed arguments give the same answer", n("2026-09", "2026-06") === 1);

console.log("\n══ 3 · IT IS SCOPED TO WHAT IT AFFECTS ══\n");
A("another series in the same file is unaffected",
  discontinuitiesCrossed(D, L, "solar", "2026-06", "2026-09").length === 0);
A("another location is unaffected",
  discontinuitiesCrossed(D, "san-antonio", S, "2026-06", "2026-09").length === 0);
A("another dataset is unaffected",
  discontinuitiesCrossed("noaa-climate", L, "cooling_degree_days", "2025-09", "2026-09").length === 0);

console.log("\n══ 4 · THE RECORD IS NOT A VERSION ══\n");
/*
 * Round 50's solar re-base and Round 45's permit recount are OURS. Both
 * recomputed every month they hold, so neither leaves a break in a published
 * series — and recording one would be false. This asserts the file does not
 * drift into holding our own methodology changes, which is the mistake that
 * would make it meaningless.
 */
A("no entry claims cause other than `source`",
  DISCONTINUITIES.every((d) => d.cause === "source"));
A("no entry names a mapping version",
  !DISCONTINUITIES.some((d) => /trades-v\d|METHODOLOGY_VERSION/.test(d.what)));

console.log("\n══ 5 · THE JSON TWIN THE AUTOPOSTER READS CANNOT GO STALE ══\n");
/*
 * The TS module is authoritative: it is where the non-empty evidence tuple is
 * enforced at compile time. But the autoposter is Python, across the Rule 0
 * boundary, and it is the half that computes the month-over-month and N-month
 * baselines these breaks bear on — so it needs this record too.
 *
 * Parsing TypeScript from Python is how `withdrawnArticles` was read earlier,
 * and it took two attempts to get the regex right for a second entry: a
 * tolerant parser is a second definition that can disagree with the first. So
 * the TS emits a JSON twin, Python reads only the JSON, and this asserts the
 * two are identical — which makes drift a failed build rather than a quiet
 * disagreement between two readers of one fact.
 *
 * Regenerate with:  npx tsx scripts/replays/discontinuityunit.ts --write
 */
{
  const twin = join(REPO, "site", "src", "data", "discontinuities.json");
  const serialised = JSON.stringify(DISCONTINUITIES, null, 2) + "\n";
  if (process.argv.includes("--write")) {
    writeFileSync(twin, serialised);
    console.log(`  wrote ${twin}`);
  }
  const onDisk = existsSync(twin) ? readFileSync(twin, "utf8") : null;
  A("the JSON twin exists", onDisk !== null, twin);
  A("…and is byte-identical to the TypeScript record", onDisk === serialised,
    onDisk === serialised ? "" : "run with --write to regenerate");
}

console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
