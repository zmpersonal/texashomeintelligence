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
  /** Link text. Named here rather than derived from the topic slug, which
   * produces "Full electricity-rate data" — a slug leaking into copy. */
  linkLabel?: string;
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
  /**
   * Round 10b. The EIA residential rate, restored.
   *
   * Round 10 withheld it under a blanket "no price figure" reading. That was
   * over-cautious and the owner has said so: the no-price rule exists because
   * permit valuation cannot support a cost figure (docs/audits/round-6-...),
   * which is a rule about FABRICATED cost ranges. This is a published,
   * observed, federally-collected rate — the same class of fact as an air
   * quality index, and it was this page's reading before Round 10 removed it.
   *
   * The rate and nothing else. No monthly-bill estimate, no payback period, no
   * "what you'd save" counterfactual — each of those needs a consumption
   * figure for THIS home, which we do not have and would have to invent.
   * `/data/texas/electricity-prices/` does compute a 1,000 kWh reference bill;
   * that is that page's convention, stated there, and it is not carried here.
   *
   * Note the location: this series is STATEWIDE. It is read from `texas.json`
   * regardless of which metro's page is rendering, and the label says so —
   * presenting a Texas average as a San Antonio rate would be the kind of
   * quiet overstatement the labelling rules exist to prevent.
   */
  "electricity-rate": () => {
    const hit = latest<{ pricePerKwhCents: number }>("eia-electricity", "texas");
    if (!hit) return undefined;
    return {
      label: "Average residential electricity price, Texas",
      value: `${hit.newest.value.pricePerKwhCents.toFixed(2)}¢ per kWh`,
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
      href: "/data/texas/electricity-prices/",
      linkLabel: "Full Texas electricity price series, sources and limitations",
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
      linkLabel: "Full drought data, sources and limitations",
    };
  },
};

export function contextReading(topic: string, location: string): ContextReading | undefined {
  return READERS[topic]?.(location);
}
