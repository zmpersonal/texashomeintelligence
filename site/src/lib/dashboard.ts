/**
 * The dashboard view model.
 *
 * One function assembles everything a ZIP page renders, so the pages contain
 * layout and no arithmetic. Everything here runs at BUILD time over the
 * Round 3 engine and the committed datasets — the serving path renders static
 * HTML and never computes a score, reads the database, or calls a government
 * API (COST.md).
 */
import { computeStressIndex, explainComposite } from "./stressIndex";
import type { SignalResult, StressIndexResult } from "./stressIndex";
import { areaDefinitions, resolveZip, type ZipResolved } from "./zipAreas";
import { CROSSWALK } from "./zipCrosswalk";

/** How far back the comparison reading is anchored. A week matches how often
 * the fastest input (drought) publishes; the slower inputs simply will not have
 * moved, which is a true statement about them rather than a defect. */
export const DELTA_WINDOW_DAYS = 7;

export interface SignalDelta {
  id: string;
  change: number;
}

export interface DashboardDelta {
  /** Composite points changed since the earlier anchor. 0 is a real answer. */
  change: number;
  /** The date the comparison reading is anchored to. */
  comparedTo: string;
  /** Per-signal movement, for "what changed". Only non-zero entries. */
  movers: SignalDelta[];
}

export interface DashboardView {
  zip: ZipResolved;
  index: StressIndexResult;
  composite: { headline: string; detail: string };
  delta: DashboardDelta;
  /** Signals in the order the design shows them: strongest contribution first,
   * with unavailable ones last so an absent signal never leads the page. */
  signals: SignalResult[];
  /** 0–1. Below 1 when a signal is unavailable — the ring renders the shortfall
   * as an explicit "not measured" arc rather than as empty track. */
  weightCoverage: number;
  unavailable: SignalResult[];
}

const AREAS = areaDefinitions();

function areaFor(areaId: string) {
  const area = AREAS.find((a) => a.areaId === areaId);
  if (!area) throw new Error(`No area definition for "${areaId}"`);
  return area;
}

/** Every ZIP the dashboard publishes a page for, sorted for stable output. */
export function supportedZips(): string[] {
  return [...CROSSWALK.keys()].sort();
}

export function buildDashboard(zipCode: string): DashboardView | undefined {
  const zip = resolveZip(zipCode);
  if (!zip.covered) return undefined;

  const area = areaFor(zip.areaId);
  const index = computeStressIndex(area);

  // The comparison reading: the same computation, anchored a week earlier.
  // Not a stored snapshot — we keep no score history — so the copy says
  // "the same reading a week earlier", never "last week's score".
  const earlier = new Date(
    new Date(index.referenceDate).getTime() - DELTA_WINDOW_DAYS * 86_400_000,
  );
  const prior = computeStressIndex(area, { at: earlier });

  const priorById = new Map(prior.signals.map((s) => [s.id, s]));
  const movers = index.signals
    .filter((s) => s.computable)
    .map((s) => {
      const before = priorById.get(s.id);
      const change = before?.computable ? s.layerB.score - before.layerB.score : 0;
      return { id: s.id, change };
    })
    .filter((m) => m.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const computable = index.signals.filter((s) => s.computable);
  const unavailable = index.signals.filter((s) => !s.computable);

  return {
    zip,
    index,
    composite: explainComposite(index),
    delta: {
      change: index.composite.score - prior.composite.score,
      comparedTo: earlier.toISOString(),
      movers,
    },
    // Contribution order (score x weight): the signal doing the most to the
    // composite reads first, which is what the reference screen shows.
    signals: [
      ...computable.sort((a, b) => b.layerB.score * b.weight - a.layerB.score * a.weight),
      ...unavailable,
    ],
    weightCoverage: index.composite.weightCoverage,
    unavailable,
  };
}

export { BAND_TOKEN, deltaLabel } from "./dashboardShared";

