/**
 * San Antonio · severe weather — NOAA Storm Events.
 *
 * Deliberately not a copy of the Austin roofing page's framing: the Bexar-area
 * record is flood-dominant where Austin's is wind- and hail-dominant, so this
 * page leads with what the data actually shows rather than reusing a roofing
 * angle the records don't support.
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
  pluralize,
} from "./types";

const HAIL_DAMAGE_THRESHOLD_IN = 1.0;

export const sanAntonioStorms: DataPageSpec<StormEventValue> = {
  location: "san-antonio",
  topic: "storms",
  locationLabel: "San Antonio",
  datasetId: "noaa-storm-events",

  title: "San Antonio Storm, Flood & Hail Event Data | Texas Home Intelligence",
  description:
    "Every severe-weather event NOAA has recorded for the eight-county San Antonio area — flooding, wind, hail and tornadoes — with what each may mean for a home.",
  eyebrow: "SAN ANTONIO · STORM DATA",
  h1: "San Antonio Storm & Flood Events",
  lede: "Recorded flooding, wind, hail and tornado events for the San Antonio area, and what the pattern may mean for drainage, roof and exterior decisions.",

  datasetName: "San Antonio, TX Area Severe Weather Events",
  datasetDescription:
    "Severe-weather events recorded by NOAA's Storm Events Database for Bexar County and its bordering counties, normalized by Texas Home Intelligence.",
  spatialCoverage: "San Antonio, Texas metropolitan area",
  keywords: [
    "San Antonio flooding",
    "Bexar County storms",
    "San Antonio hail",
    "Texas flash flood",
    "San Antonio severe weather",
  ],
  csvName: "storm-events",

  coverage: ({ observations }) => {
    const counties = countBy(observations, (o) => o.value.county).length;
    return (
      `Measures: individual severe-weather reports (flood, wind, hail, tornado) filed with NOAA. ` +
      `Geography: Bexar County and its bordering counties — ${counties} counties with reports in this window. ` +
      `Coverage: events recorded between ${coverageRange(observations)}. ` +
      `Checked on each ingestion run; NOAA publishes storm reports on a lag of several months.`
    );
  },

  keyFindings: ({ observations }) => {
    const byType = countBy(observations, (o) => o.value.eventType);
    const byCounty = countBy(observations, (o) => o.value.county);
    const flood = observations.filter((o) => o.value.eventType === "Flood");
    const hail = observations.filter((o) => o.value.eventType === "Hail");
    const damaging = hail.filter((o) => inchesOf(o.value.magnitude) >= HAIL_DAMAGE_THRESHOLD_IN);
    const largest = hail.reduce<Observation<StormEventValue> | undefined>(
      (max, o) => (!max || inchesOf(o.value.magnitude) > inchesOf(max.value.magnitude) ? o : max),
      undefined,
    );
    const findings = [
      `NOAA recorded ${observations.length} severe-weather events across the San Antonio area between ${coverageRange(observations)}.`,
      `By type: ${list(byType.map(([type, n]) => `${n} ${type.toLowerCase()}`))}.`,
    ];
    if (flood.length > 0) {
      findings.push(
        `Flooding accounted for ${flood.length} of the ${observations.length} events — ${Math.round((flood.length / observations.length) * 100)}% of everything recorded in the window.`,
      );
    }
    if (byCounty[0]) {
      findings.push(
        `${byCounty[0][0]} County recorded the most events (${byCounty[0][1]}), followed by ${list(byCounty.slice(1, 3).map(([c, n]) => `${c} (${n})`))}.`,
      );
    }
    if (hail.length > 0 && largest) {
      findings.push(
        `${damaging.length} of the ${hail.length} hail ${pluralize(hail.length, "report")} measured ${HAIL_DAMAGE_THRESHOLD_IN.toFixed(1)} inch or larger; the largest was ${largest.value.magnitude} in ${largest.value.county} County, ${formatMonth(largest.observedAt)}.`,
      );
    }
    return findings;
  },

  stats: ({ observations }) => {
    const flood = observations.filter((o) => o.value.eventType === "Flood");
    const hail = observations.filter((o) => o.value.eventType === "Hail");
    const largestIn = hail.reduce((max, o) => Math.max(max, inchesOf(o.value.magnitude)), 0);
    return [
      { label: "Recorded events in this window", value: String(observations.length) },
      { label: "Flood events", value: `${flood.length} of ${observations.length}` },
      {
        label: "Largest reported hail",
        value: largestIn > 0 ? `${largestIn.toFixed(2)}″` : "No hail reported",
      },
    ];
  },

  questions: ({ observations }) => {
    const byType = countBy(observations, (o) => o.value.eventType);
    const byCounty = countBy(observations, (o) => o.value.county);
    const flood = observations.filter((o) => o.value.eventType === "Flood");
    const hail = observations.filter((o) => o.value.eventType === "Hail");
    const tornado = observations.filter((o) => o.value.eventType === "Tornado");
    const damaging = hail.filter((o) => inchesOf(o.value.magnitude) >= HAIL_DAMAGE_THRESHOLD_IN);
    const range = coverageRange(observations);
    const byMonth = countBy(observations, (o) => o.observedAt.slice(0, 7));

    return [
      {
        q: "How often does San Antonio flood?",
        a:
          `NOAA recorded ${flood.length} flood events across the eight-county San Antonio area between ${range} — ${Math.round((flood.length / observations.length) * 100)}% of all severe-weather events logged in that window. ` +
          `Each one appears in the table on this page with its date and county. Flash flooding is the most frequently recorded severe-weather event in this area, more common than hail or tornadoes.`,
      },
      {
        q: "What kind of severe weather does San Antonio get?",
        a:
          `In this reporting window the record breaks down as ${list(byType.map(([type, n]) => `${n} ${type.toLowerCase()} ${pluralize(n, "event")}`))}. ` +
          `That mix matters for a homeowner: flooding and wind drive different maintenance priorities — drainage, grading and tree work — than a hail-dominated record would.`,
      },
      {
        q: "Which San Antonio counties get the most severe weather?",
        a:
          `${byCounty[0]?.[0]} County recorded the most events (${byCounty[0]?.[1]}) in this window, followed by ${list(byCounty.slice(1, 3).map(([c, n]) => `${c} County (${n})`))}. ` +
          `Storm reports are filed at county level, so a county's total reflects both real activity and how often events there were observed and reported.`,
      },
      {
        q: "Has San Antonio had hail large enough to damage a roof?",
        a:
          hail.length === 0
            ? `No hail was recorded for the San Antonio area between ${range}.`
            : `Yes — ${damaging.length} of the ${hail.length} hail ${pluralize(hail.length, "report")} in this window measured ${HAIL_DAMAGE_THRESHOLD_IN.toFixed(1)} inch or larger, the size at which asphalt shingles typically begin to bruise. ` +
              `That threshold is an industry rule of thumb applied to the NOAA figures, not a measurement, and a county-level report does not confirm damage to any specific roof.`,
      },
      {
        q: "Does San Antonio get tornadoes?",
        a:
          tornado.length === 0
            ? `No tornadoes were recorded for the San Antonio area between ${range}.`
            : `NOAA recorded ${tornado.length} ${pluralize(tornado.length, "tornado", "tornadoes")} in the San Antonio area between ${range}, against ${observations.length} severe-weather events overall. ` +
              `Tornadoes are the least frequently recorded event type in this window; ${byMonth[0]?.[1] ?? 0} of the ${observations.length} total events fell in ${formatMonth(`${byMonth[0]?.[0] ?? ""}-01`)} alone.`,
      },
    ];
  },

  tableCaption:
    "Every severe-weather event recorded for the San Antonio area in this reporting window, newest first.",
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
    const flood = observations.filter((o) => o.value.eventType === "Flood");
    const wind = observations.filter((o) => o.value.eventType === "Wind");
    return {
      data: `NOAA's Storm Events Database recorded ${observations.length} severe-weather events for the San Antonio area between ${coverageRange(observations)}, including ${flood.length} flood and ${wind.length} wind events.`,
      interpretation: `Flooding is the most frequently recorded event type here, which is the clearest difference between the San Antonio and Austin records. A flood-dominated pattern points at water management around a property — grading, gutters, downspout extensions, drainage paths — more than at roof-covering wear.`,
      meaning: `If your property sits in one of the counties listed above, the maintenance items most supported by this record are drainage and tree work before the spring storm period, plus knowing whether your address falls inside a FEMA flood zone — standard homeowners policies do not cover flood damage.`,
      limitations: `Storm events are recorded at county level, not by address, so a report does not confirm any effect on a specific property. NOAA publishes storm reports on a lag of several months, so recent weeks are not represented. Flood reports depend on someone observing and reporting the flooding, so lightly-populated areas are systematically under-counted. This page reports only what has been recorded in the window shown; it is not a long-run climatology and it does not estimate risk for an individual address.`,
    };
  },

  methodology:
    "Source: NOAA Storm Events Database, filtered to Bexar County and its bordering counties (Bandera, Medina, Atascosa, Wilson, Guadalupe, Comal and Kendall). Records are re-fetched on each ingestion run and merged by NOAA's own event identifier, so corrections republished by NOAA update in place rather than duplicating. Observations are append-only: if a scheduled update fails, the last known-good values are preserved and marked stale with the date they were last confirmed, rather than being shown as zero or blank.",
};
