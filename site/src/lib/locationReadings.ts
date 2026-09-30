/**
 * The readings a city page can honestly show, assembled per location.
 *
 * Every function here answers with the GRAIN it measured at, because that is
 * what the label has to say. Round 41a's defect was a county reading wearing
 * another county's name; the shape that prevents it is returning the county
 * alongside the number rather than leaving the caller to assume one.
 *
 * A reading that does not exist comes back `undefined` with a REASON. The site
 * withholds with an explanation rather than rendering a blank or, worse, the
 * metro's value — see `withheld` below.
 */
import { findDataset, freshnessOf, type Freshness } from "./datasets";
import type { LocationDef } from "../data/locations";
import type { Observation } from "../ingest/types";

export interface CountyReading {
  /** The county this was measured in. Always rendered beside the value. */
  county: string;
  value: string;
  detail: string;
  observations: number;
  freshness: Freshness;
  sourceName: string;
  sourceUrl: string;
  /** Oldest..newest of the rows behind it, so copy cannot imply more history. */
  from?: string;
  to?: string;
}

export interface Withheld {
  reason: string;
}

const measured = <T,>(o: Observation<T>[]) => o.filter((x) => !x.seed);

function parseDroughtLabel(raw: string | undefined): { label: string; level: number | null } {
  const s = raw ?? "";
  const lvl = s.match(/^D(\d)/);
  const name = s.match(/—\s*([^(]+?)\s*(?:\(|$)/);
  return { label: name ? name[1].trim() : "None", level: lvl ? Number(lvl[1]) : null };
}

/** Weekly U.S. Drought Monitor, filtered to the location's own county FIPS. */
export function droughtFor(loc: LocationDef): CountyReading | Withheld {
  const ds = findDataset<{ droughtIndex?: string }>("usdm-drought", loc.areaId);
  if (!ds || ds.status === "sample") {
    return { reason: `No live U.S. Drought Monitor feed for the ${loc.areaId} area.` };
  }
  const rows = measured(ds.observations)
    .filter((o) => o.key.startsWith(`${loc.county.fips}-`))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  if (rows.length === 0) {
    return {
      reason:
        `The U.S. Drought Monitor publishes ${loc.county.name} County weekly, but no reading ` +
        `for it has been ingested yet.`,
    };
  }
  const latest = parseDroughtLabel(rows[0].value.droughtIndex);
  return {
    county: `${loc.county.name} County`,
    value: latest.level === null ? "None" : `D${latest.level}`,
    detail: latest.level === null ? "No drought" : latest.label,
    observations: rows.length,
    freshness: freshnessOf(ds),
    sourceName: ds.source.name,
    sourceUrl: ds.source.url,
    from: rows[rows.length - 1].observedAt,
    to: rows[0].observedAt,
  };
}

/** NOAA Storm Events, filtered to the location's own county by name. */
export function stormsFor(loc: LocationDef): CountyReading | Withheld {
  const ds = findDataset<{ county?: string; eventType?: string }>(
    "noaa-storm-events",
    loc.areaId,
  );
  if (!ds || ds.status === "sample") {
    return { reason: `No live NOAA Storm Events feed for the ${loc.areaId} area.` };
  }
  const rows = measured(ds.observations)
    .filter((o) => o.value.county === loc.county.name)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  if (rows.length === 0) {
    return {
      reason:
        `No severe-weather events were recorded in ${loc.county.name} County in the window ` +
        `we hold.`,
    };
  }
  const types = new Map<string, number>();
  for (const o of rows) {
    const t = o.value.eventType ?? "Other";
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  const top = [...types.entries()].sort((a, b) => b[1] - a[1]);
  return {
    county: `${loc.county.name} County`,
    value: String(rows.length),
    detail: top.map(([t, n]) => `${t} ${n}`).join(" · "),
    observations: rows.length,
    freshness: freshnessOf(ds),
    sourceName: ds.source.name,
    sourceUrl: ds.source.url,
    from: rows[rows.length - 1].observedAt,
    to: rows[0].observedAt,
  };
}

export function isWithheld(r: CountyReading | Withheld): r is Withheld {
  return (r as Withheld).reason !== undefined;
}

/**
 * Census ACS, at whatever grain the row says it was measured at.
 *
 * The label comes from `value.geography`, written by the fetcher — never from
 * the location's name. A city figure and a county figure are indistinguishable
 * once they are two decimals in a card, so the grain travels with the number
 * rather than being reconstructed here.
 */
export function housingFor(loc: LocationDef): CountyReading | Withheld {
  const ds = findDataset<{
    medianHomeAgeYears?: number;
    ownerOccupiedPct?: number;
    geography?: { grain: string; label: string };
  }>("census-acs", loc.slug);
  if (!ds || ds.status === "sample") {
    return { reason: `No Census ACS reading has been ingested for ${loc.label} yet.` };
  }
  const rows = measured(ds.observations).sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
  const latest = rows[0];
  if (!latest || latest.value.ownerOccupiedPct === undefined) {
    return { reason: `No Census ACS reading has been ingested for ${loc.label} yet.` };
  }
  const geo = latest.value.geography;
  return {
    county: geo?.label ?? loc.label,
    value: `${latest.value.ownerOccupiedPct}%`,
    detail:
      latest.value.medianHomeAgeYears !== undefined
        ? `Owner-occupied · median home age ${latest.value.medianHomeAgeYears} years`
        : "Owner-occupied",
    observations: rows.length,
    freshness: freshnessOf(ds),
    sourceName: ds.source.name,
    sourceUrl: ds.source.url,
    from: rows[rows.length - 1].observedAt,
    to: latest.observedAt,
  };
}

/**
 * Cooling load, from the location's own station.
 *
 * ⚠️ THE STATION'S PUBLISHED NAME IS NEVER RETURNED. New Braunfels' station is
 * named `AUSTIN SAN ANTONIO` in NOAA's table, which on a New Braunfels page
 * would read as an error or a mislabel. The identity a reader needs is the
 * DISTANCE, which is what qualified the station in the first place; the id is
 * available for anyone checking the source. Round 41e flagged this.
 */
export function coolingLoadFor(loc: LocationDef): CountyReading | Withheld {
  if (!loc.climateStation) {
    return {
      reason: `No weather station near ${loc.label} publishes a 1991–2020 climate normal.`,
    };
  }
  const ds = findDataset<{
    kind?: string;
    coolingDegreeDaysF?: number;
    month?: number;
    sourceRef?: string;
  }>("noaa-climate", loc.slug);
  if (!ds || ds.status === "sample") {
    return { reason: `No cooling-load reading has been ingested for ${loc.label} yet.` };
  }
  const normals = measured(ds.observations).filter(
    (o) => o.value.kind === "normal-1991-2020" && typeof o.value.coolingDegreeDaysF === "number",
  );
  if (normals.length < 12) {
    return {
      reason:
        `Fewer than twelve monthly normals are held for ${loc.label}, so no annual figure ` +
        `is published.`,
    };
  }
  const annual = normals.reduce((sum, o) => sum + (o.value.coolingDegreeDaysF ?? 0), 0);
  return {
    county: `${loc.climateStation.distanceMiles} mi from ${loc.label}`,
    value: Math.round(annual).toLocaleString("en-US"),
    detail: `Cooling degree days a year, 1991–2020 normal (base 65°F)`,
    observations: normals.length,
    freshness: freshnessOf(ds),
    sourceName: ds.source.name,
    sourceUrl: ds.source.url,
  };
}
