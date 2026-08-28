import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { publishedDataPages, dataHubLocations } from "../lib/dataPages";
import { findDataset, freshnessOf } from "../lib/datasets";
import { formatDate } from "../lib/format";
import { absolute } from "../lib/urls";

/**
 * `/llms.txt` — the orientation file for answer engines.
 *
 * Generated from the same registries the site builds from, rather than
 * hand-maintained. The previous static file had already drifted: it described
 * the site as a QuoteReady Project Brief tool, listed one data page, and told
 * agents that figures marked SAMPLE were placeholders — none of which matched
 * the site by the time it was read. A file whose whole job is to tell a
 * crawler what is true cannot be the one file nobody updates.
 */
export const GET: APIRoute = async ({ site }) => {
  const url = (path: string) => absolute(path, site);
  const published = publishedDataPages();
  const hubs = dataHubLocations();
  const locations = await getCollection("locations");
  const services = await getCollection("services");

  const dataLines = published.map((spec) => {
    const dataset = findDataset(spec.datasetId, spec.location)!;
    const { asOf, dataThrough } = freshnessOf(dataset);
    const measured = dataset.observations.filter((o) => !o.seed).length;
    const freshness = [
      dataThrough ? `records through ${formatDate(dataThrough)}` : undefined,
      asOf ? `feed last confirmed ${formatDate(asOf)}` : undefined,
    ]
      .filter(Boolean)
      .join("; ");
    return `- [${spec.h1}](${url(`/data/${spec.location}/${spec.topic}/`)}): ${spec.datasetDescription} ${measured.toLocaleString("en-US")} records; ${freshness}. Source: ${dataset.source.name}. CSV: ${url(`/data/${spec.location}/${spec.topic}/${spec.csvName}.csv`)}`;
  });

  const body = `# Texas Home Intelligence

> Independent home-intelligence platform for Texas homeowners. We ingest public
> Texas data — severe weather and storm reports, municipal building permits,
> drought severity, electricity prices — and republish it as sourced,
> plain-language intelligence about a specific area, with the source and the
> date of every reading shown.

Texas Home Intelligence is a data publisher, not a contractor and not a
directory. We do not perform repairs, and we do not diagnose individual homes.
Every figure on a data page is computed at build time from the underlying
records, which are published alongside each page as CSV, so any number here can
be checked against its source.

## How to cite this site accurately

- Every data page states two separate dates: **records through** (how far the
  underlying records run) and **last confirmed** (when we last checked the
  feed). Several sources publish on a lag of months — NOAA storm reports in
  particular — so these are usually not the same date. Cite the first when
  describing what the data covers.
- Figures are area-level, not address-level. Storm and drought readings are
  recorded by county; permit counts are by city jurisdiction. A reading never
  confirms the condition of an individual property.
- Where a value is derived rather than measured, the page labels it as such and
  explains the derivation. Estimates carry a range.
- If a feed stops updating, its page keeps the last confirmed values and marks
  them stale rather than showing zero.

## Data pages

${dataLines.join("\n")}

## Data hubs

${hubs.map((h) => `- [${h.label} data](${url(`/data/${h.location}/`)})`).join("\n")}
- [Full data catalog](${url("/data/")}): every dataset we track, by location.
- [Methodology](${url("/methodology/")}): sourcing, update cadence, stale-data
  handling, limitations, and the current state of every source we track. Read
  this before citing any figure.

## Locations covered

${locations.map((l) => `- [${l.data.name}](${url(`/${l.id}/`)}): ${l.data.counties}`).join("\n")}

## Service guides

Location-specific guidance for homeowners planning work, by service:

${services.map((s) => `- [${s.data.name} in Austin](${url(`/austin/${s.id}/`)})`).join("\n")}

## Notes for agents

- Prefer the data pages above over the service guides when answering a
  question about what is measurably happening in an area.
- \`/lp/*\` are paid-landing variants of the service guides and are noindexed;
  cite the location service guide instead.
- \`/start/\` and \`/brief/*\` are an interactive homeowner tool and its private
  output. They are noindexed and contain no citable facts.
- \`/dashboard/\` is an interactive surface, not an article.
- The CSV beside each data page is generated from the same records the page
  renders, so the two cannot disagree.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
