/**
 * Round 50b — what do Austin's `Auxiliary Power` permits actually say?
 *
 * The mapping is about to be split into `solar` and `energy_storage`, and
 * `tradeCategories.ts` carries a standing principle for exactly this moment:
 * "EVERY VALUE BELOW WAS OBSERVED, NONE INVENTED". So the storage predicate is
 * derived here from the live descriptions rather than written from the two
 * examples that happened to surface in a hand-read.
 *
 * Reports the FULL residue — every description that matches neither solar nor
 * the candidate storage vocabulary — because the residue is what decides whether
 * a third bucket is needed or those rows stay unclassified.
 *
 * Requests go through `fetchAustinTradeRows`; no request is built here.
 */
import { writeFileSync } from "node:fs";
import { fetchAustinTradeRows, recountWindow } from "../../src/ingest/fetchers/permitTradeActivity";
import { AUSTIN_SOLAR_TEXT } from "../../src/ingest/tradeCategories";
import { redactPersonalShapes } from "../../src/ingest/redactPersonalShapes";

const OUT = new URL("../../../docs/audits/round-50-aux-vocabulary.json", import.meta.url);

/** Candidate storage vocabulary, to be CONFIRMED or widened by what this prints. */
const STORAGE = /\bbatter\w*|\bstorage\b|\bess\b|powerwall|\bbess\b|\bess\/|energy\s+storage/i;

const w = recountWindow(new Date().toISOString());
const { rows } = await fetchAustinTradeRows(w.since, w.until, process.env.SOCRATA_APP_TOKEN);

const aux = rows.filter((r) => (r.work_class ?? "").trim() === "Auxiliary Power");
const tokens = new Map<string, number>();
const residue = new Map<string, number>();
const byMonth = new Map<string, { aux: number; solar: number; storage: number; both: number; neither: number }>();

for (const r of aux) {
  if (!r.issue_date) continue;
  const month = new Date(r.issue_date).toISOString().slice(0, 7);
  const m = byMonth.get(month) ?? { aux: 0, solar: 0, storage: 0, both: 0, neither: 0 };
  const desc = r.description ?? "";
  const isSolar = AUSTIN_SOLAR_TEXT.test(desc);
  const isStorage = STORAGE.test(desc);
  m.aux++;
  if (isSolar && isStorage) m.both++;
  else if (isSolar) m.solar++;
  else if (isStorage) m.storage++;
  else {
    m.neither++;
    // REDACT, then shorten.
    const key = redactPersonalShapes(desc).text.slice(0, 160).trim() || "(empty description)";
    residue.set(key, (residue.get(key) ?? 0) + 1);
  }
  byMonth.set(month, m);

  // Word frequencies over the NON-solar descriptions, so the storage vocabulary
  // is read off the data instead of guessed.
  if (!isSolar) {
    for (const word of desc.toLowerCase().match(/[a-z][a-z/-]{2,}/g) ?? []) {
      tokens.set(word, (tokens.get(word) ?? 0) + 1);
    }
  }
}

const out = {
  measuredAt: new Date().toISOString(),
  window: w,
  auxPowerRows: aux.length,
  candidateStoragePattern: STORAGE.source,
  byMonth: Object.fromEntries([...byMonth.entries()].sort()),
  topTokensInNonSolarDescriptions: Object.fromEntries(
    [...tokens.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60),
  ),
  residueMatchingNeither: Object.fromEntries(
    [...residue.entries()].sort((a, b) => b[1] - a[1]),
  ),
  residueTotal: [...residue.values()].reduce((s, n) => s + n, 0),
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT.pathname}`);
console.log(`  Auxiliary Power rows: ${aux.length}; residue matching neither: ${out.residueTotal}`);
