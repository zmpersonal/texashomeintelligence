/* Round 1 — the resolver, against the real committed datasets. */
import { resolveDisplayStatus, maxDataAgeDays, dataAgeDays } from "../../src/lib/dataFreshness";
import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GEN = path.join(SITE_DIR, "src", "data", "generated");
const NOW = new Date(); // real clock — same one the build uses
const rows: string[][] = [];
for (const dir of fs.readdirSync(GEN)) {
  for (const f of fs.readdirSync(path.join(GEN, dir))) {
    const d = JSON.parse(fs.readFileSync(path.join(GEN, dir, f), "utf8"));
    const dataThrough = d.observations.map((o: any) => o.observedAt).sort().at(-1);
    const display = d.status === "sample" ? "sample" : resolveDisplayStatus({
      datasetId: d.datasetId, feedStatus: d.status, dataThrough, now: NOW,
    });
    const age = dataThrough ? dataAgeDays(dataThrough, NOW) : undefined;
    rows.push([`${dir}/${f.replace(".json","")}`, d.status, String(age ?? "—"),
               String(maxDataAgeDays(d.datasetId)), display]);
  }
}
const w = rows.reduce((m, r) => r.map((c, i) => Math.max(m[i] ?? 0, c.length)), [0,0,0,0,0]);
const hdr = ["dataset/location","feed","age(d)","window(d)","BADGE"];
console.log(hdr.map((h,i)=>h.padEnd(Math.max(w[i], h.length))).join("  "));
for (const r of rows.sort()) console.log(r.map((c,i)=>c.padEnd(Math.max(w[i], hdr[i].length))).join("  "));
