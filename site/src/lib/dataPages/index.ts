/**
 * The registry of published data pages.
 *
 * Adding a data page = adding a spec file here and one line to DATA_PAGES, not
 * copying an `.astro` file (CLAUDE.md: config-driven, not hand-coded pages).
 * The route `src/pages/data/[location]/[topic]/`, its CSV endpoint, the
 * `/data/[location]/` hub and the `/data/` catalog all generate from this.
 */
import { findDataset } from "../datasets";
import { type DataPageSpec, publishable } from "./types";

import { austinRoofing } from "./austinRoofing";
import { sanAntonioStorms } from "./sanAntonioStorms";
import { austinDrought, sanAntonioDrought } from "./drought";
import { austinRoofPermits, sanAntonioRoofPermits } from "./permits";
import { texasElectricity } from "./texasElectricity";

export type { DataPageSpec, DataPageContext, DataPageStat, DataPageQuestion } from "./types";
export { publishable } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is
// heterogeneous by design: each spec is internally consistent about its own
// observation value type, but they differ from one another.
export const DATA_PAGES: DataPageSpec<any>[] = [
  austinRoofing,
  austinRoofPermits,
  austinDrought,
  sanAntonioStorms,
  sanAntonioRoofPermits,
  sanAntonioDrought,
  texasElectricity,
];

/**
 * The specs that actually build, optionally narrowed to one location. Every
 * route, hub and cross-link resolves through this so nothing can link to a
 * data page that was skipped for want of a live feed.
 */
export function publishedDataPages(location?: string): DataPageSpec<any>[] {
  return DATA_PAGES.filter(
    (spec) =>
      (location === undefined || spec.location === location) &&
      publishable(findDataset(spec.datasetId, spec.location)),
  );
}

/**
 * The link to a feed's data page, or `undefined` when no such page is built.
 *
 * Round 32. Two callers wrote `/data/${location}/storms/` by hand and only one
 * metro has a spec with that topic, so on the other the href pointed at a
 * route that does not exist. The registry is the only thing that knows which
 * pages build, so every cross-link into /data/ resolves through here. A caller
 * that gets `undefined` withholds the LINK and keeps its source and as-of
 * label: the provenance of a reading never depends on whether there is a page
 * to link to.
 *
 * `topic` is optional but rarely optional in practice. A dataset can back more
 * than one page — `noaa-storm-events` backs both `/data/san-antonio/storms/`
 * and `/data/austin/roofing/`, which frames the same NOAA records for a
 * roofing reader — so a lookup by dataset alone can resolve to a page the
 * caller did not mean, under a heading its link text does not match. Callers
 * naming a specific page pass the topic; the article layer, which only knows
 * the series a chart was drawn from, does not.
 */
export function dataPageLink(
  datasetId: string,
  location: string,
  topic?: string,
): { href: string; label: string } | undefined {
  const spec = publishedDataPages(location).find(
    (s) => s.datasetId === datasetId && (topic === undefined || s.topic === topic),
  );
  return spec ? { href: `/data/${spec.location}/${spec.topic}/`, label: spec.h1 } : undefined;
}

/** The href alone, for callers that carry their own link text. */
export function dataPageHref(
  datasetId: string,
  location: string,
  topic?: string,
): string | undefined {
  return dataPageLink(datasetId, location, topic)?.href;
}

/** Whether `/data/{location}/` exists — callers must not link to it otherwise. */
export function hasDataHub(location: string): boolean {
  return publishedDataPages(location).length > 0;
}

/**
 * Every location with a published data hub, in display order. Derived from the
 * registry rather than the `locations` content collection so a statewide page
 * like Texas can have a data hub without becoming a marketing location (which
 * would generate a service-page grid for it).
 */
const LOCATION_ORDER = ["austin", "san-antonio", "texas"];

export function dataHubLocations(): { location: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const spec of publishedDataPages()) {
    if (!seen.has(spec.location)) seen.set(spec.location, spec.locationLabel);
  }
  return [...seen.entries()]
    .map(([location, label]) => ({ location, label }))
    .sort((a, b) => {
      const ai = LOCATION_ORDER.indexOf(a.location);
      const bi = LOCATION_ORDER.indexOf(b.location);
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
    });
}
