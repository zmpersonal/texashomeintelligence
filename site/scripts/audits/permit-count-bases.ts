/**
 * Round 45 — the same feeds counted both ways, in one run.
 *
 * Two ingestion runs would give a before and an after measured minutes apart
 * against a feed that changes daily, and any drift between them would be
 * indistinguishable from the defect. So this reads each feed ONCE and tallies it
 * on both bases simultaneously: rows (what the site published) and distinct
 * permits (what it should have). Every delta is therefore a property of the
 * counting, not of the clock.
 *
 * It also answers the two questions that decide whether per-category dedupe is
 * well defined at all: can one permit's rows carry different issue months, and
 * can they carry different permit types? If they can, a deduplicated permit
 * lands in more than one bucket, and that must be a stated choice rather than an
 * accident of iteration order.
 *
 * Read-only. Writes a JSON report; touches nothing under src/data/generated.
 *
 * Run: npx tsx scripts/audits/permit-count-bases.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseCsv, rowsToRecords } from "../../src/ingest/csv";
import { classifyAustin, classifySanAntonio, type Classification } from "../../src/ingest/tradeCategories";

const SINCE = new Date("2025-09-01T00:00:00.000Z");
const UNTIL = new Date("2026-10-01T00:00:00.000Z");
const SA_PACKAGE = "https://data.sanantonio.gov/api/3/action/package_show?id=building-permits";
const AUSTIN_URL = "https://data.austintexas.gov/resource/3syk-w9eu.json";

interface Tally {
  rows: number;
  permits: Set<string>;
  sourceRows: Map<string, number>;
  sourcePermits: Map<string, Set<string>>;
}
const tallyKey = (c: string, m: string) => c + " " + m;

function record(t: Map<string, Tally>, cs: Classification[], month: string, permitId: string): void {
  for (const c of cs) {
    const k = tallyKey(c.category, month);
    let e = t.get(k);
    if (!e) {
      e = { rows: 0, permits: new Set(), sourceRows: new Map(), sourcePermits: new Map() };
      t.set(k, e);
    }
    e.rows += 1;
    e.permits.add(permitId);
    e.sourceRows.set(c.sourceValue, (e.sourceRows.get(c.sourceValue) ?? 0) + 1);
    let sp = e.sourcePermits.get(c.sourceValue);
    if (!sp) {
      sp = new Set<string>();
      e.sourcePermits.set(c.sourceValue, sp);
    }
    sp.add(permitId);
  }
}

/** tradeActivity.ts's own arithmetic, copied so the verdicts reported here are
 * the ones the pages would render. */
function trend(monthly: number[]) {
  const mean = monthly.reduce((s, n) => s + n, 0) / (monthly.length || 1);
  const noisePct = mean > 0 ? (100 * Math.sqrt(mean)) / mean : Infinity;
  const half = Math.floor(monthly.length / 2);
  const first = monthly.slice(0, half).reduce((s, n) => s + n, 0);
  const second = monthly.slice(monthly.length - half).reduce((s, n) => s + n, 0);
  const changePct = first > 0 ? (second / first - 1) * 100 : 0;
  const clears = Math.abs(changePct) > noisePct;
  return {
    total: monthly.reduce((s, n) => s + n, 0),
    mean: Number(mean.toFixed(1)),
    noisePct: Number(noisePct.toFixed(2)),
    firstHalf: first,
    secondHalf: second,
    changePct: Number(changePct.toFixed(1)),
    clears,
    direction: !clears ? "flat" : changePct > 0 ? "rose" : "fell",
  };
}

function summarise(t: Map<string, Tally>) {
  const cats = [...new Set([...t.keys()].map((k) => k.split(" ")[0]))].sort();
  const current = new Date().toISOString().slice(0, 7);
  const out: Record<string, ReturnType<typeof oneCat>> = {};
  function oneCat(cat: string) {
    const months = [...t.keys()].filter((k) => k.startsWith(cat + " ")).map((k) => k.split(" ")[1]).sort();
    const rowSeries: Record<string, number> = {};
    const permitSeries: Record<string, number> = {};
    for (const m of months) {
      const e = t.get(tallyKey(cat, m))!;
      rowSeries[m] = e.rows;
      permitSeries[m] = e.permits.size;
    }
    const used = months.filter((m) => m < current);
    const srcRows = new Map<string, number>();
    const srcPermits = new Map<string, Set<string>>();
    for (const m of used) {
      const e = t.get(tallyKey(cat, m))!;
      for (const [v, n] of e.sourceRows) srcRows.set(v, (srcRows.get(v) ?? 0) + n);
      for (const [v, ids] of e.sourcePermits) {
        let s = srcPermits.get(v);
        if (!s) {
          s = new Set<string>();
          srcPermits.set(v, s);
        }
        for (const id of ids) s.add(id);
      }
    }
    return {
      monthsUsed: used,
      droppedIncomplete: months.filter((m) => m >= current),
      rowSeries,
      permitSeries,
      rows: trend(used.map((m) => rowSeries[m])),
      permits: trend(used.map((m) => permitSeries[m])),
      sourceValues: [...srcRows.keys()]
        .map((v) => ({ value: v, rows: srcRows.get(v)!, permits: srcPermits.get(v)!.size }))
        .sort((a, b) => b.permits - a.permits || a.value.localeCompare(b.value)),
    };
  }
  for (const cat of cats) out[cat] = oneCat(cat);
  return out;
}

async function sanAntonio() {
  const pkg = (await (await fetch(SA_PACKAGE)).json()) as {
    result?: { resources?: { name?: string; url?: string; last_modified?: string | null; created?: string | null }[] };
  };
  const cands = (pkg.result?.resources ?? []).filter((r) => /permits?\s*issued/i.test(r.name ?? ""));
  cands.sort((a, b) =>
    String(b.last_modified ?? b.created ?? "").localeCompare(String(a.last_modified ?? a.created ?? "")),
  );
  const chosen = cands[0];
  const res = await fetch(chosen.url!);
  if (!res.ok) throw new Error("SA CSV: HTTP " + res.status);
  const records = rowsToRecords(parseCsv(await res.text()));
  const hdrs = Object.keys(records[0]);
  const find = (c: string[]) => hdrs.find((h) => c.includes(h.trim().toUpperCase()))!;
  const dateCol = find(["DATE ISSUED", "ISSUE DATE", "ISSUED DATE"]);
  const typeCol = find(["PERMIT TYPE", "PERMIT_TYPE"]);
  const idCol = find(["PERMIT #", "PERMIT NUMBER", "PERMIT NO"]);

  const t = new Map<string, Tally>();
  const monthsPer = new Map<string, Set<string>>();
  const typesPer = new Map<string, Set<string>>();
  let inWindow = 0;
  let classified = 0;
  let noId = 0;
  for (const row of records) {
    const raw = row[dateCol];
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime()) || d < SINCE || d >= UNTIL) continue;
    inWindow += 1;
    const permitType = row[typeCol] ?? "";
    const cs = classifySanAntonio(permitType);
    if (cs.length === 0) continue;
    classified += 1;
    const month = d.toISOString().slice(0, 7);
    const rawId = (row[idCol] ?? "").trim();
    if (!rawId) noId += 1;
    const permitId = rawId || "__no-id__" + d.toISOString() + "#" + classified;
    if (rawId) {
      let ms = monthsPer.get(rawId);
      if (!ms) { ms = new Set<string>(); monthsPer.set(rawId, ms); }
      ms.add(month);
      let ts = typesPer.get(rawId);
      if (!ts) { ts = new Set<string>(); typesPer.set(rawId, ts); }
      ts.add(permitType.trim());
    }
    record(t, cs, month, permitId);
  }
  return {
    resource: { name: chosen.name, lastModified: chosen.last_modified },
    columns: { dateCol, typeCol, idCol },
    rowsInWindow: inWindow,
    classifiedRows: classified,
    rowsWithoutId: noId,
    distinctPermitsClassified: monthsPer.size,
    permitsSpanningMonths: [...monthsPer.values()].filter((s) => s.size > 1).length,
    permitsSpanningTypes: [...typesPer.values()].filter((s) => s.size > 1).length,
    categories: summarise(t),
  };
}

async function austin() {
  const where =
    "issue_date >= '" + SINCE.toISOString().slice(0, 19) + "' AND issue_date < '" + UNTIL.toISOString().slice(0, 19) + "'";
  const t = new Map<string, Tally>();
  const seen = new Set<string>();
  let classified = 0;
  let noId = 0;
  let rows = 0;
  for (let offset = 0; offset < 400_000; offset += 50_000) {
    const u = new URL(AUSTIN_URL);
    u.searchParams.set("$where", where);
    u.searchParams.set("$select", "permit_number,permit_type_desc,work_class,description,issue_date");
    u.searchParams.set("$limit", "50000");
    u.searchParams.set("$offset", String(offset));
    u.searchParams.set("$order", "issue_date");
    const token = process.env.SOCRATA_APP_TOKEN;
    const page = (await (await fetch(u, { headers: token ? { "X-App-Token": token } : {} })).json()) as Record<string, string>[];
    if (!Array.isArray(page) || page.length === 0) break;
    rows += page.length;
    for (const row of page) {
      if (!row.issue_date) continue;
      const cs = classifyAustin(row);
      if (cs.length === 0) continue;
      classified += 1;
      const month = new Date(row.issue_date).toISOString().slice(0, 7);
      const rawId = (row.permit_number ?? "").trim();
      if (!rawId) noId += 1;
      else seen.add(rawId);
      record(t, cs, month, rawId || "__no-id__" + row.issue_date + "#" + classified);
    }
    if (page.length < 50_000) break;
  }
  return {
    rowsFetched: rows,
    classifiedRows: classified,
    rowsWithoutId: noId,
    distinctPermitsClassified: seen.size,
    categories: summarise(t),
  };
}

const report: Record<string, unknown> = { window: { since: SINCE.toISOString(), until: UNTIL.toISOString() } };
report["san-antonio"] = await sanAntonio();
report["austin"] = await austin();
mkdirSync("tmp/r45", { recursive: true });
writeFileSync("tmp/r45/permit-count-bases.json", JSON.stringify(report, null, 2) + "\n");

for (const metro of ["san-antonio", "austin"] as const) {
  const m = report[metro] as { categories: Record<string, { rows: ReturnType<typeof trend>; permits: ReturnType<typeof trend> }> } & Record<string, unknown>;
  console.log("\n══ " + metro + " ══");
  for (const [k, v] of Object.entries(m)) if (k !== "categories") console.log("  " + k + ": " + JSON.stringify(v));
  console.log(
    "  " + "category".padEnd(12) + "rows".padStart(8) + "permits".padStart(9) + "delta".padStart(9) +
      "rows H/H".padStart(18) + "permits H/H".padStart(18) + "  verdict",
  );
  for (const [cat, v] of Object.entries(m.categories)) {
    const d = v.rows.total > 0 ? ((v.permits.total / v.rows.total - 1) * 100).toFixed(2) + "%" : "—";
    const flip = v.rows.clears !== v.permits.clears || v.rows.direction !== v.permits.direction;
    console.log(
      "  " + cat.padEnd(12) + String(v.rows.total).padStart(8) + String(v.permits.total).padStart(9) + d.padStart(9) +
        (v.rows.changePct + "% " + (v.rows.clears ? "clears" : "flat")).padStart(18) +
        (v.permits.changePct + "% " + (v.permits.clears ? "clears" : "flat")).padStart(18) +
        "  " + (flip ? "*** VERDICT CHANGES ***" : "same verdict"),
    );
  }
}
