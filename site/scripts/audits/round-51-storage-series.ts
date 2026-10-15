/**
 * Round 51 — what the Austin battery-storage series actually says. MEASUREMENT ONLY.
 *
 * No builder, no article, no copy. Four questions, each answered or explicitly left open:
 *
 *  1. The full series, month by month — a step change in July or a curve — and whether the
 *     description VOCABULARY shifts within it.
 *  2. Austin's filing mix changing, or Austin homeowners installing more batteries? Those are
 *     different findings and only one is about homes. So: did the work class itself grow, did
 *     new work classes or permit types appear, and did the underlying permit volume move?
 *  3. Does San Antonio file storage explicitly, or is it invisible there?
 *  4. (Not here — upstream causes are not in this feed.)
 *
 * ── IT WRITES THE MEASUREMENT, NOT THE MATERIAL ─────────────────────────────
 * Round 50's standing line, from my own error. No permit description is written down. The
 * vocabulary is measured by counting matches for a NAMED candidate list, so a one-off personal
 * name in free text has nothing to ride out on; templating is measured by counting DISTINCT
 * NORMALISED HASHES, which carry no text at all. Field names are listed; field values are not.
 */
import { writeFileSync } from "node:fs";
import {
  fetchAustinTradeRows,
  recountWindow,
  sanAntonioCsvUrl,
  resolveHeader,
} from "../../src/ingest/fetchers/permitTradeActivity";
import {
  AUSTIN_STORAGE_TEXT,
  SAN_ANTONIO_PERMIT_TYPE_MAP,
} from "../../src/ingest/tradeCategories";
import { parseCsv, rowsToRecords } from "../../src/ingest/csv";
import { createHash } from "node:crypto";

const OUT = new URL("../../../docs/audits/round-51-storage.json", import.meta.url);
const AUSTIN = "https://data.austintexas.gov/resource/3syk-w9eu.json";

/** Candidate vocabulary. Counted, never echoed. Hypothesis-driven by design: a free token list
 *  over descriptions would carry whatever a clerk typed, names included. */
const TERMS: Record<string, RegExp> = {
  battery: /\bbatter\w*/i,
  storage: /\bstorage\b/i,
  ess: /\bb?ess\b/i,
  powerwall: /powerwall/i,
  backup: /\bback[\s-]?up\b/i,
  meter_socket: /meter\s*socket/i,
  solar: /\bsolar\b/i,
  photovoltaic: /photovoltaic|\bpv\b/i,
  rooftop: /roof[\s-]*mount|roof\s*top|rooftop/i,
  ground_mount: /ground[\s-]*mount/i,
  inverter: /inverter/i,
  generator: /\bgenerator\b|\bgenset\b/i,
  v2h: /v2h|vehicle-to-home/i,
  interconnection: /interconnect\w*/i,
  kw_rating: /\d[\d.]*\s*kw/i,
  kwh_rating: /\d[\d.]*\s*kwh/i,
  // Product names are businesses, not people, and they answer "is this one supplier".
  tesla: /\btesla\b/i,
  enphase: /enphase/i,
  franklin: /franklin/i,
  sonnen: /sonnen/i,
  generac: /generac/i,
};

const norm = (s: string) => s.toLowerCase().replace(/\d+[\d.,]*/g, "#").replace(/\s+/g, " ").trim();
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

type Bucket = {
  permits: Set<string>;
  terms: Record<string, Set<string>>;
  shapes: Map<string, number>;
  emptyDescription: number;
};
const blank = (): Bucket => ({
  permits: new Set(), shapes: new Map(), emptyDescription: 0,
  terms: Object.fromEntries(Object.keys(TERMS).map((k) => [k, new Set<string>()])),
});

async function austin() {
  const w = recountWindow(new Date().toISOString());
  const { rows } = await fetchAustinTradeRows(w.since, w.until, process.env.SOCRATA_APP_TOKEN);

  // ── Q1: the storage series and its vocabulary, month by month ──
  const aux = new Map<string, Bucket>();
  const storage = new Map<string, Bucket>();
  for (const r of rows) {
    if (!r.issue_date) continue;
    if ((r.work_class ?? "").trim() !== "Auxiliary Power") continue;
    const month = new Date(r.issue_date).toISOString().slice(0, 7);
    const id = (r.permit_number ?? "").trim() || `${r.issue_date}#${aux.size}`;
    const desc = r.description ?? "";
    for (const [map, include] of [
      [aux, true],
      [storage, AUSTIN_STORAGE_TEXT.test(desc)],
    ] as [Map<string, Bucket>, boolean][]) {
      if (!include) continue;
      const b = map.get(month) ?? blank();
      b.permits.add(id);
      if (!desc.trim()) b.emptyDescription++;
      else {
        const h = hash(norm(desc));
        b.shapes.set(h, (b.shapes.get(h) ?? 0) + 1);
      }
      for (const [name, re] of Object.entries(TERMS)) if (re.test(desc)) b.terms[name].add(id);
      map.set(month, b);
    }
  }

  const describe = (map: Map<string, Bucket>) =>
    [...map.keys()].sort().map((m) => {
      const b = map.get(m)!;
      const n = b.permits.size;
      const shapes = [...b.shapes.values()].sort((a, c) => c - a);
      return {
        month: m,
        permits: n,
        distinctDescriptionShapes: b.shapes.size,
        topShapeShare: n ? +((shapes[0] ?? 0) / n * 100).toFixed(1) : null,
        top3ShapeShare: n ? +(shapes.slice(0, 3).reduce((s, x) => s + x, 0) / n * 100).toFixed(1) : null,
        emptyDescription: b.emptyDescription,
        terms: Object.fromEntries(
          Object.entries(b.terms).map(([k, v]) => [k, v.size]).filter(([, c]) => (c as number) > 0),
        ),
      };
    });

  // ── Q2b: ONE FILER OR MANY HOMES? ──────────────────────────────────────────
  // The templating in Q1 says ~90% of post-July storage permits share one description shape.
  // That is consistent with one program filing repeatedly AND with one big installer doing real
  // work, and those are different findings. The feed carries no applicant or contractor field —
  // measured, see `availableFieldNames` — so the filer cannot be named from it. What it does
  // carry is CONCENTRATION: a master permit, a project id, a council district, a ZIP and a
  // permit class. If 146 permits share one master permit or sit in one district, it is one
  // project rather than a city-wide shift.
  //
  // Counts and shares only. `original_address1` exists in the feed and is deliberately not
  // requested: Round 44's ruling allowlists what we read, and a street address is outside it.
  const EXTRA = [
    "permit_class", "permit_class_mapped", "issue_method",
    "council_district", "original_zip", "masterpermitnum", "project_id",
  ] as const;
  const { rows: wide } = await fetchAustinTradeRows(
    w.since, w.until, process.env.SOCRATA_APP_TOKEN, EXTRA);

  const concentration = new Map<string, Map<string, Map<string, number>>>();
  for (const r of wide) {
    if (!r.issue_date) continue;
    if ((r.work_class ?? "").trim() !== "Auxiliary Power") continue;
    if (!AUSTIN_STORAGE_TEXT.test(r.description ?? "")) continue;
    const month = new Date(r.issue_date).toISOString().slice(0, 7);
    const extra = r as unknown as Record<string, string | undefined>;
    const forMonth = concentration.get(month) ?? new Map<string, Map<string, number>>();
    for (const f of EXTRA) {
      const counts = forMonth.get(f) ?? new Map<string, number>();
      const v = (extra[f] ?? "").trim() || "(blank)";
      counts.set(v, (counts.get(v) ?? 0) + 1);
      forMonth.set(f, counts);
    }
    concentration.set(month, forMonth);
  }

  const concentrationByMonth = [...concentration.keys()].sort().map((m) => {
    const fields = concentration.get(m)!;
    const out: Record<string, unknown> = { month: m };
    for (const f of EXTRA) {
      const counts = fields.get(f) ?? new Map<string, number>();
      const total = [...counts.values()].reduce((s, n) => s + n, 0);
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      out[f] = {
        distinct: counts.size,
        topShare: total ? +((sorted[0]?.[1] ?? 0) / total * 100).toFixed(1) : null,
        // The VALUES of permit_class / permit_class_mapped / issue_method are small
        // vocabularies the city publishes, so naming them says something. A district or a ZIP
        // is reported as a distribution only.
        values: ["permit_class", "permit_class_mapped", "issue_method"].includes(f)
          ? Object.fromEntries(sorted.slice(0, 6))
          : undefined,
      };
    }
    return out;
  });

  // ── Q2: did the mix change, or the volume? Asked of the WHOLE feed, not our predicate. ──
  const get = async (params: Record<string, string>) => {
    const url = new URL(AUSTIN);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = {};
    if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Austin ${res.status} on ${JSON.stringify(params)}`);
    return res.json() as Promise<Record<string, string>[]>;
  };

  const since = w.since.slice(0, 19);
  const until = w.until.slice(0, 19);
  const dateRange = `issue_date between '${since}' and '${until}'`;

  // Every permit, by month — is the whole feed up, or only this class?
  const allByMonth = await get({
    $select: "date_trunc_ym(issue_date) as month, count(1) as permits",
    $where: dateRange, $group: "month", $order: "month",
  });
  // Every work class, by month — did `Auxiliary Power` grow, and did any class appear mid-window?
  const classByMonth = await get({
    $select: "date_trunc_ym(issue_date) as month, work_class, count(1) as permits",
    $where: dateRange, $group: "month, work_class", $order: "month", $limit: "5000",
  });
  // Every permit type, by month — did a new type appear?
  const typeByMonth = await get({
    $select: "date_trunc_ym(issue_date) as month, permit_type_desc, count(1) as permits",
    $where: dateRange, $group: "month, permit_type_desc", $order: "month", $limit: "5000",
  });
  // What fields exist at all — NAMES ONLY. Tells a later round what is available to ask.
  const sample = await get({ $limit: "1" });
  const fields = Object.keys(sample[0] ?? {}).sort();

  const firstSeen = (rowsIn: Record<string, string>[], key: string) => {
    const out: Record<string, string> = {};
    for (const r of rowsIn) {
      const v = r[key] ?? "(blank)";
      const m = (r.month ?? "").slice(0, 7);
      if (!out[v] || m < out[v]) out[v] = m;
    }
    return out;
  };
  const seriesFor = (rowsIn: Record<string, string>[], key: string, value: string) =>
    Object.fromEntries(rowsIn.filter((r) => (r[key] ?? "") === value)
      .map((r) => [(r.month ?? "").slice(0, 7), Number(r.permits)]));

  return {
    window: w,
    auxPowerByMonth: describe(aux),
    storageByMonth: describe(storage),
    storageConcentrationByMonth: concentrationByMonth,
    wholeFeedByMonth: Object.fromEntries(
      allByMonth.map((r) => [(r.month ?? "").slice(0, 7), Number(r.permits)])),
    auxPowerClassVolumeByMonth: seriesFor(classByMonth, "work_class", "Auxiliary Power"),
    workClassFirstSeen: firstSeen(classByMonth, "work_class"),
    permitTypeFirstSeen: firstSeen(typeByMonth, "permit_type_desc"),
    availableFieldNames: fields,
  };
}

async function sanAntonio() {
  const w = recountWindow(new Date().toISOString());
  const res = await fetch(await sanAntonioCsvUrl());
  if (!res.ok) throw new Error(`San Antonio CSV: HTTP ${res.status}`);
  const records = rowsToRecords(parseCsv(await res.text()));
  const typeCol = resolveHeader(records[0], ["PERMIT TYPE", "PERMIT_TYPE", "PERMITTYPE", "TYPE"]);
  const dateCol = resolveHeader(records[0], [
    "DATE ISSUED", "ISSUE DATE", "ISSUED DATE", "ISSUE_DATE", "ISSUED_DATE",
    "APPROVED DATE", "DATE SUBMITTED"]);
  // Does a DESCRIPTION column resolve at all? If not, storage cannot be text-matched here —
  // which is the difference between "San Antonio has no storage" and "we cannot see it".
  const descCol = resolveHeader(records[0], [
    "DESCRIPTION", "WORK DESCRIPTION", "JOB DESCRIPTION", "SCOPE OF WORK", "COMMENTS"]);
  if (!typeCol || !dateCol) throw new Error("San Antonio CSV: no type or date column");

  const STORAGEY = /batter|storage|\bess\b|solar|photovolt|generat|energy/i;
  const byType = new Map<string, { permits: number; first: string; last: string }>();
  for (const row of records) {
    const raw = row[dateCol];
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const at = d.toISOString();
    if (at < w.since || at > w.until) continue;
    const t = (row[typeCol] ?? "").trim();
    const b = byType.get(t) ?? { permits: 0, first: at.slice(0, 7), last: at.slice(0, 7) };
    b.permits++;
    b.first = at.slice(0, 7) < b.first ? at.slice(0, 7) : b.first;
    b.last = at.slice(0, 7) > b.last ? at.slice(0, 7) : b.last;
    byType.set(t, b);
  }
  const types = [...byType.entries()].sort((a, b) => b[1].permits - a[1].permits);
  return {
    columns: { typeCol, dateCol, descriptionColumnResolves: descCol ?? null },
    headers: Object.keys(records[0] ?? {}),
    distinctPermitTypesInWindow: types.length,
    typesMatchingEnergyWords: Object.fromEntries(
      types.filter(([t]) => STORAGEY.test(t)).map(([t, b]) => [t, b])),
    typesNotInOurMap: Object.fromEntries(
      types.filter(([t]) => !(t in SAN_ANTONIO_PERMIT_TYPE_MAP)).map(([t, b]) => [t, b])),
    solarTypeSeries: Object.fromEntries(
      types.filter(([t]) => t === "Solar - Photovoltaic Permit").map(([t, b]) => [t, b])),
  };
}

const out = {
  measuredAt: new Date().toISOString(),
  question: "what does the Austin battery-storage series say, and is it filing mix or homes?",
  austin: await austin(),
  sanAntonio: await sanAntonio(),
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT.pathname}`);
console.log("  storage by month:", out.austin.storageByMonth.map((r) => `${r.month}=${r.permits}`).join(" "));
console.log("  aux class volume:", JSON.stringify(out.austin.auxPowerClassVolumeByMonth));
console.log("  SA description column resolves:", out.sanAntonio.columns.descriptionColumnResolves);
