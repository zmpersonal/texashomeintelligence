/**
 * Drought · U.S. Drought Monitor, one weekly reading per county.
 *
 * Austin and San Antonio share this spec through a factory — the two pages
 * differ only in county and label, which is exactly the case config-driven
 * generation exists for. A third metro is a one-line addition.
 */
import type { Observation } from "../../ingest/types";
import type { DataPageSpec } from "./types";
import { coverageRange, countBy, formatDay, pluralize } from "./types";

interface DroughtValue {
  droughtIndex?: string;
}

/**
 * The ingested reading is a single string, e.g.
 * "D2 — Severe Drought (10% of county)" or "None (no drought)". It encodes the
 * most severe category present in the county that week plus the share of the
 * county's area the Monitor placed at that category or worse. Parsing it here
 * keeps every derived figure traceable to the stored value.
 */
interface ParsedDrought {
  /** 0–4, or null when the county was drought-free that week. */
  level: number | null;
  /** "Severe Drought", or "None" when drought-free. */
  label: string;
  /** Share of county area at that category or worse. */
  percent: number | null;
}

function parseDrought(value: DroughtValue): ParsedDrought {
  const raw = value.droughtIndex ?? "";
  const level = raw.match(/^D(\d)/);
  const label = raw.match(/—\s*([^(]+?)\s*(?:\(|$)/);
  const percent = raw.match(/\((\d+)%/);
  return {
    level: level ? Number(level[1]) : null,
    label: label ? label[1].trim() : "None",
    percent: percent ? Number(percent[1]) : null,
  };
}

const SEVERE_LEVEL = 2; // D2 and worse

interface DroughtPageOptions {
  location: string;
  locationLabel: string;
  countyName: string;
  /** Soil/foundation context specific to the metro, used in the interpretation. */
  soilNote: string;
}

export function makeDroughtSpec(opts: DroughtPageOptions): DataPageSpec<DroughtValue> {
  const { location, locationLabel, countyName, soilNote } = opts;

  /** Weekly readings oldest-first, which several figures below need. */
  const chronological = (observations: Observation<DroughtValue>[]) =>
    [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  const current = (observations: Observation<DroughtValue>[]) => {
    const latest = observations[0]; // observations arrive newest-first
    return latest ? { obs: latest, parsed: parseDrought(latest.value) } : undefined;
  };

  const worst = (observations: Observation<DroughtValue>[]) =>
    observations.reduce<{ obs: Observation<DroughtValue>; parsed: ParsedDrought } | undefined>(
      (max, o) => {
        const parsed = parseDrought(o.value);
        if (parsed.level === null) return max;
        if (!max || max.parsed.level === null || parsed.level > max.parsed.level) {
          return { obs: o, parsed };
        }
        return max;
      },
      undefined,
    );

  return {
    location,
    topic: "drought",
    locationLabel,
    datasetId: "usdm-drought",

    title: `${locationLabel} Drought Conditions — Weekly History | Texas Home Intelligence`,
    description: `Weekly U.S. Drought Monitor readings for ${countyName} County, and what sustained drought means for foundations, trees and irrigation around a ${locationLabel} home.`,
    eyebrow: `${locationLabel.toUpperCase()} · DROUGHT DATA`,
    h1: `${locationLabel} Drought Conditions`,
    lede: `Every weekly U.S. Drought Monitor reading recorded for ${countyName} County in this window — and what a sustained dry stretch means for foundations, trees and watering around a home.`,

    datasetName: `${countyName} County, TX Weekly Drought Severity`,
    datasetDescription: `Weekly U.S. Drought Monitor severity readings for ${countyName} County, Texas, normalized by Texas Home Intelligence and used as foundation, tree and irrigation context.`,
    spatialCoverage: `${countyName} County, Texas`,
    keywords: [
      `${locationLabel} drought`,
      `${countyName} County drought`,
      "Texas drought monitor",
      "foundation watering",
      "drought foundation damage",
    ],
    csvName: "drought-weekly",

    coverage: ({ observations }) =>
      `Measures: the most severe U.S. Drought Monitor category present in the county each week, with the share of county area at that category or worse. ` +
      `Geography: ${countyName} County. ` +
      `Coverage: ${observations.length} weekly readings between ${coverageRange(observations)}. ` +
      `The Monitor publishes a new map every Thursday.`,

    keyFindings: ({ observations }) => {
      const now = current(observations);
      const worstReading = worst(observations);
      const inDrought = observations.filter((o) => parseDrought(o.value).level !== null);
      const severe = observations.filter((o) => (parseDrought(o.value).level ?? -1) >= SEVERE_LEVEL);
      const findings: string[] = [];

      if (now) {
        findings.push(
          now.parsed.level === null
            ? `As of the ${formatDay(now.obs.observedAt)} map, ${countyName} County was not in drought.`
            : `As of the ${formatDay(now.obs.observedAt)} map, ${countyName} County was in ${now.parsed.label} (${now.parsed.label ? `D${now.parsed.level}` : ""}), covering ${now.parsed.percent}% of the county.`,
        );
      }
      findings.push(
        `${inDrought.length} of the ${observations.length} weekly readings in this window recorded some level of drought — ${Math.round((inDrought.length / observations.length) * 100)}% of the period.`,
      );
      if (severe.length > 0) {
        findings.push(
          `${severe.length} ${pluralize(severe.length, "week")} reached severe drought (D2) or worse.`,
        );
      } else {
        findings.push(`No week in this window reached severe drought (D2) or worse.`);
      }
      if (worstReading) {
        findings.push(
          `The most severe reading was ${worstReading.parsed.label} (D${worstReading.parsed.level}) on ${formatDay(worstReading.obs.observedAt)}, covering ${worstReading.parsed.percent}% of the county.`,
        );
      }
      return findings;
    },

    stats: ({ observations }) => {
      const now = current(observations);
      const severe = observations.filter((o) => (parseDrought(o.value).level ?? -1) >= SEVERE_LEVEL);
      const inDrought = observations.filter((o) => parseDrought(o.value).level !== null);
      return [
        {
          label: "Current category",
          value: now ? (now.parsed.level === null ? "No drought" : `D${now.parsed.level}`) : "—",
        },
        { label: "Weeks in drought", value: `${inDrought.length} of ${observations.length}` },
        { label: "Weeks at D2 or worse", value: String(severe.length) },
      ];
    },

    questions: ({ observations }) => {
      const now = current(observations);
      const worstReading = worst(observations);
      const inDrought = observations.filter((o) => parseDrought(o.value).level !== null);
      const severe = observations.filter((o) => (parseDrought(o.value).level ?? -1) >= SEVERE_LEVEL);
      const range = coverageRange(observations);

      // Longest unbroken run of weeks in drought, measured over the series.
      let longestRun = 0;
      let run = 0;
      for (const o of chronological(observations)) {
        if (parseDrought(o.value).level !== null) {
          run += 1;
          longestRun = Math.max(longestRun, run);
        } else {
          run = 0;
        }
      }

      return [
        {
          q: `Is ${locationLabel} in a drought right now?`,
          a: now
            ? now.parsed.level === null
              ? `No. The most recent U.S. Drought Monitor map for ${countyName} County, dated ${formatDay(now.obs.observedAt)}, shows no drought category in the county.`
              : `Yes. The most recent U.S. Drought Monitor map for ${countyName} County, dated ${formatDay(now.obs.observedAt)}, places it in ${now.parsed.label} (D${now.parsed.level}), covering ${now.parsed.percent}% of the county. The Monitor publishes a new map every Thursday, and this page updates from it.`
            : `No reading is currently available for ${countyName} County.`,
        },
        {
          q: `How long has ${locationLabel} been in drought?`,
          a:
            `Across the ${observations.length} weekly readings between ${range}, ${countyName} County recorded some level of drought in ${inDrought.length} of them. ` +
            `The longest unbroken stretch in this window ran ${longestRun} consecutive ${pluralize(longestRun, "week")}. ` +
            `This page covers only that window, not the full historical record.`,
        },
        {
          q: `How bad has the drought been in ${locationLabel}?`,
          a: worstReading
            ? `The most severe reading in this window was ${worstReading.parsed.label} (D${worstReading.parsed.level}) on ${formatDay(worstReading.obs.observedAt)}, covering ${worstReading.parsed.percent}% of ${countyName} County. ` +
              `${severe.length} of ${observations.length} weeks reached severe drought (D2) or worse. The Monitor's scale runs D0 (abnormally dry) through D4 (exceptional drought).`
            : `No week in this window recorded a drought category for ${countyName} County.`,
        },
        {
          q: "Can drought damage a house foundation in Texas?",
          a:
            `It can, and it is the main reason this page exists. ${soilNote} ` +
            `Sustained drought pulls moisture out of that soil, it contracts, and the slab above it can move unevenly — which shows up as sticking doors, cracked drywall at door corners, or gaps at trim. This is general guidance about local soil behavior, not a measurement of any specific property.`,
        },
        {
          q: "Should I water my foundation during a drought?",
          a:
            `Consistent moisture around a slab is generally better than letting soil dry out and then soaking it, because it is the swing between the two that moves a foundation. ` +
            `A soaker hose set back from the slab edge and run on a regular schedule is the common approach in Central Texas. Check current ${locationLabel} watering restrictions first — they change with drought stage and they govern what is actually permitted.`,
        },
      ];
    },

    tableCaption: `Weekly U.S. Drought Monitor readings for ${countyName} County, newest first.`,
    columns: [
      { header: "Week of", cell: (o) => formatDay(o.observedAt) },
      {
        header: "Category",
        cell: (o) => {
          const p = parseDrought(o.value);
          return p.level === null ? "No drought" : `D${p.level} — ${p.label}`;
        },
      },
      {
        header: "Share of county at that level or worse",
        cell: (o) => {
          const p = parseDrought(o.value);
          return p.percent === null ? "—" : `${p.percent}%`;
        },
      },
    ],

    interpretation: ({ observations }) => {
      const now = current(observations);
      const inDrought = observations.filter((o) => parseDrought(o.value).level !== null);
      const severe = observations.filter((o) => (parseDrought(o.value).level ?? -1) >= SEVERE_LEVEL);
      const byCategory = countBy(observations, (o) => {
        const p = parseDrought(o.value);
        return p.level === null ? "No drought" : `D${p.level}`;
      });
      return {
        data: `The U.S. Drought Monitor recorded ${observations.length} weekly readings for ${countyName} County between ${coverageRange(observations)}. ${inDrought.length} recorded some level of drought and ${severe.length} reached D2 or worse. By category: ${byCategory.map(([c, n]) => `${c} in ${n} ${pluralize(n, "week")}`).join(", ")}.`,
        interpretation: now && now.parsed.level !== null
          ? `The county is currently in ${now.parsed.label}. Sustained dry conditions matter more to a home than any single dry week, because it is prolonged moisture loss that shrinks clay soils and stresses mature trees.`
          : `The county is not currently in drought. The value of this record is the pattern over time rather than the present week, since it is prolonged moisture loss that shrinks clay soils and stresses mature trees.`,
        meaning: `Long dry stretches are the cue to keep moisture consistent around a slab rather than alternating between bone-dry and saturated, and to watch mature trees for stress — drought-weakened limbs are a common cause of storm damage later. Watering restrictions tighten as drought stage rises, so check what is currently permitted before setting a schedule.`,
        limitations: `The Drought Monitor is a weekly county-level assessment produced by expert analysis of several indicators, not a direct soil-moisture measurement at any address. A single category for a whole county hides local variation. This page reports the most severe category present in the county each week, so a low percentage at a high category still appears as that category. It does not predict foundation movement, and it is not a substitute for an engineer's assessment of a specific home.`,
      };
    },

    methodology: `Source: U.S. Drought Monitor county statistics (area-percent service) for ${countyName} County, Texas (FIPS-keyed), fetched on each ingestion run. Each weekly map is stored as one observation keyed by county and map date, so republished maps update in place rather than duplicating. The stored reading is the most severe category with a non-zero area share that week, together with that share. Observations are append-only: if a scheduled update fails, the last known-good values are preserved and marked stale with the date they were last confirmed, rather than being shown as zero or blank.`,
  };
}

export const austinDrought = makeDroughtSpec({
  location: "austin",
  locationLabel: "Austin",
  countyName: "Travis",
  soilNote:
    "Much of the Austin area sits on expansive clay soils that swell when wet and shrink when dry.",
});

export const sanAntonioDrought = makeDroughtSpec({
  location: "san-antonio",
  locationLabel: "San Antonio",
  countyName: "Bexar",
  soilNote:
    "Much of the San Antonio area sits on expansive clay soils that swell when wet and shrink when dry.",
});
