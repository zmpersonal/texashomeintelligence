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
 * THE THIRD JOB, added with the policy: that the reader HONOURS the record.
 * §6 drives `segmentsOf` — the one function that decides which months a figure
 * may be computed from — at the boundary in both directions, and proves the
 * slicing is what withholds the figure by running the same months with the
 * record removed and watching a different answer come out.
 *
 * Run: npx tsx scripts/replays/discontinuityunit.ts   (from site/)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCONTINUITIES,
  discontinuitiesCrossed,
  type Discontinuity,
} from "../../src/data/discontinuities";
// From the pure module, not from `tradeActivity.ts` — that one reaches the
// generated datasets through `import.meta.glob`, which does not exist outside a
// Vite build, so importing it here would make this replay unrunnable.
import {
  MIN_SEGMENT_MONTHS,
  segmentsOf,
  type TradeObservation,
} from "../../src/lib/tradeSegments";

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

  /*
   * ── ROUND 54: A DETECTOR'S OUTPUT IS NOT ADMISSIBLE AS EVIDENCE ────────
   * The owner's condition on the shape detector: a flag is a suspicion and only an
   * investigation with evidence produces a record. The type already makes a flag
   * unassignable to a record (`shapeflagunit.ts` §2 carries the compiler's own words). This
   * closes the other route — a hand-written record that cites the detector's own output and
   * so launders a suspicion into a finding.
   *
   * The rule: at least one evidence path must be something a HUMAN put in the repo. Generated
   * datasets, the detector's live-path verification and the fingerprint measurements are all
   * machine output, and none of them establishes what a source did; what does is an audit
   * someone wrote or an archived copy of the source's own document. Today's entry cites the
   * Round 51 audit and the archived permitting manual, so it passes on both.
   */
  const machineOutput = (path: string): boolean =>
    path.startsWith("site/src/data/generated/") ||
    /round-5[34]-(fingerprint|rules|detector-live|textcheck)\.json$/.test(path);
  A(`${id}: evidence includes something a human put in the repo`,
    d.evidence.some((e) => e.path && !machineOutput(e.path)),
    d.evidence.map((e) => e.path ?? e.url ?? "?").join(" · "));
  for (const [i, e] of d.evidence.entries()) {
    if (e.path && machineOutput(e.path)) {
      A(`  evidence[${i}] is machine output and is not the only evidence`,
        d.evidence.some((o) => o.path && !machineOutput(o.path)), e.path);
    }
  }
}

/*
 * NON-VACUOUS. The admissibility rule above has to be able to refuse, so it is run against a
 * record whose only evidence is the detector's own output — the exact laundering it exists to
 * stop — and against one that cites a generated dataset.
 */
{
  const machineOutput = (path: string): boolean =>
    path.startsWith("site/src/data/generated/") ||
    /round-5[34]-(fingerprint|rules|detector-live|textcheck)\.json$/.test(path);
  const admissible = (paths: string[]): boolean => paths.some((p) => !machineOutput(p));
  A("a record evidenced only by the detector's output is refused",
    !admissible(["docs/audits/round-54-detector-live.json"]));
  A("a record evidenced only by a generated dataset is refused",
    !admissible(["site/src/data/generated/permit-trade-activity/austin.json"]));
  A("a record evidenced by an audit a human wrote is admitted",
    admissible(["docs/audits/round-51-storage-series.md"]));
  A("…and the detector's output alongside it is fine",
    admissible(["docs/audits/round-54-detector-live.json", "docs/audits/round-51-storage-series.md"]));
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

console.log("\n══ 6 · THE READER HONOURS IT — POLICY C, THE WINDOW IS CUT ══\n");
/*
 * A for month-over-month and C for baselines (owner, Round 52). The site
 * publishes no month-over-month figure — its claims are a monthly table and a
 * half-over-half window — so A lives where that claim is made, in the
 * autoposter (`_figure`, `_area_metric`, both article builders), asserted in
 * `autoposter/tests/test_discontinuities.py`. What this asserts is C, which is
 * the whole of the policy on this side.
 */
const months = (from: number, to: number, count = 10): TradeObservation[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    category: "energy_storage",
    month: `2026-${String(from + i).padStart(2, "0")}`,
    permitCount: count,
    mappingVersion: "trades-v3",
    mechanisms: ["work-class"],
    sourceValues: [{ value: "hand-built for a test", count }],
  }));
const live = DISCONTINUITIES.find(
  (d) => d.series === "energy_storage" && d.location === "austin") as Discontinuity;
A("the live storage break is the case §6 runs on", Boolean(live), live?.fromMonth);

{
  // Thirteen months either side of the live break's month, as the series holds today.
  const rows = months(1, 9);
  const segs = segmentsOf(rows, [live]);
  A("a spanned window becomes two segments", segs.length === 2,
    segs.map((s) => `${s.fromMonth}..${s.toMonth}`).join(" | "));
  A("…cut exactly at the break's own month", segs[1]?.fromMonth === live.fromMonth,
    `${segs[0]?.toMonth} then ${segs[1]?.fromMonth}`);
  A("…and the near side names the break that opened it",
    segs[1]?.openedBy?.fromMonth === live.fromMonth);
  A("the near side publishes nothing — three months, under the minimum",
    segs[1]?.comparison === undefined && Boolean(segs[1]?.withheld),
    segs[1]?.withheld?.reason);
  A("…and the reason states the minimum rather than implying one",
    segs[1]?.withheld?.minimumMonths === MIN_SEGMENT_MONTHS &&
      segs[1]?.withheld?.reason.includes(String(MIN_SEGMENT_MONTHS)));
  A("the far side is long enough and keeps its own figures",
    segs[0]?.comparison !== undefined &&
      segs[0]?.comparison?.windowEnd === "2026-06");
  A("…and no segment's figures reach across the cut",
    segs.every((s) => (s.comparison?.months ?? []).every(
      (m) => (s.openedBy ? m.month >= live.fromMonth : m.month < live.fromMonth))));

  // NON-VACUOUS, the Round 41a way: the same rows with the record removed produce one
  // segment whose figures are the whole window's. So what withholds the near side is the
  // record, not the shape of these numbers.
  const unbroken = segmentsOf(rows, []);
  A("the same months with no break recorded: one segment, figures published",
    unbroken.length === 1 && unbroken[0].comparison !== undefined);
  A("…covering every month, which the segmented version refuses to do",
    unbroken[0].comparison?.monthCount === rows.length &&
      segs.every((s) => (s.comparison?.monthCount ?? 0) < rows.length),
    `${unbroken[0].comparison?.monthCount} vs ${segs.map((s) => s.comparison?.monthCount ?? 0).join("/")}`);
}

{
  // The boundary, asserted at the boundary. Exactly MIN publishes; one fewer does not.
  const at = segmentsOf(months(7, 6 + MIN_SEGMENT_MONTHS), [live]);
  A(`a near side of exactly ${MIN_SEGMENT_MONTHS} months publishes`,
    at.length === 1 && at[0].comparison !== undefined,
    `${at[0]?.fromMonth}..${at[0]?.toMonth}`);
  const under = segmentsOf(months(7, 5 + MIN_SEGMENT_MONTHS), [live]);
  A(`a near side of ${MIN_SEGMENT_MONTHS - 1} does not`,
    under.length === 1 && under[0].comparison === undefined &&
      under[0].withheld?.monthCount === MIN_SEGMENT_MONTHS - 1);

  // And the minimum governs a window that was CUT, not every window: a short series with
  // no break recorded is governed by what already governed it, which this round did not
  // touch. Asserted because the two cases differ by the record alone.
  const shortAndWhole = segmentsOf(months(7, 8), []);
  A("a short window with no break recorded still publishes",
    shortAndWhole.length === 1 && shortAndWhole[0].comparison?.monthCount === 2);
}

{
  // A break at the very first month of the window leaves ONE segment, not an empty one
  // in front of it — the off-by-one that would have shipped a `compare([])`.
  const atStart = segmentsOf(months(7, 9), [live]);
  A("a break at the window's first month leaves one segment",
    atStart.length === 1 && atStart[0].fromMonth === "2026-07");
  A("…and it is marked as opened by the break",
    atStart[0]?.openedBy?.fromMonth === live.fromMonth);
}

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
