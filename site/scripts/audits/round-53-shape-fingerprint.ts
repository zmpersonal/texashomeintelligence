/**
 * Round 53 — would a description fingerprint have caught the storage break? MEASUREMENT ONLY.
 *
 * No detector is built here and nothing is wired into ingestion. This writes down, for every
 * Austin trade category and every month of the recount window, a handful of NUMBERS about the
 * shape of that month's permit descriptions. Whether any rule over those numbers would have
 * fired on storage in July 2026, and whether it would have fired on anything else in the
 * thirteen months we hold, is decided afterwards from the committed measurement — not here,
 * so the rule can be re-stated without re-reading the source.
 *
 * ── IT WRITES THE MEASUREMENT, NOT THE MATERIAL ─────────────────────────────
 * Round 50's standing line, from my own error, and the owner's design constraint for this
 * round: whatever is proposed has to be a measurement, not a sample.
 *
 * So nothing derived from a single description is written down. Descriptions are normalised
 * and hashed IN MEMORY to group identical shapes, and the hashes are discarded; what reaches
 * the file is a count of distinct shapes and the share held by the largest ones. Tokens are
 * collected IN MEMORY to measure vocabulary novelty, and the tokens are discarded; what
 * reaches the file is how many there were and what share of them are new. There is no field in
 * the output that holds, encodes or can be tested against a description — only counts and
 * percentages. The free-text guard in the workflow asserts that, and reports the JSON path of
 * any offender rather than the offending text.
 *
 * ── ONE REQUEST PATH ────────────────────────────────────────────────────────
 * Round 49's rule: a verifier builds every outbound request with the code that built it for
 * ingestion, per request. The window comes from `recountWindow`, the rows from
 * `fetchAustinTradeRows`, and the categories from `classifyAustin` — the same three pieces the
 * ingest uses. `description` is already in that request's `$select` because Austin's
 * classifier needs it, which is the whole reason this fingerprint is cheap: it asks the source
 * for nothing the ingest does not already ask for.
 *
 * San Antonio is not measured and cannot be. Its export has no description column at all —
 * measured in Round 51 (`docs/audits/round-51-storage.json`, `sanAntonio.columns`), and cited
 * here rather than re-fetched. That is a fact about this fingerprint's reach, recorded in the
 * output.
 *
 * Run: npx tsx scripts/audits/round-53-shape-fingerprint.ts   (from site/)
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  fetchAustinTradeRows,
  recountWindow,
} from "../../src/ingest/fetchers/permitTradeActivity";
import { classifyAustin } from "../../src/ingest/tradeCategories";

const OUT = new URL("../../../docs/audits/round-53-fingerprint.json", import.meta.url);

/**
 * THE NORMALISATION. Lowercase, every run of digits collapsed to `#`, every run of
 * whitespace to one space. A description is a "shape" once its numbers are gone: "BATTERY
 * STORAGE 13.5 KWH" and "battery storage 27 kwh" are one shape, which is what makes a
 * templated month visible as a small number of shapes repeated.
 */
const normalise = (s: string): string =>
  s.toLowerCase().replace(/\d+[\d.,]*/g, "#").replace(/\s+/g, " ").trim();

/** Grouping only. Computed in memory, never written. */
const shapeOf = (s: string): string =>
  createHash("sha1").update(normalise(s)).digest("hex").slice(0, 10);

/** Words, for the vocabulary measure. Three letters or more, letters only — so a model
 *  number or a date cannot become vocabulary. Collected in memory, never written. */
const tokensOf = (s: string): string[] => s.toLowerCase().match(/[a-z]{3,}/g) ?? [];

interface Cell {
  permits: Set<string>;
  /** shape → the distinct permits carrying it. */
  shapes: Map<string, Set<string>>;
  tokens: Set<string>;
  emptyDescriptions: number;
}
const cell = (): Cell => ({
  permits: new Set(),
  shapes: new Map(),
  tokens: new Set(),
  emptyDescriptions: 0,
});

/** key is `${category}|${month}`; category `*` is the whole fetched feed, as the control. */
const cells = new Map<string, Cell>();
const at = (category: string, month: string): Cell => {
  const k = `${category}|${month}`;
  const c = cells.get(k) ?? cell();
  cells.set(k, c);
  return c;
};

function record(category: string, month: string, permitId: string, description: string): void {
  const c = at(category, month);
  c.permits.add(permitId);
  if (!description.trim()) {
    c.emptyDescriptions++;
    return;
  }
  const h = shapeOf(description);
  const held = c.shapes.get(h) ?? new Set<string>();
  held.add(permitId);
  c.shapes.set(h, held);
  for (const t of tokensOf(description)) c.tokens.add(t);
}

interface Row {
  category: string;
  month: string;
  permits: number;
  withDescription: number;
  emptyDescriptions: number;
  distinctShapes: number;
  /** distinctShapes / permits-with-a-description. 1.0 = every permit worded differently. */
  shapesPerPermit: number | null;
  /** Percent of described permits carrying the single commonest shape. */
  topShapeShare: number | null;
  top3ShapeShare: number | null;
  distinctTokens: number;
  /** Percent of this month's vocabulary absent from the previous three months of the same
   *  category. Null where fewer than three prior months exist to compare against. */
  newTokenShare: number | null;
  /** |A∩B| / |A∪B| against the previous three months' vocabulary. 1.0 = identical vocabulary. */
  jaccardVsTrailing: number | null;
}

const pct = (x: number, n: number): number | null => (n > 0 ? +((x / n) * 100).toFixed(1) : null);

function rowsFor(category: string): Row[] {
  const months = [...cells.keys()]
    .filter((k) => k.startsWith(`${category}|`))
    .map((k) => k.split("|")[1])
    .sort();
  return months.map((month, i) => {
    const c = at(category, month);
    const described = [...c.shapes.values()].reduce((s, held) => s + held.size, 0);
    const sizes = [...c.shapes.values()].map((held) => held.size).sort((a, b) => b - a);

    // The trailing vocabulary is rebuilt from the three previous months of this category.
    // Every ingest re-reads the whole window (RECOUNT_MONTHS = 13), so this is computable
    // from one run's own rows — nothing about a token has to be retained between runs, which
    // is what keeps the measure a measurement.
    const trailing = new Set<string>();
    for (const prior of months.slice(Math.max(0, i - 3), i)) {
      for (const t of at(category, prior).tokens) trailing.add(t);
    }
    const haveTrailing = i >= 3 && trailing.size > 0;
    const fresh = [...c.tokens].filter((t) => !trailing.has(t)).length;
    const intersection = [...c.tokens].filter((t) => trailing.has(t)).length;
    const union = new Set([...c.tokens, ...trailing]).size;

    return {
      category,
      month,
      permits: c.permits.size,
      withDescription: described,
      emptyDescriptions: c.emptyDescriptions,
      distinctShapes: c.shapes.size,
      shapesPerPermit: described > 0 ? +(c.shapes.size / described).toFixed(3) : null,
      topShapeShare: pct(sizes[0] ?? 0, described),
      top3ShapeShare: pct(sizes.slice(0, 3).reduce((s, x) => s + x, 0), described),
      distinctTokens: c.tokens.size,
      newTokenShare: haveTrailing ? pct(fresh, c.tokens.size) : null,
      jaccardVsTrailing: haveTrailing && union > 0 ? +(intersection / union).toFixed(3) : null,
    };
  });
}

async function main(): Promise<void> {
  const window = recountWindow(new Date().toISOString());
  const { rows, serverCount, where } = await fetchAustinTradeRows(
    window.since,
    window.until,
    process.env.SOCRATA_APP_TOKEN,
  );

  let unclassified = 0;
  for (const r of rows) {
    if (!r.issue_date) continue;
    const month = new Date(r.issue_date).toISOString().slice(0, 7);
    const permitId = (r.permit_number ?? "").trim() || `${r.issue_date}#${r.work_class ?? ""}`;
    const description = r.description ?? "";
    record("*", month, permitId, description);
    const classes = classifyAustin(r);
    if (classes.length === 0) unclassified++;
    for (const c of classes) record(c.category, month, permitId, description);

    /*
     * ── THE v2 RECONSTRUCTION: WHAT THE DETECTOR WOULD HAVE SEEN IN AUGUST ──
     * "Would it have fired in July" has two readings, and only the harder one is worth
     * answering. The easy one is whether today's categories show the break in July —
     * they do. The one that decides whether this was ever going to help is whether the
     * mapping that was LIVE at the time would have shown it, because in August the
     * storage rows were not a category of their own: `trades-v2` mapped the whole
     * `Auxiliary Power` work class into `solar`, and Round 50 removed exactly that line:
     *
     *     "Auxiliary Power": "solar", // 808 in window; 98.7% solar where measured
     *
     * Nothing else about solar changed in that commit — `AUSTIN_SOLAR_TEXT` and the
     * permit-type map's solar entries are byte-identical across it (checked in the diff).
     * So v2's solar bucket is exactly today's solar plus every Auxiliary Power row, which
     * is a set union over the current classifier rather than a second copy of the old one.
     * A re-implemented classifier would be a second definition that can disagree with the
     * first, which is the defect this project keeps finding.
     */
    const isAux = (r.work_class ?? "").trim() === "Auxiliary Power";
    if (isAux || classes.some((c) => c.category === "solar")) {
      record("v2_solar", month, permitId, description);
    }
  }

  const categories = [...new Set([...cells.keys()].map((k) => k.split("|")[0]))]
    .filter((c) => c !== "*" && c !== "v2_solar")
    .sort();

  /*
   * PROSE LIVES UNDER `notes` AND NOWHERE ELSE.
   *
   * The free-text guard in the workflow flags any long, spacey string anywhere in this file,
   * which is how it would catch a description that leaked in. My own explanatory sentences are
   * long and spacey too, so they are all put under one prefix the guard skips — `$.notes.*` —
   * rather than scattered through the measurement where the allowlist would have to grow a
   * path per round. Nothing under `notes` comes from the source except `where`, which is the
   * SoQL predicate our own mapping builds and contains no description text.
   */
  const out = {
    measuredAt: new Date().toISOString(),
    notes: {
      question:
        "would a per-month description fingerprint have caught the Austin storage break in " +
        "2026-07, and would it have fired on anything else in the window?",
      policy:
        "MEASUREMENT ONLY. Nothing here is wired into ingestion. No value below is derived " +
        "from a single description: shapes are hashes discarded after grouping, tokens are " +
        "discarded after counting, and only counts and percentages are written.",
      normalisation: "lowercase; every run of digits to '#'; whitespace collapsed to one space",
      shape: "sha1 of the normalised description, first 10 hex — grouping only, never written",
      token: "lowercased runs of three or more letters — counted only, never written",
      marginalRequestCost:
        "none. `description` is already in the ingest's $select because Austin's classifier " +
        "needs it, and the window is already re-read in full every ingest (RECOUNT_MONTHS=13).",
      v2Reconstruction:
        "v2_solar = today's solar classification UNION every row whose work_class is " +
        "'Auxiliary Power' — the one mapping line Round 50 removed. A set union over the " +
        "current classifier, not a second copy of the old one.",
      sanAntonioReach:
        "not measurable. San Antonio's export has no description column — measured in " +
        "docs/audits/round-51-storage.json (sanAntonio.columns / sanAntonio.headers) and cited " +
        "rather than re-fetched. Every San Antonio category is classified by the city's own " +
        "permit type, so there is no description vocabulary there to fingerprint.",
      where,
    },
    stored: [
      "permits",
      "withDescription",
      "emptyDescriptions",
      "distinctShapes",
      "shapesPerPermit",
      "topShapeShare",
      "top3ShapeShare",
      "distinctTokens",
      "newTokenShare",
      "jaccardVsTrailing",
    ],
    window: {
      since: window.since,
      until: window.until,
      serverCount,
      rowsRead: rows.length,
      unclassifiedRows: unclassified,
    },
    austinCategories: categories,
    wholeFeedByMonth: rowsFor("*"),
    byCategoryMonth: categories.flatMap((c) => rowsFor(c)),
    /** The pre-Round-50 solar bucket, reconstructed — see the comment at the record call.
     *  Reported separately because it is not a series we publish; it is the series the
     *  detector would have been watching when the break happened. */
    v2SolarByMonth: rowsFor("v2_solar"),
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${OUT.pathname}`);
  console.log(
    `rows ${rows.length} (server ${serverCount}), categories ${categories.join(", ")}, ` +
      `unclassified ${unclassified}`,
  );
  for (const r of rowsFor("energy_storage")) {
    console.log(
      `  storage ${r.month}  n=${String(r.permits).padStart(4)}  shapes=${String(r.distinctShapes).padStart(3)}` +
        `  perPermit=${r.shapesPerPermit}  top=${r.topShapeShare}%  newTokens=${r.newTokenShare}%`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
