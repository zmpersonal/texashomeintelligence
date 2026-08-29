/**
 * Home Stress Index — the three-layer contract.
 *
 * Layer A  raw observation   what the source actually said, with provenance
 * Layer B  calculated score  0–100 plus every term that produced it
 * Layer C  explanation       driver codes + template-rendered copy
 *
 * The layers are kept separate in the output, not collapsed, so that Round 4's
 * UI can render text it did not invent (Layer C), a reader can audit the
 * arithmetic (Layer B), and either can be traced to a source (Layer A).
 */
import type { FeedStatus } from "../../ingest/types";

export type SignalId =
  | "roof-storm"
  | "foundation-soil"
  | "hvac"
  | "water-irrigation"
  | "trees-yard";

export type BandId = "normal" | "moderate" | "elevated" | "high";

/** Layer A — one source feed as this signal consumed it. */
export interface SourceInput {
  datasetId: string;
  location: string;
  sourceName: string;
  sourceUrl: string;
  status: FeedStatus;
  /** When we last confirmed the feed. */
  asOf?: string;
  /** How far the records themselves run — routinely earlier than `asOf`. */
  dataThrough?: string;
  /** Count of measured (non-seed) observations this signal actually read. */
  observationsUsed: number;
  /** The extracted facts, for audit. Kept primitive so it serialises cleanly. */
  measures: Record<string, string | number | null>;
}

/** Layer B — one addend in the score, named so the arithmetic is inspectable. */
export interface ScoreTerm {
  code: string;
  label: string;
  /** Points contributed before saturation/clamping. */
  points: number;
  detail?: string;
}

export interface LayerB {
  /** Integer 0–100. */
  score: number;
  band: BandId;
  bandLabel: string;
  /** Raw points before any saturation curve, for audit. */
  rawPoints: number;
  terms: ScoreTerm[];
}

/** Layer C — codes plus the copy generated from them. */
export interface LayerC {
  /** Stable identifiers. Round 4 may key UI off these; it must not parse copy. */
  driverCodes: string[];
  headline: string;
  detail: string;
}

export interface SignalFreshness {
  /** Newest "feed confirmed" across this signal's inputs. */
  asOf?: string;
  /** OLDEST `dataThrough` across inputs — a signal is only as current as its
   * stalest input, and reporting the newest would overstate it. */
  dataThrough?: string;
  /** Which input is holding the signal back, when one is. */
  limitingDatasetId?: string;
}

export interface SignalResult {
  id: SignalId;
  label: string;
  /** False when a required input is missing for this area. The signal still
   * appears in the output — omitting it silently would hide the gap. */
  computable: boolean;
  /** Present when `computable` is false, or when the signal ran on a reduced
   * input set. Rendered verbatim; never a fabricated substitute reading. */
  limitation?: string;
  weight: number;
  layerA: SourceInput[];
  layerB: LayerB;
  layerC: LayerC;
  freshness: SignalFreshness;
}

export interface CompositeResult {
  score: number;
  band: BandId;
  bandLabel: string;
  /** Sum of the weights of the signals that were computable. 1 when all five
   * ran. Below 1, the composite is a re-normalised mean over fewer signals and
   * the UI must say so. */
  weightCoverage: number;
  signalsUsed: SignalId[];
  signalsUnavailable: SignalId[];
}

/**
 * The compare/percentile module. Deliberately never carries a number: no
 * signal we hold varies within a metro, so a ZIP-vs-metro percentile would be
 * invented. Shaped as a discriminated union so that the day a genuinely
 * ZIP-varying input exists, `available: true` can carry real values without
 * Round 4's UI changing shape.
 */
export type CompareResult =
  | { available: false; reason: string }
  | { available: true; percentile: number; basis: string; sampleSize: number };

export interface StressIndexResult {
  /** The area this was computed for — a metro or county key, never a ZIP. */
  areaId: string;
  areaLabel: string;
  methodologyVersion: string;
  /**
   * The date all time-relative maths (storm decay, trailing windows) is
   * measured from. This is the NEWEST `dataThrough` across every input, not
   * wall-clock time — so the same committed data always produces the same
   * scores, and the index can never present itself as more current than the
   * data behind it.
   */
  referenceDate: string;
  composite: CompositeResult;
  signals: SignalResult[];
  freshness: SignalFreshness;
  compare: CompareResult;
}
