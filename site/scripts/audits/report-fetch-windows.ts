/**
 * Round 47 · What window does each dataset ask for, and what does it hold?
 *
 * Printed before and after the re-ingestion so the change is measured rather
 * than asserted. `--spans` reports what each series now covers; without it,
 * the window each feed is about to request.
 */
import { readFileSync, existsSync } from "node:fs";
import { REGISTRY } from "../../src/ingest/registry";
import { computeFetchWindow } from "../../src/ingest/merge";
import { revisitDays } from "../../src/ingest/fetchWindows";
import type { DatasetFile } from "../../src/ingest/types";

const spans = process.argv.includes("--spans");
const rows: string[][] = [];

for (const { fetcher, filePath } of REGISTRY) {
  const id = `${fetcher.datasetId}/${fetcher.location}`;
  if (!existsSync(filePath)) {
    rows.push([id, "(no file)", "", "", ""]);
    continue;
  }
  const file = JSON.parse(readFileSync(filePath, "utf8")) as DatasetFile<unknown>;
  const obs = file.observations;
  const months = obs.map((o) => o.observedAt.slice(0, 7)).sort();
  if (spans) {
    rows.push([id, file.status, String(obs.length),
      months[0] ?? "—", months.at(-1) ?? "—",
      String(new Set(months).size)]);
  } else {
    const w = computeFetchWindow(file);
    rows.push([id, file.status, `${revisitDays(fetcher.datasetId)}d`,
      w.since.slice(0, 10), w.until.slice(0, 10)]);
  }
}

const head = spans
  ? ["dataset/location", "status", "rows", "earliest", "newest", "months"]
  : ["dataset/location", "status", "revisit", "since", "until"];
const w = rows.reduce((m, r) => r.map((c, i) => Math.max(m[i] ?? 0, c.length)), head.map((h) => h.length));
console.log(`\n${spans ? "SERIES SPANS AFTER INGEST" : "WINDOW EACH DATASET WILL REQUEST"}\n`);
console.log(head.map((h, i) => h.padEnd(w[i])).join("  "));
for (const r of rows.sort()) console.log(r.map((c, i) => c.padEnd(w[i])).join("  "));
