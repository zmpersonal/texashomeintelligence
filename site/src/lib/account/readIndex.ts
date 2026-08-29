/**
 * Reads the precomputed stress-index artifact from the Worker's own static
 * assets.
 *
 * The logged-in dashboard is server-rendered, so it cannot import the engine:
 * `datasets.ts` uses an eager `import.meta.glob` over every generated file, and
 * anything that touches it drags the whole data tree — thousands of permit
 * records — into the Worker bundle. Measured: 0.79 MB to 2.78 MB.
 *
 * So the page reads the same JSON the public pages publish, through the ASSETS
 * binding. That is a local read inside the Worker — no network hop, no
 * database, no government API — and it is literally the precomputed output the
 * round's constraints call for.
 */
import { env } from "cloudflare:workers";
import type { StressIndexResult } from "../stressIndex/types";
import type { FiredAlert } from "./alertCatalogue";
import type { SignalSeries } from "../signalSeries";
import type { StageReading } from "../municipal/watering";

export interface PrecomputedArea extends StressIndexResult {
  compositeExplanation: { headline: string; detail: string };
  dashboard: {
    delta: { change: number; comparedTo: string; movers: { id: string; change: number }[] };
    signalOrder: string[];
    series: Record<string, SignalSeries | undefined>;
    weightCoverage: number;
    compositeHeadline: string;
  } | null;
  alerts: FiredAlert[];
  /** Round 5b. Optional so an artifact built before this round still parses
   * rather than throwing the whole dashboard to the ZIP page. */
  municipal?: { waterStage: StageReading | null };
}

export async function readAreaIndex(areaId: string): Promise<PrecomputedArea | null> {
  const assets = (env as unknown as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
  if (!assets) return null;
  const res = await assets.fetch(
    new Request(`https://assets.local/data/stress-index/${areaId}.json`),
  );
  if (!res.ok) return null;
  return (await res.json()) as PrecomputedArea;
}
