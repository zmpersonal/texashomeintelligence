/**
 * The description fingerprint — the numbers, not the descriptions.
 *
 * Round 53 measured whether a per-month fingerprint would have caught the Austin
 * battery-storage break of 2026-07, which `permit-trade-activity` could not see because it
 * stores monthly aggregates and the break lived in the wording of individual permits. It would
 * have: see `docs/audits/round-53-fingerprint.md`. This is that measurement, moved into the
 * ingest.
 *
 * ── A MEASUREMENT, NOT A SAMPLE ─────────────────────────────────────────────
 * The owner's design constraint, after a round spent proving we should not store descriptions:
 * whatever is retained has to be a measurement, not a sample.
 *
 *  · Descriptions are normalised and hashed to GROUP identical wordings, and the hashes are
 *    discarded with the accumulator. Nothing stores a hash — a stored hash is not readable as
 *    text but it is testable against a guess, which is the weaker guarantee.
 *  · Every stored field is a count or a share over a whole category-month. `topShapeShare = 58.6`
 *    says "the commonest wording covered 58.6% of 29 permits" and nothing about the wording.
 *  · A clerk's one-off personal name contributes to a count and leaves no other trace.
 *
 * `shapeflagunit.ts` asserts all of that against this module rather than trusting it, including
 * that a description cannot be recovered from what is stored.
 *
 * ── WHAT WAS MEASURED AND DROPPED ───────────────────────────────────────────
 * Round 53 also measured vocabulary novelty — the share of a month's distinct tokens absent from
 * the previous three months — and it does not work. In the break month storage's novelty went
 * DOWN, 31.3% against a 43.3% trailing mean, because templating repeats words rather than
 * introducing them; every swept vocabulary rule missed the break and fired on small-sample churn
 * instead. It is therefore not computed and not stored. A measure that was proven not to work is
 * worse than absent if it is retained anyway: the next reader assumes it means something.
 */
import { createHash } from "node:crypto";

/**
 * Lowercase, every run of digits to `#`, whitespace collapsed. A description becomes a "shape"
 * once its numbers are gone, which is what makes a templated month visible as a handful of
 * shapes repeated: "BATTERY STORAGE 13.5 KWH" and "battery storage 27 kwh" are one shape.
 */
export function normaliseDescription(s: string): string {
  return s.toLowerCase().replace(/\d+[\d.,]*/g, "#").replace(/\s+/g, " ").trim();
}

/** Grouping only. Never stored, never returned past the accumulator. */
function shapeKey(s: string): string {
  return createHash("sha1").update(normaliseDescription(s)).digest("hex").slice(0, 10);
}

/** What one category-month retains. Counts and shares; no text, no hashes. */
export interface DescriptionShape {
  /** Permits in this category-month carrying a non-empty description. */
  withDescription: number;
  emptyDescriptions: number;
  /** How many distinct wordings those permits used, after normalisation. */
  distinctShapes: number;
  /** `distinctShapes / withDescription`. 1.0 = every permit worded differently. */
  shapesPerPermit: number | null;
  /** Percent of described permits carrying the single commonest wording. */
  topShapeShare: number | null;
  /** Percent carrying one of the three commonest. */
  top3ShapeShare: number | null;
}

interface Cell {
  /** shape → the distinct permits carrying it. Discarded by `summarise`. */
  shapes: Map<string, Set<string>>;
  emptyDescriptions: number;
}

/**
 * Accumulates the fingerprint while the ingest is already walking the rows.
 *
 * Keyed `${category} ${month}`, matching `bump()`'s bucket key so the two cannot drift apart.
 * Austin only in practice: San Antonio's export has no description column at all, so its loop
 * never calls this and every San Antonio observation is stored without a `shape`. A reader must
 * state that reach rather than reading absence as "no templating" — `shapeFlags.ts` does.
 */
export class ShapeAccumulator {
  private readonly cells = new Map<string, Cell>();

  record(category: string, month: string, permitId: string, description: string): void {
    const key = `${category} ${month}`;
    const cell = this.cells.get(key) ?? { shapes: new Map(), emptyDescriptions: 0 };
    this.cells.set(key, cell);
    if (!description.trim()) {
      cell.emptyDescriptions++;
      return;
    }
    const h = shapeKey(description);
    const held = cell.shapes.get(h) ?? new Set<string>();
    held.add(permitId);
    cell.shapes.set(h, held);
  }

  /** The stored numbers, keyed as `bump()` keys its buckets. The text and the hashes end here. */
  summarise(): Map<string, DescriptionShape> {
    const out = new Map<string, DescriptionShape>();
    for (const [key, cell] of this.cells) {
      const sizes = [...cell.shapes.values()].map((held) => held.size).sort((a, b) => b - a);
      const described = sizes.reduce((s, n) => s + n, 0);
      const share = (x: number): number | null =>
        described > 0 ? +((x / described) * 100).toFixed(1) : null;
      out.set(key, {
        withDescription: described,
        emptyDescriptions: cell.emptyDescriptions,
        distinctShapes: cell.shapes.size,
        shapesPerPermit: described > 0 ? +(cell.shapes.size / described).toFixed(3) : null,
        topShapeShare: share(sizes[0] ?? 0),
        top3ShapeShare: share(sizes.slice(0, 3).reduce((s, n) => s + n, 0)),
      });
    }
    return out;
  }
}
