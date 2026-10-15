/**
 * Dates on which a SOURCE changed how it reports something, so a series stops
 * measuring the same thing either side of the date.
 *
 * ── WHY THIS IS NOT A VERSION ─────────────────────────────────────────────
 *
 * `CATEGORY_MAPPING_VERSION` and `METHODOLOGY_VERSION` record OUR methodology
 * changing. They work because they are ours: we know the date, we bump the
 * constant, and the whole window is recomputed under the new rules — which is
 * why neither leaves a break in a published series. Round 45 changed row counts
 * to distinct permits and Round 50 split solar from storage; both recomputed
 * every month they hold, so both are comparable end to end.
 *
 * A source changing its behaviour is the opposite object in three ways, and
 * each one rules out a version field:
 *
 *   1. **It is discovered later.** Nobody bumps anything on the day it happens.
 *      Austin's filing instruction changed between January and May 2026; we
 *      found out in October, from an archived PDF.
 *   2. **It applies retroactively to months already stored.** The observations
 *      on either side were written under the same code, at their own ingest
 *      times, and are individually correct. There is no run to re-stamp.
 *   3. **Recomputation cannot remove it.** That is the real asymmetry. Our own
 *      changes are repairable by recounting; a source's are not, because the
 *      upstream records genuinely differ across the date. No amount of
 *      recomputation makes 10 months of "solar + battery, 11.4 kW" comparable
 *      to 3 months of "backup battery system and additional meter socket".
 *
 * So a discontinuity is a FACT ABOUT A SERIES, held beside the data rather than
 * inside it, keyed by what it affects and consulted by whoever computes across
 * it. Same shape as `withdrawnArticles.ts`: a hand-maintained typed record of
 * something true about what we publish, with a reader that honours it.
 *
 * ── EVIDENCE IS REQUIRED, STRUCTURALLY ───────────────────────────────────
 *
 * A break with no evidence is a rumour, and a rumour in this file would be
 * worse than the silence it replaces: it would license withholding or
 * relabelling a figure on someone's hunch. So `evidence` is a non-empty tuple
 * in the type, every entry carries something a reader can open or a path this
 * repo holds, and `scripts/replays/discontinuityunit.ts` fails the build if any
 * entry resolves to neither. The type makes an empty array a compile error; the
 * replay makes a fabricated one a build error.
 */

/** What established the break. At least one is required, and it must resolve. */
export interface DiscontinuityEvidence {
  /** What this is, in one line, for a human reading the record. */
  what: string;
  /** A URL a reader can open, or a repo-relative path this repository holds. */
  url?: string;
  path?: string;
}

export interface Discontinuity {
  /** `datasetId` as the registry knows it, e.g. `permit-trade-activity`. */
  datasetId: string;
  /** The location file it affects, or `"*"` for every location in the dataset. */
  location: string;
  /**
   * The series within the dataset — a category for permit activity, a metric
   * name elsewhere. `"*"` means every series in the file.
   */
  series: string;
  /**
   * The first month that is on the FAR side of the break, `YYYY-MM`. Months
   * strictly before it and months from it onward are not comparable.
   */
  fromMonth: string;
  /** What changed, in the source's terms, not ours. */
  what: string;
  /** Who changed: `source` is the only kind this file is for. See the header. */
  cause: "source";
  /** When we found out — not when it happened. The two differ and both matter. */
  discoveredAt: string;
  evidence: readonly [DiscontinuityEvidence, ...DiscontinuityEvidence[]];
}

export const DISCONTINUITIES: readonly Discontinuity[] = [
  {
    datasetId: "permit-trade-activity",
    location: "austin",
    series: "energy_storage",
    fromMonth: "2026-07",
    what:
      "Austin Energy's Solar Permitting Manual began instructing filers that pre-wire, solar, " +
      "batteries, spinning generators and wind \"should all be separated into their own " +
      "Auxiliary Power EPs\". The permit requirement did not change — its January 2026 revision " +
      "already covered energy storage — but one project that previously filed a single permit " +
      "now files several, so permit counts rise without installations rising. The descriptions " +
      "change with it: system sizes disappear and a single standardised scope dominates.",
    cause: "source",
    discoveredAt: "2026-10-15",
    evidence: [
      {
        what:
          "Round 51's audit: the series, the vocabulary inversion, the dispersion measures and " +
          "the falsified Upgrade-class cross-check",
        path: "docs/audits/round-51-storage-series.md",
      },
      {
        what:
          "The archived 2026-01-30 capture compared with the live copy, phrase by phrase over " +
          "the full extracted text of both",
        path: "docs/audits/round-51-manual-check.json",
      },
      {
        what: "Austin Energy's Solar Permitting Manual, the live copy",
        url:
          "https://austinenergy.com/-/media/project/websites/austinenergy/green-power/solar/" +
          "austinenergy_solarpermittingmanual.pdf",
      },
    ],
  },
];

/**
 * Every break that falls strictly inside `[fromMonth, toMonth]` — the months a
 * computation is about to span.
 *
 * A break at month M separates the months before M from M onward, so it is
 * crossed only when the span starts before M and reaches M or later. A span
 * entirely on one side crosses nothing, which is why a month-over-month claim
 * on two post-break months is untouched.
 */
export function discontinuitiesCrossed(
  datasetId: string,
  location: string,
  series: string,
  fromMonth: string,
  toMonth: string,
): Discontinuity[] {
  const [lo, hi] = fromMonth <= toMonth ? [fromMonth, toMonth] : [toMonth, fromMonth];
  return DISCONTINUITIES.filter(
    (d) =>
      d.datasetId === datasetId &&
      (d.location === "*" || d.location === location) &&
      (d.series === "*" || d.series === series) &&
      lo < d.fromMonth &&
      hi >= d.fromMonth,
  );
}
