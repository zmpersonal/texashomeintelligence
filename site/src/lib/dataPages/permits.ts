/**
 * Roofing permit activity from the two city open-data portals.
 *
 * These two feeds are NOT symmetrical and are deliberately not presented as
 * though they were:
 *
 *  - **San Antonio** publishes an explicit "Re-Roof Permit" type, so every
 *    record is a roof replacement. The count means what a reader assumes.
 *  - **Austin** has no roof-specific permit class, so the fetcher matches the
 *    text "roof" across work class and description. That catches genuine
 *    re-roofs, but also rooftop solar, rooftop HVAC change-outs, electrical
 *    masts running through a roof, and — occasionally — a sign permit for a
 *    business with "Roofing" in its name. Calling that total "roofing permits"
 *    would be a citation liability, so the Austin page reports it as
 *    roof-related permit activity, publishes the composition by the city's own
 *    work class, and states the over-breadth plainly.
 */
import type { Observation } from "../../ingest/types";
import type { DataPageSpec, DataPageContext } from "./types";
import { coverageRange, countBy, formatDay, list, pluralize } from "./types";

interface PermitValue {
  permitType: string;
  workDescription: string;
  status?: string;
}

/** Monthly counts, oldest first: [YYYY-MM, count]. */
function byMonth(observations: Observation<PermitValue>[]): [string, number][] {
  return countBy(observations, (o) => o.observedAt.slice(0, 7)).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
}

function monthLabel(ym: string): string {
  return new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** Whole months only — the first and last month of a feed are usually partial,
 * so a "busiest month" or per-month average that includes them is misleading. */
function completeMonths(observations: Observation<PermitValue>[]): [string, number][] {
  const months = byMonth(observations);
  return months.length <= 2 ? months : months.slice(1, -1);
}

const RECENT_ROWS = 50;

function monthlyAggregate(label: string) {
  return {
    caption: `${label} by month`,
    headers: ["Month", "Permits", "Share of window"],
    rows: ({ observations }: DataPageContext<PermitValue>) => {
      const months = byMonth(observations);
      const total = observations.length;
      return months.map(([ym, n]) => [
        monthLabel(ym),
        n.toLocaleString("en-US"),
        `${((n / total) * 100).toFixed(1)}%`,
      ]);
    },
  };
}

const permitColumns = [
  { header: "Issued", cell: (o: Observation<PermitValue>) => formatDay(o.observedAt) },
  { header: "Permit number", cell: (o: Observation<PermitValue>) => o.key },
  { header: "Work class", cell: (o: Observation<PermitValue>) => o.value.permitType },
  {
    header: "Description",
    cell: (o: Observation<PermitValue>) => {
      const text = (o.value.workDescription || "").replace(/\s+/g, " ").trim();
      if (!text) return "—";
      return text.length > 120 ? `${text.slice(0, 117)}…` : text;
    },
  },
];

// --- San Antonio: an explicit re-roof permit class -----------------------

export const sanAntonioRoofPermits: DataPageSpec<PermitValue> = {
  location: "san-antonio",
  topic: "roof-permits",
  locationLabel: "San Antonio",
  datasetId: "municipal-permits",

  title: "San Antonio Re-Roof Permit Volume by Month | Texas Home Intelligence",
  description:
    "How many re-roof permits the City of San Antonio issued each month, from the city's open permit data — a direct measure of roof replacement activity across the city.",
  eyebrow: "SAN ANTONIO · PERMIT DATA",
  h1: "San Antonio Re-Roof Permits",
  lede: "Every re-roof permit the City of San Antonio issued in this window, counted by month — the closest public measure of how much roof replacement is actually happening.",

  datasetName: "San Antonio, TX Re-Roof Permits Issued",
  datasetDescription:
    "Re-roof permits issued by the City of San Antonio, from the city's open permit data, normalized by Texas Home Intelligence and aggregated by month.",
  spatialCoverage: "San Antonio, Texas",
  keywords: [
    "San Antonio roofing permits",
    "re-roof permit",
    "San Antonio roof replacement",
    "roofing demand San Antonio",
    "building permits San Antonio",
  ],
  csvName: "reroof-permits",

  coverage: ({ observations }) =>
    `Measures: individual re-roof permits issued by the City of San Antonio, counted by issue date. ` +
    `Geography: City of San Antonio permit jurisdiction. ` +
    `Coverage: ${observations.length.toLocaleString("en-US")} permits issued between ${coverageRange(observations)}. ` +
    `Refreshed on each ingestion run from the city's open-data portal.`,

  keyFindings: ({ observations }) => {
    const months = completeMonths(observations);
    const busiest = [...months].sort((a, b) => b[1] - a[1])[0];
    const quietest = [...months].sort((a, b) => a[1] - b[1])[0];
    const avg = months.length
      ? Math.round(months.reduce((sum, [, n]) => sum + n, 0) / months.length)
      : 0;
    const findings = [
      `The City of San Antonio issued ${observations.length.toLocaleString("en-US")} re-roof permits between ${coverageRange(observations)}.`,
    ];
    if (months.length > 0) {
      findings.push(
        `That averages about ${avg.toLocaleString("en-US")} re-roof permits a month across ${months.length} complete ${pluralize(months.length, "month")}.`,
      );
    }
    if (busiest && quietest && busiest[0] !== quietest[0]) {
      findings.push(
        `The busiest complete month was ${monthLabel(busiest[0])} with ${busiest[1].toLocaleString("en-US")} permits; the quietest was ${monthLabel(quietest[0])} with ${quietest[1].toLocaleString("en-US")}.`,
      );
      findings.push(
        `That is a ${(busiest[1] / Math.max(quietest[1], 1)).toFixed(1)}× swing between the busiest and quietest month in the window — roof replacement is strongly seasonal here.`,
      );
    }
    return findings;
  },

  stats: ({ observations }) => {
    const months = completeMonths(observations);
    const busiest = [...months].sort((a, b) => b[1] - a[1])[0];
    const avg = months.length
      ? Math.round(months.reduce((sum, [, n]) => sum + n, 0) / months.length)
      : 0;
    return [
      {
        label: "Re-roof permits in this window",
        value: observations.length.toLocaleString("en-US"),
      },
      { label: "Average per complete month", value: avg.toLocaleString("en-US") },
      {
        label: "Busiest complete month",
        value: busiest ? `${busiest[1].toLocaleString("en-US")} (${monthLabel(busiest[0])})` : "—",
      },
    ];
  },

  questions: ({ observations }) => {
    const months = completeMonths(observations);
    const busiest = [...months].sort((a, b) => b[1] - a[1])[0];
    const quietest = [...months].sort((a, b) => a[1] - b[1])[0];
    const avg = months.length
      ? Math.round(months.reduce((sum, [, n]) => sum + n, 0) / months.length)
      : 0;
    const range = coverageRange(observations);
    return [
      {
        q: "How many roofs are replaced in San Antonio each year?",
        a:
          `The City of San Antonio issued ${observations.length.toLocaleString("en-US")} re-roof permits between ${range}, an average of about ${avg.toLocaleString("en-US")} a month. ` +
          `That is permits pulled, which is the closest public proxy for completed roof replacements — it excludes work done without a permit and includes any permit that was pulled but never used.`,
      },
      {
        q: "When is the busiest time for roofing work in San Antonio?",
        a: busiest
          ? `${monthLabel(busiest[0])} was the busiest complete month in this window, with ${busiest[1].toLocaleString("en-US")} re-roof permits issued${quietest && quietest[0] !== busiest[0] ? `, against ${quietest[1].toLocaleString("en-US")} in the quietest month, ${monthLabel(quietest[0])}` : ""}. ` +
            `Permit volume typically rises after severe-weather periods and in the drier months when tear-off work is easier to schedule.`
          : `Not enough complete months are available in this window to identify a seasonal peak.`,
      },
      {
        q: "Do I need a permit to replace a roof in San Antonio?",
        a:
          `Yes — re-roof work in the City of San Antonio requires a permit, which is why this dataset exists as a distinct permit type. ` +
          `A licensed roofer normally pulls it as part of the job. If a contractor proposes skipping the permit, that is worth questioning: the permit record is what later proves the work was inspected.`,
      },
      {
        q: "Is roofing demand in San Antonio going up or down?",
        a: months.length >= 3
          ? `Across the ${months.length} complete months in this window, monthly volume ranged from ${quietest?.[1].toLocaleString("en-US")} to ${busiest?.[1].toLocaleString("en-US")} permits. ` +
            `The month-by-month table above shows the full shape. A single window like this reflects weather and seasonality more than any underlying trend, so treat it as recent activity rather than a market direction.`
          : `This window does not yet contain enough complete months to describe a trend.`,
      },
    ];
  },

  aggregate: monthlyAggregate("Re-roof permits issued"),
  tableCaption: `The ${RECENT_ROWS} most recently issued re-roof permits. The complete set is in the CSV below.`,
  columns: permitColumns,
  tableRows: ({ observations }) => observations.slice(0, RECENT_ROWS),

  interpretation: ({ observations }) => {
    const months = completeMonths(observations);
    const busiest = [...months].sort((a, b) => b[1] - a[1])[0];
    const avg = months.length
      ? Math.round(months.reduce((sum, [, n]) => sum + n, 0) / months.length)
      : 0;
    return {
      data: `The City of San Antonio issued ${observations.length.toLocaleString("en-US")} re-roof permits between ${coverageRange(observations)}, averaging about ${avg.toLocaleString("en-US")} per complete month${busiest ? ` and peaking at ${busiest[1].toLocaleString("en-US")} in ${monthLabel(busiest[0])}` : ""}.`,
      interpretation: `Permit volume is a demand signal for roofing labor. When monthly volume spikes, reputable local roofers book out further and pricing firms up; the quieter months are when scheduling is easiest and a contractor is most likely to have availability for non-urgent work.`,
      meaning: `If your roof needs replacing but is not actively leaking, the quieter months in the table above are generally the easier time to get competitive quotes and a prompt start date. If you are getting quotes shortly after a storm, expect more competition for crews — and be more careful than usual about out-of-town contractors.`,
      limitations: `A permit is not a completed job: some are pulled and never used, and some work happens without one. Counts are by issue date, not completion. The first and last month of the window are usually partial, so averages and the busiest/quietest months above are computed over complete months only. This covers the City of San Antonio's permit jurisdiction, not the wider metro, and it does not include repair work below the permit threshold.`,
    };
  },

  methodology:
    "Source: City of San Antonio open permit data (CKAN 'building-permits' package, Permits Issued resource), filtered to the city's re-roof permit type. The package also contains a frozen historical archive resource; the fetcher selects the freshest matching resource so the archive is never read in its place. Each permit is stored as one observation keyed by its permit number, so a republished record updates in place rather than duplicating. Monthly figures are computed at build time from those records. Observations are append-only: if a scheduled update fails, the last known-good values are preserved and marked stale with the date they were last confirmed, rather than being shown as zero or blank.",
};

// --- Austin: a text match, with all the caveats that implies ------------

/** Descriptions that explicitly describe replacing a roof covering, as opposed
 * to any of the other work the city's text match sweeps in. A deliberate,
 * labeled text match — reported on the page as derived, never as the headline.
 *
 * Round 6: widened, because the previous pattern required `replace` followed by
 * whitespace and so missed the city's single commonest phrasing for exactly the
 * thing being counted — "Replacement of roof", "REPLACEMENT OF ROOF" (29 rows
 * between them), plus "Replacing Roof" and "replace roofing". Measured against
 * the live archive: 336 -> 366 of 1,945, and one old FALSE positive drops out
 * ("Replace rooftop equipment", which is rooftop mechanical work, not a roof
 * covering) because `roof(ing)?\b` no longer matches "rooftop".
 *
 * Deliberately still conservative, so the number stays a floor rather than an
 * estimate. Known residue, measured not guessed: one row reading "replacement
 * of roof ladder" matches and should not, and phrasings like "TPO Roof overlay"
 * or "replacement of TPO flat roof metal panels" do not match and arguably
 * should. Roughly 30 rows sit in that gap. Widening further starts sweeping in
 * repair-and-adjacency wording ("exterior wall repair and replacement roof
 * repair"), which is why it stops here. */
const RE_ROOF_TEXT =
  /\bre-?roof|roof\s+replacement|replacement\s+of\s+(the\s+)?roof(ing)?\b|replac(e|ing)\s+(the\s+)?roof(ing)?\b|shingle\s+replacement/i;

export const austinRoofPermits: DataPageSpec<PermitValue> = {
  location: "austin",
  topic: "roof-permits",
  locationLabel: "Austin",
  datasetId: "municipal-permits",

  title: "Austin Roof-Related Building Permits by Month | Texas Home Intelligence",
  description:
    "Roof-related building permits issued by the City of Austin each month, from the city's open permit data — what the record covers, and what it does not.",
  eyebrow: "AUSTIN · PERMIT DATA",
  h1: "Austin Roof-Related Permits",
  lede: "Building permits issued by the City of Austin whose work class or description references a roof, counted by month — including what that record sweeps in beyond roof replacement.",

  datasetName: "Austin, TX Roof-Related Building Permits Issued",
  datasetDescription:
    "Building permits issued by the City of Austin whose work class or description references roof work, from the city's open permit data, normalized by Texas Home Intelligence and aggregated by month.",
  spatialCoverage: "Austin, Texas",
  keywords: [
    "Austin roofing permits",
    "Austin building permits",
    "roof permit Austin",
    "rooftop solar permit Austin",
    "Austin construction activity",
  ],
  csvName: "roof-permits",

  coverage: ({ observations }) =>
    `Measures: building permits issued by the City of Austin whose work class or description references a roof. ` +
    `Geography: City of Austin permit jurisdiction. ` +
    `Coverage: ${observations.length.toLocaleString("en-US")} permits issued between ${coverageRange(observations)}. ` +
    `Austin has no roof-specific permit class, so this is a text match — see the limitations below before citing the total.`,

  keyFindings: ({ observations }) => {
    const months = completeMonths(observations);
    const avg = months.length
      ? Math.round(months.reduce((sum, [, n]) => sum + n, 0) / months.length)
      : 0;
    const byClass = countBy(observations, (o) => o.value.permitType);
    const explicit = observations.filter((o) => RE_ROOF_TEXT.test(o.value.workDescription || ""));
    return [
      `The City of Austin issued ${observations.length.toLocaleString("en-US")} roof-related permits between ${coverageRange(observations)}, about ${avg.toLocaleString("en-US")} a month.`,
      `By the city's own work class, the largest groups were ${list(byClass.slice(0, 4).map(([c, n]) => `${c} (${n.toLocaleString("en-US")})`))}.`,
      `${explicit.length.toLocaleString("en-US")} of those ${observations.length.toLocaleString("en-US")} permits — ${Math.round((explicit.length / observations.length) * 100)}% — use wording that explicitly describes replacing a roof covering. Most of the rest reference a roof for another reason, but some describe replacement in phrasing this match does not catch, so read that share as a floor rather than an exact split.`,
      `Austin publishes no roof-specific permit class, so this total is a text match and is broader than roof replacement. Rooftop solar is the single largest contributor.`,
    ];
  },

  stats: ({ observations }) => {
    const months = completeMonths(observations);
    const avg = months.length
      ? Math.round(months.reduce((sum, [, n]) => sum + n, 0) / months.length)
      : 0;
    const explicit = observations.filter((o) => RE_ROOF_TEXT.test(o.value.workDescription || ""));
    return [
      {
        label: "Roof-related permits in this window",
        value: observations.length.toLocaleString("en-US"),
      },
      { label: "Average per complete month", value: avg.toLocaleString("en-US") },
      {
        label: "Describing a roof replacement",
        value: `${explicit.length.toLocaleString("en-US")} of ${observations.length.toLocaleString("en-US")}`,
      },
    ];
  },

  questions: ({ observations }) => {
    const byClass = countBy(observations, (o) => o.value.permitType);
    const explicit = observations.filter((o) => RE_ROOF_TEXT.test(o.value.workDescription || ""));
    const months = completeMonths(observations);
    const busiest = [...months].sort((a, b) => b[1] - a[1])[0];
    const avg = months.length
      ? Math.round(months.reduce((sum, [, n]) => sum + n, 0) / months.length)
      : 0;
    const range = coverageRange(observations);
    return [
      {
        q: "How many roofing permits does Austin issue?",
        a:
          `The City of Austin issued ${observations.length.toLocaleString("en-US")} roof-related permits between ${range}, about ${avg.toLocaleString("en-US")} a month — but that figure is broader than roof replacement. ` +
          `Austin has no roof-specific permit class, so these are permits whose work class or description mentions a roof. ${explicit.length.toLocaleString("en-US")} of them explicitly describe replacing a roof covering.`,
      },
      {
        q: "Do I need a permit to replace a roof in Austin?",
        a:
          `Yes — a re-roof in the City of Austin requires a building permit, normally pulled by the roofing contractor as part of the job. ` +
          `Because Austin files those under general work classes such as Repair or Remodel rather than a dedicated roofing class, they are harder to count than San Antonio's explicit re-roof permits.`,
      },
      {
        q: "What kinds of roof work show up in Austin permit data?",
        a:
          `By the city's own work class, the largest groups in this window were ${list(byClass.slice(0, 4).map(([c, n]) => `${c} (${n.toLocaleString("en-US")})`))}. ` +
          `A large share is rooftop solar rather than roof replacement — solar installs are filed under classes like Auxiliary Power and mention the roof in their description, so a text match picks them up.`,
      },
      {
        q: "When is the busiest month for roof work in Austin?",
        a: busiest
          ? `${monthLabel(busiest[0])} was the busiest complete month in this window, with ${busiest[1].toLocaleString("en-US")} roof-related permits. ` +
            `The month-by-month table above shows the full shape. Because this count mixes roof replacement with rooftop solar and other roof-adjacent work, read it as overall roof-related construction activity rather than as roofing demand alone.`
          : `This window does not contain enough complete months to identify a seasonal peak.`,
      },
    ];
  },

  aggregate: monthlyAggregate("Roof-related permits issued"),
  tableCaption: `The ${RECENT_ROWS} most recently issued roof-related permits, with the city's work class and description so you can see what the match includes. The complete set is in the CSV below.`,
  columns: permitColumns,
  tableRows: ({ observations }) => observations.slice(0, RECENT_ROWS),

  interpretation: ({ observations }) => {
    const explicit = observations.filter((o) => RE_ROOF_TEXT.test(o.value.workDescription || ""));
    const byClass = countBy(observations, (o) => o.value.permitType);
    return {
      data: `The City of Austin issued ${observations.length.toLocaleString("en-US")} permits referencing roof work between ${coverageRange(observations)}. The largest work classes were ${list(byClass.slice(0, 3).map(([c, n]) => `${c} (${n.toLocaleString("en-US")})`))}.`,
      interpretation: `Only ${explicit.length.toLocaleString("en-US")} of these descriptions — about ${Math.round((explicit.length / observations.length) * 100)}% — describe replacing a roof covering. That share is a text match applied by Texas Home Intelligence to the city's description field, not a category the city publishes, so treat it as an indication of composition rather than an exact count.`,
      meaning: `For a homeowner comparing quotes, the useful reading here is activity level rather than the headline number: months with heavy roof-related permitting are months when crews are busiest. If you want a cleaner measure of pure roof replacement volume, San Antonio's re-roof permit data is the better comparison, because that city publishes roof work as its own permit type.`,
      limitations: `Austin publishes no roof-specific permit class, so this dataset is built from a text match on work class and description. It therefore includes rooftop solar installations, rooftop HVAC change-outs, electrical masts passing through a roof, and occasionally a sign permit for a business whose name contains "Roofing". It is not a count of roof replacements. A permit is also not a completed job, counts are by issue date, and the first and last month of the window are usually partial — averages and the busiest month are computed over complete months only.`,
    };
  },

  methodology:
    "Source: City of Austin Issued Construction Permits (Socrata open data), queried with a SoQL filter matching the text 'roof' against work class, permit type and description within the requested issue-date window. Each permit is stored as one observation keyed by its permit number, so a republished record updates in place rather than duplicating. The share of permits describing a roof replacement is computed at build time by matching the city's description text and is labeled as derived wherever it appears. Observations are append-only: if a scheduled update fails, the last known-good values are preserved and marked stale with the date they were last confirmed, rather than being shown as zero or blank.",
};
