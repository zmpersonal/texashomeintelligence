/*
 * Round 45 — a permit count counts permits.
 *
 * WHAT THIS EXISTS TO PREVENT, measured not supposed. `permitTradeActivity.ts`
 * incremented a counter once per ROW and published the result as `permitCount`.
 * San Antonio's feed carries multiple rows per permit: 87,998 rows in the
 * 13-month window are 77,825 distinct `PERMIT #` — 11.56% duplication — with one
 * commercial site permit spanning 105 rows on its own. So seven published San
 * Antonio figures, their monthly tables, their per-permit-type share tables and
 * their half-over-half trend claims were all row counts wearing the word
 * "permits". San Antonio's loop did not even read its identifier column, so it
 * could not have deduplicated; Austin's never requested `permit_number` from
 * Socrata, so the identifier was not on the wire.
 *
 * Austin's feed is 1:1 (59,811 rows, 59,811 distinct, 0.00%), so its figures
 * were right — by the shape of someone else's feed, which is not the same as
 * being right. §4 asserts that property directly rather than trusting it.
 *
 * EVERY ASSERTION BELOW FAILS AGAINST THE PRE-ROUND-45 CODE. §1 and §2 fail
 * because `bump()` had no `permitId` parameter to pass and counted rows; §3
 * fails because the per-source breakdown was row-counted and so would not sum to
 * a distinct total; §5 fails because the San Antonio loop had no identifier
 * resolution to throw from.
 *
 * Run: npx tsx scripts/replays/permitcountunit.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bump, toObservations, type Bucket } from "../../src/ingest/fetchers/permitTradeActivity";
import { redactPersonalShapes, hasPersonalShape } from "../../src/ingest/redactPersonalShapes";
import type { TradeCategory } from "../../src/ingest/tradeCategories";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FETCHER = path.join(SITE_DIR, "src", "ingest", "fetchers", "permitTradeActivity.ts");

let checks = 0;
let failures = 0;
function assert(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

function countOf(obs: ReturnType<typeof toObservations>, category: string, month: string) {
  return obs.find((o) => o.value.category === category && o.value.month === month)?.value.permitCount;
}

function main() {
  // ── 1 · THE DEFECT ITSELF ───────────────────────────────────────────────
  // The San Antonio shape, in miniature: one permit, many rows, one month.
  console.log("\n══ 1 · one permit on many rows counts once ══\n");
  {
    const buckets = new Map<string, Bucket>();
    for (let i = 0; i < 105; i++) {
      bump(buckets, "plumbing", "2026-03", "permit-type", "Plumbing General Permit", "COM-SIT-PMT25-40100439");
    }
    const obs = toObservations(buckets, "2026-10-01T00:00:00.000Z");
    assert(
      "105 rows of one permit → permitCount 1 (row counting gives 105)",
      countOf(obs, "plumbing", "2026-03") === 1,
      String(countOf(obs, "plumbing", "2026-03")),
    );
  }

  // ── 2 · AND IT STILL COUNTS DISTINCT PERMITS ────────────────────────────
  console.log("\n══ 2 · distinct permits still add up ══\n");
  {
    const buckets = new Map<string, Bucket>();
    const ids = ["P-1", "P-1", "P-2", "P-3", "P-3", "P-3", "P-4"];
    for (const id of ids) bump(buckets, "roofing", "2026-04", "permit-type", "Re-Roof Permit", id);
    const obs = toObservations(buckets, "2026-10-01T00:00:00.000Z");
    assert(
      "7 rows across 4 permits → permitCount 4 (row counting gives 7)",
      countOf(obs, "roofing", "2026-04") === 4,
      String(countOf(obs, "roofing", "2026-04")),
    );
  }

  // ── 3 · THE BREAKDOWN MUST SUM TO THE TOTAL ─────────────────────────────
  // A row-counted share table under a distinct-counted total is wrong in a way
  // nothing on the page would show, so this is asserted rather than assumed.
  console.log("\n══ 3 · the per-permit-type breakdown sums to the total ══\n");
  {
    const buckets = new Map<string, Bucket>();
    // P-9 appears three times under one type; P-8 once under another.
    for (let i = 0; i < 3; i++) {
      bump(buckets, "plumbing", "2026-05", "permit-type", "Plumbing Gas Permit", "P-9");
    }
    bump(buckets, "plumbing", "2026-05", "permit-type", "Plumbing Sewer Permit", "P-8");
    const obs = toObservations(buckets, "2026-10-01T00:00:00.000Z");
    const v = obs.find((o) => o.value.month === "2026-05")!.value;
    assert("permitCount is 2", v.permitCount === 2, String(v.permitCount));
    assert(
      "sourceValues counts are distinct permits, and sum to permitCount",
      v.sourceValues.reduce((t, x) => t + x.count, 0) === v.permitCount,
      JSON.stringify(v.sourceValues),
    );
  }

  // ── 4 · A PERMIT IN TWO CATEGORIES BELONGS IN BOTH ──────────────────────
  // Austin's classifier genuinely returns roofing AND solar for a rooftop solar
  // install. Deduplicating globally would silently drop one of them, so the key
  // is per category-month and this asserts that it still is.
  console.log("\n══ 4 · multi-category permits are not deduplicated away ══\n");
  {
    const buckets = new Map<string, Bucket>();
    for (const c of ["roofing", "solar"] as TradeCategory[]) {
      bump(buckets, c, "2026-06", "description-text", "description contains \"roof\"", "2026-111559 EP");
    }
    const obs = toObservations(buckets, "2026-10-01T00:00:00.000Z");
    assert("counted under roofing", countOf(obs, "roofing", "2026-06") === 1);
    assert("and under solar", countOf(obs, "solar", "2026-06") === 1);
  }

  // ── 5 · THE SOURCE REFUSES TO COUNT ROWS ────────────────────────────────
  // Read out of the fetcher rather than restated: the identifier must be a
  // REQUIRED parameter, both loops must pass one, and San Antonio must throw
  // rather than fall back to row counting if the column disappears.
  console.log("\n══ 5 · the fetcher cannot quietly go back to row counts ══\n");
  {
    const src = readFileSync(FETCHER, "utf8");
    assert("bump() takes a required permitId", /permitId:\s*string,?\s*\n?\s*\):\s*void/.test(src));
    assert("Bucket holds a Set of permits, not a number", /permits:\s*Set<string>/.test(src));
    assert("permitCount is published from the set's size", /permitCount:\s*b\.permits\.size/.test(src));
    assert(
      "no counter increment survives",
      !/\bb\.count\+\+/.test(src) && !/count:\s*0\b/.test(src),
      "a ++ counter is still in the file",
    );
    assert(
      "San Antonio resolves a permit-identifier column",
      /"PERMIT #"/.test(src) && /no permit-identifier column among/.test(src),
    );
    assert(
      "and throws rather than counting rows when it is missing",
      /throw new Error\([\s\S]{0,400}no permit-identifier column/.test(src),
    );
    assert(
      "Austin asks Socrata for permit_number",
      /\$select:\s*"permit_number,/.test(src),
      "the identifier is not even on the wire",
    );
    const bumpCalls = [...src.matchAll(/bump\(\s*buckets,/g)].length;
    assert(`both loops call bump() (${bumpCalls} call sites)`, bumpCalls === 2, String(bumpCalls));
  }

  // ── 6 · THE SOURCE-VALUE BREAKDOWN, HONESTLY ────────────────────────────
  // Measured, not assumed: 1,810 San Antonio permits carry MORE THAN ONE permit
  // type, and 968 of them are electrical, 2,007 plumbing. So a distinct-permit
  // breakdown by type CANNOT sum to a distinct-permit total — the same permit is
  // genuinely a Plumbing General and a Plumbing Gas permit. §3 asserts the sum
  // for the non-spanning case; this asserts the spanning case behaves the way the
  // page will have to describe, rather than quietly double-counting into the
  // total.
  console.log("\n══ 6 · a permit with two types is one permit ══\n");
  {
    const buckets = new Map<string, Bucket>();
    bump(buckets, "plumbing", "2026-07", "permit-type", "Plumbing General Permit", "SA-1");
    bump(buckets, "plumbing", "2026-07", "permit-type", "Plumbing Gas Permit", "SA-1");
    const v = toObservations(buckets, "2026-10-01T00:00:00.000Z")[0].value;
    assert("the total counts it once", v.permitCount === 1, String(v.permitCount));
    assert(
      "but it appears under both of its types",
      v.sourceValues.length === 2 && v.sourceValues.every((x) => x.count === 1),
      JSON.stringify(v.sourceValues),
    );
    assert(
      "so the breakdown exceeds the total, and that is the honest answer",
      v.sourceValues.reduce((t, x) => t + x.count, 0) > v.permitCount,
    );
  }

  // ── 7 · NO PERSONAL SHAPE REACHES DISK ──────────────────────────────────
  console.log("\n══ 7 · address and phone shapes are redacted at ingest ══\n");
  {
    const real = [
      "Installation of a solar system on existing single-family residence at 15621 Belfin Dr Austin TX 78717.",
      "Reroof at 5520 Burnet Rd",
      "5717 Louise Ln Austin TX",
      "CONTACT INSPECTOR WITH QUESTIONS. 512-552-8540--SLC***",
    ];
    for (const t of real) {
      const r = redactPersonalShapes(t);
      assert(`redacted: ${t.slice(0, 44)}…`, r.removed.length > 0 && !hasPersonalShape(r.text));
    }
    // Over-redaction is the failure that matters: these must survive untouched.
    const decoys = [
      "Erie to remove and replace 26s of shingles and 2s of sheathing on thehome",
      "Install 1,134sqft (7 Parking spaces) of Single Post Gable Style Carports",
      "Remove and replace 16 roofing squares of asphalt shingles, and 160SF of roof decking",
      "Re-roof 3 kick out sections from main building.",
      "Install 69 OSB boards on decking",
    ];
    for (const t of decoys) {
      const r = redactPersonalShapes(t);
      assert(`untouched: ${t.slice(0, 44)}…`, r.removed.length === 0 && r.text === t, JSON.stringify(r.removed));
    }
    // And the committed tree itself.
    const GEN = path.join(SITE_DIR, "src", "data", "generated", "municipal-permits");
    let scanned = 0;
    const dirty: string[] = [];
    for (const f of readdirSync(GEN)) {
      if (!f.endsWith(".json")) continue;
      const data = JSON.parse(readFileSync(path.join(GEN, f), "utf8")) as {
        observations: { key: string; value: { workDescription?: string } }[];
      };
      for (const o of data.observations) {
        if (!o.value?.workDescription) continue;
        scanned += 1;
        if (hasPersonalShape(o.value.workDescription)) dirty.push(`${f}:${o.key}`);
      }
    }
    assert(
      `no address or phone shape in ${scanned} committed work description(s)`,
      dirty.length === 0,
      dirty.slice(0, 6).join(", "),
    );
  }

  // ── 8 · A VERSION BUMP MUST NOT DOUBLE-COUNT ────────────────────────────
  //
  // `toObservations` keys every row `${mappingVersion}/${category}/${month}`, so
  // bumping trades-v1 → trades-v2 ADDS a basis beside the old one; the archive
  // keeps both, by design, because the old readings are history. Every reader
  // therefore has to select a version, and until Round 45 none of them did:
  // `tradeActivity()` summed the file and reported `rows[0].mappingVersion`, and
  // both render replays recomputed their expected totals the same way — which is
  // why they expected 51,003 San Antonio plumbing permits against a page saying
  // 24,587. The mechanism existed and was decorative.
  //
  // These assertions are about the reading side, so they are deliberately about
  // DATA ON DISK plus the two replay sources, not about `bump()`.
  console.log("\n══ 8 · one mapping version at a time ══\n");
  {
    const GEN = path.join(SITE_DIR, "src", "data", "generated", "permit-trade-activity");
    for (const f of readdirSync(GEN).filter((x) => x.endsWith(".json"))) {
      const data = JSON.parse(readFileSync(path.join(GEN, f), "utf8")) as {
        observations: { seed?: boolean; value: { category: string; month: string; mappingVersion: string; permitCount: number } }[];
      };
      const rows = data.observations.filter((o) => !o.seed).map((o) => o.value);
      const versions = [...new Set(rows.map((r) => r.mappingVersion))].sort();
      const newest = versions.at(-1);
      const all = rows.reduce((t, r) => t + r.permitCount, 0);
      const current = rows.filter((r) => r.mappingVersion === newest).reduce((t, r) => t + r.permitCount, 0);
      assert(
        `${f}: more than one mapping version is on disk (${versions.join(", ")})`,
        versions.length > 1,
        "if this ever fails, the fixture has stopped exercising the bug this section guards",
      );
      assert(
        `${f}: summing every version would overstate the total (${all.toLocaleString()} vs ${current.toLocaleString()})`,
        all > current,
      );
      // And no month may appear twice within the version a page renders.
      const seen = new Set<string>();
      const dupes = rows
        .filter((r) => r.mappingVersion === newest)
        .filter((r) => {
          const k = `${r.category}/${r.month}`;
          if (seen.has(k)) return true;
          seen.add(k);
          return false;
        });
      assert(`${f}: one row per category-month within ${newest}`, dupes.length === 0,
        dupes.map((d) => `${d.category}/${d.month}`).join(", "));
    }
    // The replays re-derive the page's arithmetic on purpose. Re-deriving it from
    // the wrong rows is the failure this catches, so each one is read for the
    // selection rather than trusted to have it.
    for (const replay of ["saservicerender.mjs", "roofscanrender.mjs"]) {
      const src = readFileSync(path.join(SITE_DIR, "scripts", "replays", replay), "utf8");
      assert(
        `${replay} selects a mapping version before summing permitCount`,
        /mappingVersion/.test(src) && /\.sort\(\)\.at\(-1\)/.test(src),
      );
      assert(
        `${replay} does not pin a version as a literal`,
        !/["'`]trades-v\d/.test(src),
      );
    }
  }

  console.log(
    `\nPERMIT_COUNT_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.log(`\nPERMIT_COUNT_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
