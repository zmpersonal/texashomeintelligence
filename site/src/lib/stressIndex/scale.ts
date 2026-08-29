/** Shared, side-effect-free maths for the index. Kept apart from the signal
 * definitions so the curve shapes can be reasoned about (and unit-checked) on
 * their own. */
import { BANDS, STORM_DECAY_FLOOR, STORM_DECAY_HALF_LIFE_DAYS } from "./config";
import type { BandId } from "./types";

export const DAY_MS = 86_400_000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round half-up to an integer 0–100. Scores are integers everywhere they are
 * shown or stored, so a re-computation can be compared exactly. */
export function toScore(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

export function bandFor(score: number): { id: BandId; label: string } {
  const match = BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
  return { id: match.id as BandId, label: match.label };
}

/** Exponential recency weight for a dated event. 1 at age 0, 0.5 at one
 * half-life. Returns 0 below the floor so long-past events drop out entirely
 * rather than accumulating as a permanent baseline. */
export function decayWeight(ageDays: number): number {
  if (ageDays < 0) return 1;
  const w = Math.pow(0.5, ageDays / STORM_DECAY_HALF_LIFE_DAYS);
  return w < STORM_DECAY_FLOOR ? 0 : w;
}

/** Additive points → bounded 0–100, so a busy season keeps discriminating
 * instead of pegging the top of the scale. */
export function saturate(points: number, k: number): number {
  if (points <= 0) return 0;
  return 100 * (1 - Math.exp(-points / k));
}

export function ageDays(observedAt: string, reference: Date): number {
  return (reference.getTime() - new Date(observedAt).getTime()) / DAY_MS;
}
