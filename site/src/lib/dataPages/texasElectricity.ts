/**
 * Texas · residential electricity prices — EIA monthly retail series.
 *
 * The first statewide page, and the first whose "location" is not one of the
 * two metros. The data-hub route derives its locations from this registry
 * rather than the marketing locations collection, so `texas` needs no entry
 * there (and gets no service pages).
 */
import type { DataPageSpec } from "./types";
import { coverageRange, formatDay } from "./types";

interface ElectricityValue {
  pricePerKwhCents: number;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

const cents = (n: number) => `${n.toFixed(2)}¢`;

/** A typical Texas household's monthly bill at a given rate, for scale. The
 * 1,000 kWh basis is the convention Texas retail plans are advertised on. */
const REFERENCE_KWH = 1000;
const dollarsAt = (centsPerKwh: number) =>
  `$${((centsPerKwh * REFERENCE_KWH) / 100).toFixed(0)}`;

export const texasElectricity: DataPageSpec<ElectricityValue> = {
  location: "texas",
  topic: "electricity-prices",
  locationLabel: "Texas",
  datasetId: "eia-electricity",

  title: "Texas Residential Electricity Prices by Month | Texas Home Intelligence",
  description:
    "The average price Texas households paid per kilowatt-hour each month, from the U.S. Energy Information Administration, with what the trend means for a typical monthly bill.",
  eyebrow: "TEXAS · ENERGY DATA",
  h1: "Texas Residential Electricity Prices",
  lede: "What Texas households actually paid per kilowatt-hour, month by month, straight from the EIA's retail sales series — and what the swing means on a typical bill.",

  datasetName: "Texas Average Residential Electricity Price (Monthly)",
  datasetDescription:
    "Average monthly residential retail electricity price for Texas in cents per kilowatt-hour, from the U.S. Energy Information Administration's retail sales series, normalized by Texas Home Intelligence.",
  spatialCoverage: "Texas",
  keywords: [
    "Texas electricity prices",
    "average electricity rate Texas",
    "cents per kWh Texas",
    "Texas electric bill",
    "residential electricity Texas",
  ],
  csvName: "electricity-prices",

  coverage: ({ observations }) =>
    `Measures: the average price Texas residential customers paid per kilowatt-hour, as reported by the EIA. ` +
    `Geography: statewide Texas, residential sector only. ` +
    `Coverage: ${observations.length} monthly readings between ${coverageRange(observations)}. ` +
    `The EIA publishes this series monthly and revises recent months as utilities report.`,

  keyFindings: ({ observations }) => {
    const chronological = [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const latest = chronological.at(-1);
    const earliest = chronological[0];
    const prices = chronological.map((o) => o.value.pricePerKwhCents);
    const high = chronological.reduce((m, o) => (o.value.pricePerKwhCents > m.value.pricePerKwhCents ? o : m));
    const low = chronological.reduce((m, o) => (o.value.pricePerKwhCents < m.value.pricePerKwhCents ? o : m));
    const avg = prices.reduce((s, n) => s + n, 0) / prices.length;
    const findings: string[] = [];
    if (latest) {
      findings.push(
        `Texas households paid an average of ${cents(latest.value.pricePerKwhCents)} per kilowatt-hour in ${monthLabel(latest.observedAt)} — about ${dollarsAt(latest.value.pricePerKwhCents)} a month on a ${REFERENCE_KWH.toLocaleString("en-US")} kWh bill.`,
      );
    }
    findings.push(
      `Across the ${observations.length} months between ${coverageRange(observations)}, the average was ${cents(avg)}, ranging from ${cents(low.value.pricePerKwhCents)} in ${monthLabel(low.observedAt)} to ${cents(high.value.pricePerKwhCents)} in ${monthLabel(high.observedAt)}.`,
    );
    if (latest && earliest) {
      const change = latest.value.pricePerKwhCents - earliest.value.pricePerKwhCents;
      const pct = (change / earliest.value.pricePerKwhCents) * 100;
      findings.push(
        change === 0
          ? `The price finished the window exactly where it started, at ${cents(latest.value.pricePerKwhCents)}.`
          : `Over the window the price ${change < 0 ? "fell" : "rose"} ${cents(Math.abs(change))} — ${Math.abs(pct).toFixed(1)}% ${change < 0 ? "lower" : "higher"} than ${monthLabel(earliest.observedAt)}.`,
      );
    }
    findings.push(
      `The gap between the cheapest and most expensive month works out to about ${dollarsAt(high.value.pricePerKwhCents - low.value.pricePerKwhCents)} a month on a ${REFERENCE_KWH.toLocaleString("en-US")} kWh bill.`,
    );
    return findings;
  },

  stats: ({ observations }) => {
    const chronological = [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const latest = chronological.at(-1);
    const prices = chronological.map((o) => o.value.pricePerKwhCents);
    const avg = prices.reduce((s, n) => s + n, 0) / prices.length;
    return [
      {
        label: `Latest (${latest ? monthLabel(latest.observedAt) : "—"})`,
        value: latest ? cents(latest.value.pricePerKwhCents) : "—",
      },
      { label: "Average across the window", value: cents(avg) },
      {
        label: `Typical ${REFERENCE_KWH.toLocaleString("en-US")} kWh bill at the latest rate`,
        value: latest ? dollarsAt(latest.value.pricePerKwhCents) : "—",
      },
    ];
  },

  questions: ({ observations }) => {
    const chronological = [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const latest = chronological.at(-1);
    const earliest = chronological[0];
    const prices = chronological.map((o) => o.value.pricePerKwhCents);
    const avg = prices.reduce((s, n) => s + n, 0) / prices.length;
    const high = chronological.reduce((m, o) => (o.value.pricePerKwhCents > m.value.pricePerKwhCents ? o : m));
    const low = chronological.reduce((m, o) => (o.value.pricePerKwhCents < m.value.pricePerKwhCents ? o : m));
    const range = coverageRange(observations);

    return [
      {
        q: "How much does electricity cost in Texas per kWh?",
        a: latest
          ? `Texas residential customers paid an average of ${cents(latest.value.pricePerKwhCents)} per kilowatt-hour in ${monthLabel(latest.observedAt)}, the most recent month the EIA has published. ` +
            `On a ${REFERENCE_KWH.toLocaleString("en-US")} kWh bill — the basis Texas retail plans are usually advertised on — that works out to roughly ${dollarsAt(latest.value.pricePerKwhCents)} a month before fixed charges and taxes.`
          : `No reading is currently available.`,
      },
      {
        q: "What is the average electric bill in Texas?",
        a:
          `At the ${cents(avg)} per kWh average between ${range}, a ${REFERENCE_KWH.toLocaleString("en-US")} kWh month comes to about ${dollarsAt(avg)}. ` +
          `Actual bills vary widely with house size, insulation and summer air-conditioning load; ${REFERENCE_KWH.toLocaleString("en-US")} kWh is a convention for comparing plans, not a typical Texas summer.`,
      },
      {
        q: "Are Texas electricity prices going up or down?",
        a: latest && earliest
          ? `Between ${monthLabel(earliest.observedAt)} and ${monthLabel(latest.observedAt)} the statewide residential average went from ${cents(earliest.value.pricePerKwhCents)} to ${cents(latest.value.pricePerKwhCents)}, ` +
            `${latest.value.pricePerKwhCents < earliest.value.pricePerKwhCents ? "a fall" : "a rise"} of ${Math.abs(((latest.value.pricePerKwhCents - earliest.value.pricePerKwhCents) / earliest.value.pricePerKwhCents) * 100).toFixed(1)}%. ` +
            `The month-by-month table above shows the path. The EIA revises recent months as utilities report, so the newest one or two figures can move.`
          : `Not enough readings are available to describe a direction.`,
      },
      {
        q: "When is electricity most expensive in Texas?",
        a:
          `In this window the highest monthly average was ${cents(high.value.pricePerKwhCents)} in ${monthLabel(high.observedAt)} and the lowest was ${cents(low.value.pricePerKwhCents)} in ${monthLabel(low.observedAt)}. ` +
          `Note that this series is the average price per unit, not what households spend: summer bills are usually highest because air conditioning drives up usage, even in months when the per-kWh price is not at its peak.`,
      },
      {
        q: "Does this include my delivery charges?",
        a:
          `Yes, in aggregate. The EIA series is total residential revenue divided by total residential sales, so it reflects what customers actually paid — energy plus delivery — averaged across the state. ` +
          `It is not the advertised energy rate on any one retail plan, and it will not match your bill exactly.`,
      },
    ];
  },

  aggregate: {
    caption: "Average residential price by month",
    headers: ["Month", "Price per kWh", `Typical ${REFERENCE_KWH.toLocaleString("en-US")} kWh bill`],
    rows: ({ observations }) =>
      [...observations]
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .map((o) => [
          monthLabel(o.observedAt),
          cents(o.value.pricePerKwhCents),
          dollarsAt(o.value.pricePerKwhCents),
        ]),
  },

  tableCaption: "Every monthly reading in this window, newest first.",
  columns: [
    { header: "Month", cell: (o) => monthLabel(o.observedAt) },
    { header: "Price per kWh", cell: (o) => cents(o.value.pricePerKwhCents) },
    { header: "Reading recorded", cell: (o) => formatDay(o.ingestedAt) },
  ],

  interpretation: ({ observations }) => {
    const chronological = [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const latest = chronological.at(-1);
    const prices = chronological.map((o) => o.value.pricePerKwhCents);
    const avg = prices.reduce((s, n) => s + n, 0) / prices.length;
    const high = chronological.reduce((m, o) => (o.value.pricePerKwhCents > m.value.pricePerKwhCents ? o : m));
    const low = chronological.reduce((m, o) => (o.value.pricePerKwhCents < m.value.pricePerKwhCents ? o : m));
    return {
      data: `The EIA reported ${observations.length} monthly residential price readings for Texas between ${coverageRange(observations)}, averaging ${cents(avg)} per kilowatt-hour and ranging from ${cents(low.value.pricePerKwhCents)} to ${cents(high.value.pricePerKwhCents)}.`,
      interpretation: `The spread across this window is about ${dollarsAt(high.value.pricePerKwhCents - low.value.pricePerKwhCents)} a month on a ${REFERENCE_KWH.toLocaleString("en-US")} kWh bill. That is the scale against which any efficiency decision should be judged: a change in the statewide rate moves a bill by roughly that much, while usage changes — insulation, HVAC condition, thermostat setting — typically move it further.`,
      meaning: `${latest ? `At ${cents(latest.value.pricePerKwhCents)}, ` : ""}the practical use of this page is as a benchmark. If your effective rate — your total bill divided by kilowatt-hours used — sits well above the statewide average here, that is a reason to re-shop your retail plan. If it sits near the average and the bill is still high, the problem is usage, not price, and that points at the envelope and the HVAC system rather than the contract.`,
      limitations: `This is a statewide residential average, not a rate you can sign up for, and not specific to any utility, retail provider or city. It is computed by the EIA as revenue divided by sales, so it blends every plan type together and includes delivery charges. Recent months are revised as utilities report, so the newest readings can change. Municipal and co-op territories price differently from the deregulated market that covers most of the state.`,
    };
  },

  methodology:
    "Source: U.S. Energy Information Administration API v2, electricity retail-sales route, filtered to Texas (stateid TX) and the residential sector (sectorid RES) at monthly frequency. Each month is stored as one observation keyed by its period, so the EIA's revisions to recent months update in place rather than duplicating. Bill figures are computed at build time at a 1,000 kWh reference month, the basis Texas retail plans are advertised on, and are illustrative rather than a quote. Observations are append-only: if a scheduled update fails, the last known-good values are preserved and marked stale with the date they were last confirmed, rather than being shown as zero or blank.",
};
