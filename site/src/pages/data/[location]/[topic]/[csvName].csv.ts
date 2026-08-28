/**
 * The machine-readable copy of each data page, generated from the same
 * observations the page renders.
 *
 * This used to be a hand-written file in `public/` that had drifted badly: it
 * held four SAMPLE rows while the page beside it showed dozens of real ones,
 * and the page's `Dataset.distribution` pointed a crawler at that file. Being
 * an endpoint over the same dataset means the download and the table cannot
 * disagree. The URL is unchanged (CLAUDE.md: preserve URLs).
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { publishedDataPages, type DataPageSpec } from "../../../../lib/dataPages";
import { requireDataset } from "../../../../lib/datasets";

export const getStaticPaths: GetStaticPaths = () =>
  publishedDataPages().map((spec) => ({
    params: { location: spec.location, topic: spec.topic, csvName: spec.csvName },
    props: { spec },
  }));

/** RFC 4180: quote every field, doubling any embedded quote. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export const GET: APIRoute = ({ props }) => {
  const spec = props.spec as DataPageSpec<any>;
  const dataset = requireDataset(spec.datasetId, spec.location);
  const observations = dataset.observations
    .filter((o) => !o.seed)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

  const header = ["observed_at", ...spec.columns.map((c) => c.header)];
  const rows = observations.map((o) => [o.observedAt, ...spec.columns.map((c) => c.cell(o))]);
  const body = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

  return new Response(body + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="${spec.csvName}.csv"`,
    },
  });
};
