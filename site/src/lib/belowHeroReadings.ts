/**
 * The single live reading each #context block renders.
 *
 * Kept out of `data/belowHero.ts` on purpose: that file holds prose, this one
 * holds the arithmetic, and no number in the content config is ever a literal.
 * Each reader states the ONE fact its feed supports and nothing beyond it.
 */
import { findDataset, freshnessOf, type Freshness } from "./datasets";

export interface ContextReading {
  label: string;
  value: string;
  freshness: Freshness;
  sourceName: string;
  sourceUrl: string;
  /** Where the full data page lives, when one is published for this feed. */
  href?: string;
}

type Reader = (location: string) => ContextReading | undefined;

function latest<T>(datasetId: string, location: string) {
  const dataset = findDataset<T>(datasetId, location);
  if (!dataset || dataset.status === "sample") return undefined;
  const obs = dataset.observations
    .filter((o) => !o.seed)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  if (obs.length === 0) return undefined;
  return { dataset, newest: obs[0] };
}

const READERS: Record<string, Reader> = {
  "air-quality": (location) => {
    const hit = latest<{ aqi: number; category: string }>("airnow", location);
    if (!hit) return undefined;
    return {
      label: "Air quality index, San Antonio reporting area",
      value: `${hit.newest.value.aqi} — ${hit.newest.value.category}`,
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
    };
  },
  drought: (location) => {
    const hit = latest<{ droughtIndex: string; county: string }>("usdm-drought", location);
    if (!hit) return undefined;
    return {
      label: `Drought category, ${hit.newest.value.county} County`,
      value: hit.newest.value.droughtIndex,
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
      href: `/data/${location}/drought/`,
    };
  },
};

export function contextReading(topic: string, location: string): ContextReading | undefined {
  return READERS[topic]?.(location);
}
