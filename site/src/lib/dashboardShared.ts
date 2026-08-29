/**
 * The two helpers the server-rendered dashboard needs, kept apart from
 * `dashboard.ts`.
 *
 * `dashboard.ts` imports the engine, which imports the eager dataset glob.
 * Anything the Worker imports must therefore avoid it — so these live here,
 * depend on nothing, and are re-exported by `dashboard.ts` for the static
 * pages that already pay for the glob at build time.
 */
export type BandId = "normal" | "moderate" | "elevated" | "high";

/** Status-ramp token suffix for a band. */
export const BAND_TOKEN: Record<BandId, string> = {
  normal: "safe",
  moderate: "watch",
  elevated: "elevated",
  high: "severe",
};

/** Zero is stated, not hidden — "no change" is a measurement. */
export function deltaLabel(change: number): string {
  if (change === 0) return "No change";
  return `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} point${Math.abs(change) === 1 ? "" : "s"}`;
}
