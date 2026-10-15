/**
 * Round 50 — is a permit counted in more than one trade, and how often?
 *
 * MEASURES. Decides nothing, fixes nothing, writes no dataset file. The round's
 * question is whether our per-category counts can be added up, and if not, by
 * how much they overshoot and why.
 *
 * ── HOW EVERY REQUEST IS BUILT ──────────────────────────────────────────────
 * Through the ingestion fetcher's own code, per request — Round 49's standing
 * rule. Austin goes through `fetchAustinTradeRows`, which owns the predicate,
 * the resource URL, the `$select`, the page walk and the count(1) cross-check;
 * San Antonio through `sanAntonioCsvUrl` and `resolveHeader`. Classification
 * goes through `classifyAustin` / `classifySanAntonio`. Nothing here rebuilds a
 * request or re-states a mapping.
 *
 * What is still this file's own code is the TALLY: grouping classifications by
 * permit and counting the overlaps. A tally bug is therefore possible, which is
 * what the CONTROLS exist for — four predictions with answers known before the
 * run, stated in `controls` below. A control that fails means this probe is
 * wrong, not that the city's data is.
 *
 * ── PII: THIS FILE COMMITS NO FREE TEXT ─────────────────────────────────────
 * It used to. The first run wrote permit descriptions into the committed JSON,
 * having passed them through `redactPersonalShapes` — which catches address and
 * phone SHAPES and knows nothing about names. Two of the descriptions carried a
 * personal name, and they reached a public repo. A city permit record being
 * public is not a reason for this repo to republish it (Round 44's allowlist
 * ruling: allowlist what we ingest, never denylist what we don't).
 *
 * So descriptions are reduced to STRUCTURAL PREDICATES here — does the text
 * mention roof, solar, a battery — which is all the tally needs. Free text is
 * read from the run's own output during a hand-read and never written down.
 * Redaction is not a substitute for not collecting it.
 */
import { writeFileSync, readFileSync } from "node:fs";
import {
  fetchAustinTradeRows,
  recountWindow,
  sanAntonioCsvUrl,
  resolveHeader,
} from "../../src/ingest/fetchers/permitTradeActivity";
import { classifyAustin, classifySanAntonio } from "../../src/ingest/tradeCategories";
import { parseCsv, rowsToRecords } from "../../src/ingest/csv";

const OUT = new URL("../../../docs/audits/round-50-probe.json", import.meta.url);
const FOCUS = "2026-09";

type Cats = Set<string>;

/** What a description is, without being what it says. The only form of a
 * permit description this file is allowed to write down. */
function describe(text: string) {
  return {
    length: text.length,
    mentionsRoof: /roof/i.test(text),
    mentionsSolarOrPv: /\bsolar\b|photovoltaic|\bpv\b/i.test(text),
    mentionsBatteryOrStorage: /\bbatter|\bstorage\b|powerwall/i.test(text),
    mentionsKw: /\bkw\b/i.test(text),
  };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(" + ");
}

/** Per-category distinct-permit counts, the same quantity `toObservations` publishes. */
function categoryCounts(perPermit: Map<string, { cats: Cats; month: string }>) {
  const out = new Map<string, Map<string, Set<string>>>(); // month -> cat -> ids
  for (const [id, { cats, month }] of perPermit) {
    const m = out.get(month) ?? new Map<string, Set<string>>();
    for (const c of cats) {
      const s = m.get(c) ?? new Set<string>();
      s.add(id);
      m.set(c, s);
    }
    out.set(month, m);
  }
  return out;
}

function overlapReport(perPermit: Map<string, { cats: Cats; month: string }>, month: string) {
  const inMonth = [...perPermit.entries()].filter(([, v]) => v.month === month);
  const byCount = new Map<number, number>();
  const pairs = new Map<string, number>();
  const combos = new Map<string, number>();
  for (const [, { cats }] of inMonth) {
    byCount.set(cats.size, (byCount.get(cats.size) ?? 0) + 1);
    const list = [...cats].sort();
    if (list.length > 1) {
      combos.set(list.join(" + "), (combos.get(list.join(" + ")) ?? 0) + 1);
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const k = pairKey(list[i], list[j]);
          pairs.set(k, (pairs.get(k) ?? 0) + 1);
        }
    }
  }
  const counts: Map<string, Set<string>> =
    categoryCounts(perPermit).get(month) ?? new Map<string, Set<string>>();
  const pairsOfCount: [string, number][] = [...counts.entries()]
    .map(([c, s]): [string, number] => [c, s.size])
    .sort((a, b) => b[1] - a[1]);
  const perCategory: Record<string, number> = Object.fromEntries(pairsOfCount);
  const summed: number = pairsOfCount.reduce((s, [, n]) => s + n, 0);
  return {
    month,
    distinctPermitsClassified: inMonth.length,
    perCategory,
    sumOfPerCategory: summed,
    overshoot: summed - inMonth.length,
    permitsByCategoryCount: Object.fromEntries([...byCount.entries()].sort()),
    categoryPairs: Object.fromEntries([...pairs.entries()].sort((a, b) => b[1] - a[1])),
    categoryCombinations: Object.fromEntries([...combos.entries()].sort((a, b) => b[1] - a[1])),
  };
}

async function austin() {
  // The published window, from the ingestion's own function — not a window of
  // this file's choosing.
  const w = recountWindow(new Date().toISOString());
  const { rows, serverCount, where } = await fetchAustinTradeRows(
    w.since,
    w.until,
    process.env.SOCRATA_APP_TOKEN,
  );

  const perPermit = new Map<string, { cats: Cats; month: string }>();
  const multi: {
    permit: string;
    month: string;
    permit_type_desc: string;
    work_class: string;
    descriptionShape: ReturnType<typeof describe>;
    categories: string[];
    mechanisms: string[];
  }[] = [];
  let dropped = 0;
  let rowsWithoutId = 0;

  for (const row of rows) {
    if (!row.issue_date) continue;
    const month = new Date(row.issue_date).toISOString().slice(0, 7);
    const cls = classifyAustin(row);
    if (cls.length === 0) {
      dropped++;
      continue;
    }
    const rawId = (row.permit_number ?? "").trim();
    if (!rawId) rowsWithoutId++;
    const id = rawId || `__no-id__${row.issue_date}#${perPermit.size}`;
    const prev = perPermit.get(id) ?? { cats: new Set<string>(), month };
    for (const c of cls) prev.cats.add(c.category);
    perPermit.set(id, prev);

    if (cls.length > 1 && month === FOCUS) {
      multi.push({
        permit: rawId,
        month,
        permit_type_desc: (row.permit_type_desc ?? "").trim(),
        work_class: (row.work_class ?? "").trim(),
        descriptionShape: describe(row.description ?? ""),
        categories: cls.map((c) => c.category),
        mechanisms: cls.map((c) => `${c.category}:${c.mechanism}`),
      });
    }
  }

  // ── CONTROLS: answers known before the run ──
  const focus = overlapReport(perPermit, FOCUS);
  const committed = JSON.parse(
    readFileSync(new URL("../../src/data/generated/permit-trade-activity/austin.json", import.meta.url), "utf8"),
  );
  const published: Record<string, number> = {};
  for (const o of committed.observations) {
    if (o.seed) continue;
    if (o.value.mappingVersion !== "trades-v2") continue;
    if (o.value.month !== FOCUS) continue;
    published[o.value.category] = o.value.permitCount;
  }
  const eph = ["electrical", "plumbing", "hvac"];
  const ephSum = eph.reduce((s, c) => s + Number(focus.perCategory[c] ?? 0), 0);
  const ephOverlapping = [...perPermit.entries()].filter(
    ([, v]) => v.month === FOCUS && eph.filter((c) => v.cats.has(c)).length > 1,
  ).length;
  const roofSolar = Number(focus.categoryPairs["roofing + solar"] ?? 0);

  const controls = [
    {
      id: "A1",
      prediction: `recomputed ${FOCUS} per-category counts equal the committed file exactly`,
      expected: published,
      actual: focus.perCategory,
      // Compared key by key, so a difference in key ORDER cannot fail a control
      // that is meant to be about values. Both directions, so a category present
      // in one and absent from the other is caught either way round.
      pass:
        Object.keys(published).length === Object.keys(focus.perCategory).length &&
        Object.keys(published).every((k) => published[k] === focus.perCategory[k]),
      meaning: "a mismatch means THIS PROBE's read or tally is wrong, not the data",
    },
    {
      id: "A2",
      prediction: "electrical/plumbing/hvac are pairwise disjoint (one permit_type_desc per row)",
      expected: 0,
      actual: ephOverlapping,
      pass: ephOverlapping === 0,
      meaning: "if non-zero, a permit carries two trade permit types and the mechanism is not what the code implies",
    },
    {
      id: "A3",
      prediction: "electrical+plumbing+hvac sum to 4,027 for 2026-09 (from the committed file)",
      expected: 4027,
      actual: ephSum,
      pass: ephSum === 4027,
    },
    {
      id: "A4",
      prediction:
        "at least 25 permits are in BOTH roofing and solar — the Auxiliary Power rows counted " +
        "in the committed municipal-permits archive for 2026-09",
      expected: ">= 25",
      actual: roofSolar,
      pass: roofSolar >= 25,
    },
    {
      id: "A5",
      prediction: "count(1) and the paged read agree (asserted inside fetchAustinTradeRows)",
      expected: serverCount,
      actual: rows.length,
      pass: rows.length === serverCount,
    },
  ];

  const byMonth = [...categoryCounts(perPermit).keys()].sort().map((m) => {
    const r = overlapReport(perPermit, m);
    return {
      month: m,
      distinct: r.distinctPermitsClassified,
      summed: r.sumOfPerCategory,
      overshoot: r.overshoot,
      pctOvershoot: r.distinctPermitsClassified
        ? +((r.overshoot / r.distinctPermitsClassified) * 100).toFixed(2)
        : null,
    };
  });

  return {
    where,
    window: w,
    rowsRead: rows.length,
    serverCount,
    droppedByClassifier: dropped,
    rowsWithoutId,
    distinctPermitsAllMonths: perPermit.size,
    controls,
    focusMonth: focus,
    byMonth,
    handSample: multi,
  };
}

async function sanAntonio() {
  const w = recountWindow(new Date().toISOString());
  const url = await sanAntonioCsvUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`San Antonio CSV: HTTP ${res.status}`);
  const records = rowsToRecords(parseCsv(await res.text()));
  if (records.length === 0) throw new Error("San Antonio CSV: no records");

  const typeCol = resolveHeader(records[0], ["PERMIT TYPE", "PERMIT_TYPE", "PERMITTYPE", "TYPE"]);
  const dateCol = resolveHeader(records[0], [
    "DATE ISSUED", "ISSUE DATE", "ISSUED DATE", "ISSUE_DATE", "ISSUED_DATE",
    "APPROVED DATE", "DATE SUBMITTED",
  ]);
  const idCol = resolveHeader(records[0], [
    "PERMIT #", "PERMIT NUMBER", "PERMIT NO", "PERMIT_NO", "PERMITNUMBER", "RECORD NUMBER",
  ]);
  if (!typeCol || !dateCol || !idCol) throw new Error("San Antonio CSV: missing a required column");

  const perPermit = new Map<string, { cats: Cats; month: string }>();
  const typesPerPermit = new Map<string, Set<string>>();
  const monthsPerPermit = new Map<string, Set<string>>();
  const multi: { permit: string; month: string; permitTypes: string[]; categories: string[] }[] = [];
  let dropped = 0;

  for (const row of records) {
    const raw = row[dateCol];
    if (!raw) continue;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) continue;
    const observedAt = parsed.toISOString();
    if (observedAt < w.since || observedAt > w.until) continue;

    const permitType = row[typeCol] ?? "";
    const cls = classifySanAntonio(permitType);
    if (cls.length === 0) {
      dropped++;
      continue;
    }
    const month = observedAt.slice(0, 7);
    const rawId = (row[idCol] ?? "").trim();
    const id = rawId || `__no-id__${observedAt}#${perPermit.size}`;
    const prev = perPermit.get(id) ?? { cats: new Set<string>(), month };
    for (const c of cls) prev.cats.add(c.category);
    perPermit.set(id, prev);
    if (rawId) {
      const t = typesPerPermit.get(rawId) ?? new Set<string>();
      t.add(permitType.trim());
      typesPerPermit.set(rawId, t);
      const m = monthsPerPermit.get(rawId) ?? new Set<string>();
      m.add(month);
      monthsPerPermit.set(rawId, m);
    }
  }

  for (const [id, v] of perPermit) {
    if (v.cats.size > 1 && v.month === FOCUS) {
      multi.push({
        permit: id,
        month: v.month,
        permitTypes: [...(typesPerPermit.get(id) ?? [])],
        categories: [...v.cats].sort(),
      });
    }
  }

  const spanningTypes = [...typesPerPermit.values()].filter((v) => v.size > 1).length;
  const spanningMonths = [...monthsPerPermit.values()].filter((v) => v.size > 1).length;
  const spanningCategories = [...perPermit.values()].filter((v) => v.cats.size > 1).length;

  const focus = overlapReport(perPermit, FOCUS);
  const byMonth = [...categoryCounts(perPermit).keys()].sort().map((m) => {
    const r = overlapReport(perPermit, m);
    return {
      month: m,
      distinct: r.distinctPermitsClassified,
      summed: r.sumOfPerCategory,
      overshoot: r.overshoot,
      pctOvershoot: r.distinctPermitsClassified
        ? +((r.overshoot / r.distinctPermitsClassified) * 100).toFixed(2)
        : null,
    };
  });

  const controls = [
    {
      id: "S1",
      prediction:
        "classifySanAntonio returns at most ONE category per row, so any multi-category permit " +
        "must come from one permit number carrying SEVERAL permit types across rows",
      expected: "spanningCategories <= spanningTypes",
      actual: { spanningCategories, spanningTypes },
      pass: spanningCategories <= spanningTypes,
    },
  ];

  return {
    csvUrl: url.replace(/\?.*$/, ""),
    window: w,
    columns: { typeCol, dateCol, idCol },
    recordsInFile: records.length,
    droppedByClassifier: dropped,
    distinctPermitsAllMonths: perPermit.size,
    spanningTypes,
    spanningMonths,
    spanningCategories,
    controls,
    focusMonth: focus,
    byMonth,
    handSample: multi.slice(0, 60),
  };
}

/**
 * WHAT THE SOLAR COUNT IS MADE OF — the question the hand-read forced.
 *
 * Austin assigns solar two ways: `work_class = "Auxiliary Power"`, and a
 * description mentioning solar/photovoltaic/PV. The committed file's own
 * `sourceValues` show the first path supplying 194 of August 2026's 224 and 219
 * of September's 240, while the text path stays flat near 30 — and a hand-read
 * of 30 multi-category September permits found 24 carrying the identical
 * description "BASE: Installing a backup battery system and additional meter
 * socket", which names no solar at all.
 *
 * The mapping's own comment says the Auxiliary-Power-is-solar evidence was
 * measured "inside the roof-matched archive" — a subset selected by the word
 * roof, which rooftop solar contains and a battery cabinet does not. So the
 * 98.7% was measured on the one subset that cannot contain the counterexample.
 *
 * This counts the whole solar set instead, per month, with no subsetting: how
 * many solar-classified permits actually say solar, how many are Auxiliary Power
 * saying something else, and what that something else is.
 */
async function austinSolarComposition() {
  const w = recountWindow(new Date().toISOString());
  const { rows } = await fetchAustinTradeRows(w.since, w.until, process.env.SOCRATA_APP_TOKEN);
  const SOLAR_TEXT = /\bsolar\b|photovoltaic|\bpv\b/i;
  const STORAGE = /\bbatter|\bstorage\b|\bess\b|powerwall|\bess\b|backup\s+batter/i;
  const GENERATOR = /\bgenerator\b|\bgenset\b/i;

  type M = {
    solarTotal: Set<string>;
    saysSolar: Set<string>;
    auxOnly: Set<string>;
    auxOnlyStorage: Set<string>;
    auxOnlyGenerator: Set<string>;
    auxOnlyOther: Set<string>;
    otherExamples: Map<string, number>;
  };
  const months = new Map<string, M>();
  const blank = (): M => ({
    solarTotal: new Set(), saysSolar: new Set(), auxOnly: new Set(),
    auxOnlyStorage: new Set(), auxOnlyGenerator: new Set(), auxOnlyOther: new Set(),
    otherExamples: new Map(),
  });

  for (const row of rows) {
    if (!row.issue_date) continue;
    const cls = classifyAustin(row);
    if (!cls.some((c) => c.category === "solar")) continue;
    const month = new Date(row.issue_date).toISOString().slice(0, 7);
    const m = months.get(month) ?? blank();
    const id = (row.permit_number ?? "").trim() || `__no-id__${row.issue_date}`;
    const desc = row.description ?? "";
    m.solarTotal.add(id);
    if (SOLAR_TEXT.test(desc)) m.saysSolar.add(id);
    else {
      m.auxOnly.add(id);
      if (STORAGE.test(desc)) m.auxOnlyStorage.add(id);
      else if (GENERATOR.test(desc)) m.auxOnlyGenerator.add(id);
      else {
        m.auxOnlyOther.add(id);
        // A SHAPE, never the text. See the header.
        const key = JSON.stringify(describe(desc));
        m.otherExamples.set(key, (m.otherExamples.get(key) ?? 0) + 1);
      }
    }
    months.set(month, m);
  }

  const byMonth = [...months.keys()].sort().map((k) => {
    const m = months.get(k)!;
    return {
      month: k,
      solarTotal: m.solarTotal.size,
      saysSolar: m.saysSolar.size,
      noSolarText: m.auxOnly.size,
      pctNoSolarText: m.solarTotal.size
        ? +((m.auxOnly.size / m.solarTotal.size) * 100).toFixed(1)
        : null,
      noSolarText_storage: m.auxOnlyStorage.size,
      noSolarText_generator: m.auxOnlyGenerator.size,
      noSolarText_other: m.auxOnlyOther.size,
      topOtherDescriptions: Object.fromEntries(
        [...m.otherExamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      ),
    };
  });

  const aug = byMonth.find((r) => r.month === "2026-08");
  const jul = byMonth.find((r) => r.month === "2026-07");
  return {
    question:
      "of the permits counted as solar, how many say solar — and what are the rest?",
    byMonth,
    thePublishedClaim: {
      article: "/analysis/is-austins-home-improvement-boom-cooling-off/",
      claim: "Austin issued 224 solar permits in August 2026 - up 138% month over month",
      august: aug,
      july: jul,
      momOnSaysSolarOnly:
        aug && jul && jul.saysSolar
          ? +(((aug.saysSolar - jul.saysSolar) / jul.saysSolar) * 100).toFixed(1)
          : null,
      note:
        "momOnSaysSolarOnly recomputes the published month-over-month using ONLY permits whose " +
        "description names solar. It is a diagnostic, not a proposed replacement figure.",
    },
  };
}

/**
 * Where the backlog's 4,233 came from — asked, not assumed.
 *
 * Round 49's probe called `austinTradeWhere('2026-09-01T00:00:00.000',
 * '2026-10-01T00:00:00.000')`. Socrata's `between` is inclusive at BOTH ends, so
 * that window is September plus the 1st of October, and the 4,233 it returned is
 * not a September figure. The ingestion never bounds a month this way: its
 * predicate spans the whole recount window and each row's month comes from
 * parsing its own `issue_date`.
 *
 * Prediction before running: September alone is 4,090 (what this probe counted by
 * parsing rows), the right-inclusive window is 4,233, and the difference is the
 * 143 permits issued on 2026-10-01.
 */
async function windowBoundary() {
  const ask = async (since: string, until: string) => {
    const { serverCount, where } = await fetchAustinTradeRows(since, until, process.env.SOCRATA_APP_TOKEN);
    return { since, until, where, rows: serverCount };
  };
  const inclusive = await ask("2026-09-01T00:00:00.000", "2026-10-01T00:00:00.000");
  const septOnly = await ask("2026-09-01T00:00:00.000", "2026-09-30T23:59:59.999");
  const oct1Only = await ask("2026-10-01T00:00:00.000", "2026-10-01T23:59:59.999");
  return {
    explanation:
      "Socrata `between` is inclusive at both ends, so Round 49's September window included " +
      "2026-10-01 and its 4,233 is not a September figure.",
    rightInclusiveWindow: inclusive,
    septemberOnly: septOnly,
    october1Only: oct1Only,
    controls: [
      {
        id: "W1",
        prediction: "the right-inclusive window reproduces Round 49's row count",
        expected: 4233,
        actual: inclusive.rows,
        pass: inclusive.rows === 4233,
        note: "rows, not distinct permits — Austin measured 0.00% duplication, so they are equal",
      },
      {
        id: "W2",
        prediction: "September alone equals what this probe counted by parsing issue_date",
        expected: 4090,
        actual: septOnly.rows,
        pass: septOnly.rows === 4090,
      },
      {
        id: "W3",
        prediction: "the gap is exactly the permits issued on 2026-10-01",
        expected: inclusive.rows - septOnly.rows,
        actual: oct1Only.rows,
        pass: inclusive.rows - septOnly.rows === oct1Only.rows,
      },
    ],
  };
}

const out = {
  measuredAt: new Date().toISOString(),
  focusMonth: FOCUS,
  note:
    "Round 50. Measurement only. Every request is built by the ingestion fetcher's own code; " +
    "the tally is this probe's and is checked by the controls.",
  austin: await austin(),
  sanAntonio: await sanAntonio(),
  windowBoundary: await windowBoundary(),
  austinSolarComposition: await austinSolarComposition(),
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT.pathname}`);
for (const c of [...out.austin.controls, ...out.sanAntonio.controls, ...out.windowBoundary.controls]) {
  console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.id}  ${c.prediction}`);
}
console.log(
  `  AUSTIN ${FOCUS}: ${out.austin.focusMonth.distinctPermitsClassified} distinct, ` +
    `summed ${out.austin.focusMonth.sumOfPerCategory}, overshoot ${out.austin.focusMonth.overshoot}`,
);
console.log(
  `  SAN ANTONIO ${FOCUS}: ${out.sanAntonio.focusMonth.distinctPermitsClassified} distinct, ` +
    `summed ${out.sanAntonio.focusMonth.sumOfPerCategory}, overshoot ${out.sanAntonio.focusMonth.overshoot}`,
);
