/**
 * Austin · roofing — NOAA Storm Events, framed for roof decisions.
 * See ./types.ts for the contract and the two rules every spec honors.
 */
import type { Observation } from "../../ingest/types";
import type { StormEventValue } from "../../ingest/fetchers/noaaStormEvents";
import { formatMonth } from "../format";
import {
  type DataPageSpec,
  coverageRange,
  countBy,
  list,
  numberIn as inchesOf,
} from "./types";

// --- Austin · roofing (NOAA Storm Events) -------------------------------

/** The roof-damage threshold this page reasons about. Widely used by roofing
 * contractors and property insurers as the point where asphalt-shingle
 * bruising becomes likely — an interpretation, labeled as one on the page,
 * not a measured value. */
const HAIL_DAMAGE_THRESHOLD_IN = 1.0;

export const austinRoofing: DataPageSpec<StormEventValue> = {
  location: "austin",
  topic: "roofing",
  locationLabel: "Austin",
  datasetId: "noaa-storm-events",

  title: "Austin Hail & Storm Event Data for Roofing | Texas Home Intelligence",
  description:
    "Recorded hail, wind, flood and tornado events for the seven-county Austin area, from NOAA's Storm Events Database, with what they may mean for roof inspection and replacement timing.",
  eyebrow: "AUSTIN · ROOFING DATA",
  h1: "Austin Hail & Storm Events",
  lede: "Every severe-weather event NOAA has recorded for the Austin area in this reporting window — and what the hail figures may mean for roof age, damage likelihood, and quote timing.",

  datasetName: "Austin, TX Area Hail, Wind and Storm Events (Roofing Context)",
  datasetDescription:
    "Severe-weather events recorded by NOAA's Storm Events Database for Travis County and its bordering counties, normalized by Texas Home Intelligence and used as roofing-decision context.",
  spatialCoverage: "Austin, Texas metropolitan area",
  keywords: [
    "Austin hail",
    "Austin storm events",
    "Texas hail damage",
    "roof hail damage",
    "Travis County hail",
    "Williamson County hail",
  ],
  csvName: "hail-events",

  coverage: ({ observations }) => {
    const counties = countBy(observations, (o) => o.value.county).length;
    return (
      `Measures: individual severe-weather reports (hail, wind, flood, tornado) filed with NOAA. ` +
      `Geography: Travis County and its bordering counties — ${counties} counties with reports in this window. ` +
      `Coverage: events recorded between ${coverageRange(observations)}. ` +
      `Checked on each ingestion run; NOAA publishes storm reports on a lag of several months.`
    );
  },

  keyFindings: ({ observations }) => {
    const hail = observations.filter((o) => o.value.eventType === "Hail");
    const damaging = hail.filter((o) => inchesOf(o.value.magnitude) >= HAIL_DAMAGE_THRESHOLD_IN);
    const largest = hail.reduce<Observation<StormEventValue> | undefined>(
      (max, o) => (!max || inchesOf(o.value.magnitude) > inchesOf(max.value.magnitude) ? o : max),
      undefined,
    );
    const byType = countBy(observations, (o) => o.value.eventType);
    const byCounty = countBy(observations, (o) => o.value.county);
    const byMonth = countBy(observations, (o) => o.observedAt.slice(0, 7));
    const findings = [
      `NOAA recorded ${observations.length} severe-weather events across the Austin area between ${coverageRange(observations)}.`,
      `By type: ${list(byType.map(([type, n]) => `${n} ${type.toLowerCase()}`))}.`,
    ];
    if (hail.length > 0) {
      findings.push(
        `${damaging.length} of the ${hail.length} hail reports measured ${HAIL_DAMAGE_THRESHOLD_IN.toFixed(1)} inch or larger, the size most often associated with asphalt-shingle damage.`,
      );
    }
    if (largest) {
      findings.push(
        `The largest reported hail was ${largest.value.magnitude} in ${largest.value.county} County, ${formatMonth(largest.observedAt)}.`,
      );
    }
    if (byCounty[0]) {
      findings.push(
        `${byCounty[0][0]} County recorded the most events (${byCounty[0][1]}) of any county in the window.`,
      );
    }
    if (byMonth[0]) {
      findings.push(
        `${formatMonth(`${byMonth[0][0]}-01`)} was the most active month, with ${byMonth[0][1]} recorded events.`,
      );
    }
    return findings;
  },

  stats: ({ observations }) => {
    const hail = observations.filter((o) => o.value.eventType === "Hail");
    const largestIn = hail.reduce((max, o) => Math.max(max, inchesOf(o.value.magnitude)), 0);
    const damaging = hail.filter((o) => inchesOf(o.value.magnitude) >= HAIL_DAMAGE_THRESHOLD_IN);
    return [
      { label: "Recorded events in this window", value: String(observations.length) },
      {
        label: "Largest reported hail",
        value: largestIn > 0 ? `${largestIn.toFixed(2)}″` : "No hail reported",
      },
      {
        label: `Hail reports ${HAIL_DAMAGE_THRESHOLD_IN.toFixed(1)}″ or larger`,
        value: `${damaging.length} of ${hail.length}`,
      },
    ];
  },

  questions: ({ observations }) => {
    const hail = observations.filter((o) => o.value.eventType === "Hail");
    const damaging = hail.filter((o) => inchesOf(o.value.magnitude) >= HAIL_DAMAGE_THRESHOLD_IN);
    const largestIn = hail.reduce((max, o) => Math.max(max, inchesOf(o.value.magnitude)), 0);
    const byCounty = countBy(observations, (o) => o.value.county);
    const byMonth = countBy(observations, (o) => o.observedAt.slice(0, 7));
    const range = coverageRange(observations);
    const topCounties = byCounty
      .slice(0, 3)
      .map(([county, n]) => `${county} County (${n})`);

    return [
      {
        q: "How much hail has the Austin area had recently?",
        a:
          `NOAA recorded ${hail.length} hail events across the seven-county Austin area between ${range}, ` +
          `${damaging.length} of them at ${HAIL_DAMAGE_THRESHOLD_IN.toFixed(1)} inch or larger. ` +
          `The largest measured ${largestIn.toFixed(2)} inches. ` +
          `Every event in that count appears in the table on this page, with its date, size and county.`,
      },
      {
        q: "What size hail damages a roof?",
        a:
          `Roofing contractors and property insurers generally treat hail of about ${HAIL_DAMAGE_THRESHOLD_IN.toFixed(1)} inch — roughly a quarter — as the point where asphalt shingles start to bruise or lose granules. ` +
          `Smaller hail can still damage older or already-worn roofs. This threshold is an industry rule of thumb we apply to the NOAA figures, not a measurement, and it does not confirm damage to any specific roof.`,
      },
      {
        q: "Which Austin-area counties get the most severe weather?",
        a:
          `In this reporting window the most-affected counties were ${list(topCounties)}. ` +
          `Storm reports are filed at county level, so a county's total reflects both real activity and how often events there were observed and reported.`,
      },
      {
        q: "When is hail season in the Austin area?",
        a:
          `Activity in this window concentrated in spring: ${formatMonth(`${byMonth[0]?.[0] ?? ""}-01`)} alone accounted for ${byMonth[0]?.[1] ?? 0} of the ${observations.length} recorded events. ` +
          `This page covers ${range}, which is too short a span to establish a seasonal norm on its own — treat it as what was recorded, not as a long-run climatology.`,
      },
      {
        q: "Should I get my Austin roof inspected after a hailstorm?",
        a:
          `If your address falls in a county and month listed in the table above and your roof is 15 years or older, an inspection is generally worth requesting even without a visible leak. ` +
          `Hail damage frequently shows as granule loss or bruising that is not visible from the ground, and most Texas policies limit how long after a storm a claim can be filed.`,
      },
    ];
  },

  tableCaption: "Every severe-weather event recorded for the Austin area in this reporting window, newest first.",
  columns: [
    {
      header: "Date",
      cell: (o) =>
        new Date(o.observedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
    },
    { header: "Event type", cell: (o) => o.value.eventType },
    { header: "Reported size / gust", cell: (o) => o.value.magnitude },
    { header: "County", cell: (o) => `${o.value.county} County` },
  ],

  interpretation: ({ observations }) => {
    const hail = observations.filter((o) => o.value.eventType === "Hail");
    const damaging = hail.filter((o) => inchesOf(o.value.magnitude) >= HAIL_DAMAGE_THRESHOLD_IN);
    return {
      data: `NOAA's Storm Events Database recorded ${observations.length} severe-weather events for the Austin area between ${coverageRange(observations)}, including ${hail.length} hail reports.`,
      interpretation: `${damaging.length} of those hail reports reached ${HAIL_DAMAGE_THRESHOLD_IN.toFixed(1)} inch or larger. Repeated hail at or above that size is a common trigger for insurance-eligible roof damage, so homes under the affected counties in those months may have accumulated wear that is not visible from the ground.`,
      meaning: `If your property falls within an affected county and time window, it can be worth requesting a roof inspection and comparing quotes before the next storm season — particularly if the roof is 15 years or older.`,
      limitations: `Storm events are recorded at county level, not by address, so a report does not confirm damage to any specific roof. NOAA publishes storm reports on a lag of several months, so recent weeks are not yet represented. This page reports only what has been recorded in the window shown; it is not a long-run climatology and it does not estimate repair cost.`,
    };
  },

  methodology:
    "Source: NOAA Storm Events Database, filtered to Travis County and its bordering counties (Williamson, Hays, Bastrop, Caldwell, Burnet and Blanco). Records are re-fetched on each ingestion run and merged by NOAA's own event identifier, so corrections republished by NOAA update in place rather than duplicating. Observations are append-only: if a scheduled update fails, the last known-good values are preserved and marked stale with the date they were last confirmed, rather than being shown as zero or blank.",
};
