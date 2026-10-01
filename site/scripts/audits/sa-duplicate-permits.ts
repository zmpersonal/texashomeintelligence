/**
 * Round 44, ruling 5 — does San Antonio's permit feed carry multiple rows per
 * permit, the way Fort Worth's does?
 *
 * WHY THIS IS A tsx SCRIPT AND NOT A PROBE. Three python attempts at the CKAN
 * CSV returned HTTP 403 — with no custom headers, with Accept only, and with a
 * browser User-Agent — while `permitTradeActivity.ts` pulls the same resource
 * successfully every day (lastSuccessAt 2026-10-01T12:19, lastError null). So
 * the difference is not a header I can guess at. This runs the repo's OWN code
 * path instead: the same resource-selection rule, the same global `fetch`, and
 * the same `parseCsv`/`rowsToRecords` the fetcher parses with. If it 403s here
 * too, that is a real finding about the feed rather than about my request.
 *
 * WHAT IT MEASURES. `permitTradeActivity.ts` increments once per ROW, with no
 * permit-number dedupe anywhere in either metro's loop — San Antonio's loop does
 * not even read an identifier column, so it could not dedupe. Austin is already
 * cleared: 59,811 rows in the window, 59,811 distinct `permit_number`, 0.00%.
 * This asks the same of San Antonio, and against EVERY identifier column in the
 * file rather than one chosen in advance, because choosing one would be choosing
 * the answer.
 *
 * Read-only. Writes a JSON report and touches nothing under src/data/generated.
 *
 * Run: npx tsx scripts/audits/sa-duplicate-permits.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseCsv, rowsToRecords } from "../../src/ingest/csv";

const PACKAGE_SHOW_URL =
  "https://data.sanantonio.gov/api/3/action/package_show?id=building-permits";
const SINCE = new Date("2025-09-01T00:00:00.000Z");
const UNTIL = new Date("2026-10-01T00:00:00.000Z");

interface CkanResource {
  name?: string;
  url?: string;
  format?: string;
  last_modified?: string | null;
  created?: string | null;
}

/** The fetcher's own rule: every name matching /permits?\s*issued/i, then the
 * latest `last_modified`. The 2026-08-24 fix exists because `.find()` was
 * picking the frozen "PERMITS ISSUED 2020-2024" archive. */
async function resolveResource(): Promise<CkanResource> {
  const res = await fetch(PACKAGE_SHOW_URL);
  if (!res.ok) throw new Error(`CKAN package_show failed: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: { resources?: CkanResource[] } };
  const all = body.result?.resources ?? [];
  const matches = all.filter((r) => /permits?\s*issued/i.test(r.name ?? ""));
  if (matches.length === 0) throw new Error("no resource matched /permits?\\s*issued/i");
  matches.sort((a, b) =>
    String(b.last_modified ?? b.created ?? "").localeCompare(String(a.last_modified ?? a.created ?? "")),
  );
  return matches[0];
}

function parseIssueDate(raw: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const report: Record<string, unknown> = {};
  const resource = await resolveResource();
  report.resource = {
    name: resource.name,
    lastModified: resource.last_modified,
    format: resource.format,
  };
  if (!resource.url) throw new Error("chosen resource has no url");

  const res = await fetch(resource.url);
  report.csvStatus = res.status;
  if (!res.ok) {
    report.verdict = `CSV fetch failed: HTTP ${res.status} — the fetcher's own code path cannot read it either`;
    finish(report);
    return;
  }
  const records = rowsToRecords(parseCsv(await res.text()));
  report.rowsTotal = records.length;
  if (records.length === 0) {
    report.verdict = "CSV parsed to zero records";
    finish(report);
    return;
  }

  const headers = Object.keys(records[0]);
  report.headers = headers;
  const find = (candidates: string[]) =>
    headers.find((h) => candidates.includes(h.trim().toUpperCase()));
  const dateCol = find(["DATE ISSUED", "ISSUE DATE", "ISSUED DATE", "ISSUE_DATE", "ISSUED_DATE"]);
  const typeCol = find(["PERMIT TYPE", "PERMIT_TYPE", "PERMITTYPE", "TYPE"]);
  report.dateCol = dateCol;
  report.typeCol = typeCol;

  // Every column that could identify a permit. Not one chosen in advance.
  const idCols = headers.filter((h) =>
    /permit\s*#|permit\s*num|permit\s*no|^\s*permit\s*$|record|case|folder|application/i.test(h),
  );
  report.identifierColumns = idCols;

  const counters = new Map<string, Map<string, number>>(idCols.map((h) => [h, new Map()]));
  const blanks = new Map<string, number>(idCols.map((h) => [h, 0]));
  const rowsByType = new Map<string, number>();
  let inWindow = 0;

  for (const row of records) {
    const raw = dateCol ? (row[dateCol] ?? "") : "";
    const when = parseIssueDate(raw);
    if (!when || when < SINCE || when >= UNTIL) continue;
    inWindow += 1;
    const t = (typeCol ? (row[typeCol] ?? "") : "").trim();
    rowsByType.set(t, (rowsByType.get(t) ?? 0) + 1);
    for (const h of idCols) {
      const v = (row[h] ?? "").trim();
      if (!v) {
        blanks.set(h, (blanks.get(h) ?? 0) + 1);
        continue;
      }
      const c = counters.get(h)!;
      c.set(v, (c.get(v) ?? 0) + 1);
    }
  }

  report.rowsInWindow = inWindow;
  report.perIdentifier = Object.fromEntries(
    idCols.map((h) => {
      const c = counters.get(h)!;
      const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      return [
        h,
        {
          distinct: c.size,
          blankRows: blanks.get(h) ?? 0,
          duplicationPct: inWindow > 0 && c.size > 0 ? Number((((inWindow - c.size) / inWindow) * 100).toFixed(2)) : null,
          topRepeats: top,
        },
      ];
    }),
  );
  report.rowsByPermitType = [...rowsByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);

  const worst = idCols
    .map((h) => counters.get(h)!.size)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)[0];
  report.verdict =
    idCols.length === 0
      ? "NO identifier column in the file — duplication cannot be measured from it, and the fetcher could not dedupe even if it tried"
      : worst !== undefined && worst === inWindow
        ? "CLEAN — one row per permit on at least one identifier"
        : `DUPLICATED — ${inWindow} rows vs ${worst} distinct on the best identifier`;

  finish(report);
}

function finish(report: Record<string, unknown>) {
  mkdirSync("tmp/dup3", { recursive: true });
  writeFileSync("tmp/dup3/sa-duplicate-permits.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2).slice(0, 4000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
