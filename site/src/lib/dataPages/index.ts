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
