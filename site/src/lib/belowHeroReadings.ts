/**
 * The single live reading each #context block renders.
 *
 * Kept out of `data/belowHero.ts` on purpose: that file holds prose, this one
 * holds the arithmetic, and no number in the content config is ever a literal.
 * Each reader states the ONE fact its feed supports and nothing beyond it.
 */
import { findDataset, freshnessOf, type Freshness } from "./datasets";
// Round 10b: a module-scope `new Date()` reads 1970 under the Workers runtime
// that Astro builds against. Anything that needs the real build date uses this.
import { buildNow } from "../data/serviceNotices";

export interface ContextReading {
  label: string;
  value: string;
  freshness: Freshness;
  sourceName: string;
  sourceUrl: string;
  /** Where the full data page lives, when one is published for this feed. */
  href?: string;
  /** Link text. Named here rather than derived from the topic slug, which
   * produces "Full electricity-rate data" — a slug leaking into copy. */
  linkLabel?: string;
  /** A qualification the number cannot carry on its own. Rendered beneath it. */
  note?: string;
  /** Age of the newest record, in days, for a source that publishes on a lag.
   * MEASURED from the data, never asserted from documentation. */
  lagDays?: number;
}

/**
 * Round 15. `cityName` is a PARAMETER now, not a literal inside the readers.
 * Three of them wrote "San Antonio" into label or note text, which was
 * harmless while San Antonio was the only metro with a below-hero layer and
 * would have put the wrong city on an Austin page the moment one existed.
 * The caller already holds the display name; it passes it in rather than a
 * second copy of the slug-to-name map living here to drift.
 */
type Reader = (location: string, cityName: string) => ContextReading | undefined;

/** The `noaa-climate` observation shape this file reads. */
interface CoolingDegreeDayRow {
  kind: "normal-1991-2020" | "monthly-actual";
  coolingDegreeDaysF: number;
  baseF: number;
  month: number;
  sourceRef: string;
  stationName: string;
  distanceMiles: number;
  yearsOfRecord?: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07" -> "July 2026". Built from the key, so it cannot drift from it. */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${y}` : key;
}

function latest<T>(datasetId: string, location: string) {
  const dataset = findDataset<T>(datasetId, location);
  if (!dataset || dataset.status === "sample") return undefined;
  const obs = dataset.observations
    .filter((o) => !o.seed)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  if (obs.length === 0) return undefined;
  return { dataset, newest: obs[0] };
}

const READERS: Record<string, Reader> = {
  "air-quality": (location, cityName) => {
    const hit = latest<{ aqi: number; category: string }>("airnow", location);
    if (!hit) return undefined;
    return {
      label: `Air quality index, ${cityName} reporting area`,
      value: `${hit.newest.value.aqi} — ${hit.newest.value.category}`,
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
    };
  },
  /**
   * Round 10b. The EIA residential rate, restored.
   *
   * Round 10 withheld it under a blanket "no price figure" reading. That was
   * over-cautious and the owner has said so: the no-price rule exists because
   * permit valuation cannot support a cost figure (docs/audits/round-6-...),
   * which is a rule about FABRICATED cost ranges. This is a published,
   * observed, federally-collected rate — the same class of fact as an air
   * quality index, and it was this page's reading before Round 10 removed it.
   *
   * The rate and nothing else. No monthly-bill estimate, no payback period, no
   * "what you'd save" counterfactual — each of those needs a consumption
   * figure for THIS home, which we do not have and would have to invent.
   * `/data/texas/electricity-prices/` does compute a 1,000 kWh reference bill;
   * that is that page's convention, stated there, and it is not carried here.
   *
   * Note the location: this series is STATEWIDE. It is read from `texas.json`
   * regardless of which metro's page is rendering, and the label says so —
   * presenting a Texas average as a San Antonio rate would be the kind of
   * quiet overstatement the labelling rules exist to prevent.
   */
  "electricity-rate": () => {
    const hit = latest<{ pricePerKwhCents: number }>("eia-electricity", "texas");
    if (!hit) return undefined;
    return {
      label: "Average residential electricity price, Texas",
      value: `${hit.newest.value.pricePerKwhCents.toFixed(2)}¢ per kWh`,
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
      href: "/data/texas/electricity-prices/",
      linkLabel: "Full Texas electricity price series, sources and limitations",
    };
  },
  /**
   * Round 20. How much cooling a typical year demands in this metro.
   *
   * ── WHAT THIS IS, AND THE THREE THINGS IT IS NOT.
   *
   * It is a CLIMATE reading: the 1991-2020 monthly normals summed to an annual
   * cooling-degree-day total, base 65F, from one named station.
   *
   * It is NOT a statement about equipment. Nothing here says how long a system
   * lasts, when to replace one, or when to service it. A degree-day total is a
   * property of the sky over a metro, not of the machine in a house, and the
   * step from one to the other needs the equipment's age, size, efficiency and
   * duty cycle — none of which this site holds. That reading belongs to AC
   * Lifespan (HANDOFF), and this deliberately stops short of it.
   *
   * It is NOT a ratio. A "runs N times the national average" figure needs
   * Climate at a Glance's contiguous-U.S. series, which is reachable and
   * period-aligned but is NOT in `src/data/generated/**`. Putting it here would
   * mean either a new feed or a hard-coded national constant — and a literal
   * number in a lib file is the exact thing `blsWages.ts`'s CBSA warning
   * exists about. If a ratio is ever published it carries the HANDOFF label:
   * THI analysis, both sources cited, point-versus-area caveat in the reading.
   *
   * It is NOT this year's weather. The value is a 30-year normal.
   *
   * ── THE DUAL DATE, WHICH IS THE THING A READER WILL MISREAD.
   *
   * The badge's "data through" comes from the newest observation in the file,
   * and that is a monthly ACTUAL — currently 2026 — while the number shown is
   * a normal whose period ended in 2020. Left unexplained, a reader sees a
   * current date beside the figure and takes the figure for a current
   * measurement. The note says which is which, in the reading itself rather
   * than a footnote.
   */
  "cooling-load": (location, cityName) => {
    const hit = latest<CoolingDegreeDayRow>("noaa-climate", location);
    if (!hit) return undefined;
    const rows = hit.dataset.observations.filter((o) => !o.seed);
    const normals = rows.filter((o) => o.value.kind === "normal-1991-2020");
    // Twelve or nothing. A partial year silently understates the total, and an
    // understated annual figure is indistinguishable from a milder metro.
    if (normals.length !== 12) return undefined;

    const annual = normals.reduce((sum, o) => sum + o.value.coolingDegreeDaysF, 0);
    const first = normals[0].value;
    const years = normals
      .map((o) => o.value.yearsOfRecord)
      .filter((y): y is number => typeof y === "number");
    const minYears = years.length ? Math.min(...years) : undefined;
    const maxYears = years.length ? Math.max(...years) : undefined;
    const yearsPhrase =
      minYears === undefined
        ? ""
        : minYears === maxYears
          ? ` on ${minYears} years of record`
          : ` on ${minYears}-${maxYears} years of record`;

    // The newest ACTUAL is what makes the badge current. Naming the month it
    // covers is what stops the badge's date being read as the figure's date.
    const actuals = rows.filter((o) => o.value.kind === "monthly-actual");
    const newestActual = actuals
      .map((o) => o.key.replace(/^actual-/, ""))
      .sort()
      .at(-1);

    return {
      label: `Cooling demand in a typical year, ${cityName}`,
      value: `${annual.toLocaleString("en-US", { maximumFractionDigits: 1 })} cooling degree days, base ${first.baseF}\u00B0F`,
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
      note:
        `This is NOAA's 1991-2020 normal for ${first.stationName} (${first.sourceRef}), ` +
        `${first.distanceMiles} miles from our reference point for ${cityName}, built` +
        `${yearsPhrase}. It describes a typical year, not this one — the 30-year period it ` +
        `covers ended in 2020.` +
        (newestActual
          ? ` The date on the badge above is newer than that because the same station also ` +
            `reports month by month, and its newest complete month is ${monthLabel(newestActual)}; ` +
            `that is what keeps this feed current, and it is not the figure shown here.`
          : ""),
    };
  },
  /**
   * Round 12. Storm exposure for the home county, from NOAA/NCEI.
   *
   * TWO THINGS THIS READER REFUSES TO DO, both learned from the data itself.
   *
   * It does not present the feed as current. NCEI publishes Storm Events as
   * monthly bulk files running two to four months behind real time — measured
   * here, not assumed: the reader computes the actual lag from the newest
   * record and states it. `dataFreshness.ts` already allows 150 days for this
   * source, so the badge stays honest without anyone pretending the number
   * describes last week.
   *
   * And it does not report hail that is not in the home county. The San Antonio
   * file spans eight counties; all eleven hail events in the current window are
   * in the surrounding ones and BEXAR HAS NONE. A "hail exposure" reading built
   * on the file total would have implied hail in Bexar that NOAA did not
   * record. So the reader counts the home county only, and when the count is
   * zero it says zero — which is a real finding about the window, not a gap.
   */
  "storm-exposure": (location, cityName) => {
    const dataset = findDataset<{ eventType?: string; county?: string; magnitude?: string }>(
      "noaa-storm-events",
      location,
    );
    if (!dataset || dataset.status === "sample") return undefined;
    const county = location === "san-antonio" ? "Bexar" : "Travis";
    const rows = dataset.observations
      .filter((o) => !o.seed && o.value.county === county)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    if (rows.length === 0) return undefined;

    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.value.eventType ?? "Other", (counts.get(r.value.eventType ?? "Other") ?? 0) + 1);
    const hail = counts.get("Hail") ?? 0;
    const parts = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => `${n} ${type.toLowerCase()}`);

    return {
      label: `NOAA storm events recorded in ${county} County`,
      value: `${rows.length} — ${parts.join(", ")}`,
      note:
        hail === 0
          ? `No hail was recorded in ${county} County in this window. NOAA did record hail elsewhere in ` +
            `the ${cityName} area during the same period, in surrounding counties — which is a reason to ` +
            `check a roof, not evidence that one was hit.`
          : `${hail} hail event${hail === 1 ? "" : "s"} recorded in ${county} County in this window.`,
      freshness: freshnessOf(dataset),
      sourceName: dataset.source.name,
      sourceUrl: dataset.source.url,
      href: `/data/${location}/storms/`,
      linkLabel: "Full storm and flood event data, sources and limitations",
      lagDays: Math.round((buildNow().getTime() - new Date(rows[0].observedAt).getTime()) / 86_400_000),
    };
  },
  /**
   * Round 15. Austin Water's published drought-response stage.
   *
   * This is on the Austin plumbing page and NOT on San Antonio's for a reason
   * that is about the data, not about the round's scope: `austin-water-stage`
   * is a scrape of one city's drought-response page and there is no San
   * Antonio equivalent in the repo. It earns its place because it is the one
   * reading in this layer that states a RULE currently in force rather than a
   * measurement — the stage sets what a household may do with water this
   * month, which is a different kind of fact from a drought category and a
   * more actionable one.
   *
   * It states the stage and stops. It does not enumerate the restrictions:
   * those are the city's to publish and they change with the stage, so the
   * page links out rather than mirroring a rules list that could go stale
   * between builds. HANDOFF Seam 6 records that the scraper fails closed —
   * the feed goes stale rather than guessing a stage — so a badge that says
   * current is one that was actually re-read.
   */
  "water-stage": (location) => {
    const hit = latest<{ stage: string; sourceUrl?: string }>("austin-water-stage", location);
    if (!hit) return undefined;
    return {
      label: "Austin Water drought response stage",
      value: hit.newest.value.stage,
      note:
        "The stage sets what the city currently allows — watering days and hours above all. " +
        "We publish the stage and link to Austin Water for the restrictions themselves, which " +
        "change with it.",
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.newest.value.sourceUrl ?? hit.dataset.source.url,
    };
  },
  /**
   * Round 15. The NWS point forecast for the metro.
   *
   * Austin-only, again for a data reason: `nws-api` has an Austin file and no
   * San Antonio one, which the San Antonio HVAC page already says out loud in
   * its omissions list. It is included here because a forecast high is the one
   * reading on an HVAC page that describes THIS WEEK — every other figure on
   * the page describes a twelve-month window — and a 90-plus-degree day is
   * when a marginal system announces itself.
   *
   * One reading, one point, no derivation. No degree-days, no runtime
   * estimate, no "your system will struggle": each of those needs the house,
   * and we do not have the house.
   */
  "forecast-conditions": (location, cityName) => {
    const hit = latest<{ forecastHighF?: number; forecastLowF?: number }>("nws-api", location);
    if (!hit) return undefined;
    const { forecastHighF, forecastLowF } = hit.newest.value;
    if (typeof forecastHighF !== "number") return undefined;
    return {
      label: `Forecast high, ${cityName}`,
      value:
        typeof forecastLowF === "number"
          ? `${forecastHighF}°F high / ${forecastLowF}°F low`
          : `${forecastHighF}°F`,
      note:
        "A single National Weather Service point forecast for the metro, not a reading at any " +
        "address and not a seasonal figure. It says what today asks of a cooling system; it says " +
        "nothing about what any particular system can deliver.",
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
    };
  },
  drought: (location) => {
    const hit = latest<{ droughtIndex: string; county: string }>("usdm-drought", location);
    if (!hit) return undefined;
    return {
      label: `Drought category, ${hit.newest.value.county} County`,
      value: hit.newest.value.droughtIndex,
      freshness: freshnessOf(hit.dataset),
      sourceName: hit.dataset.source.name,
      sourceUrl: hit.dataset.source.url,
      href: `/data/${location}/drought/`,
      linkLabel: "Full drought data, sources and limitations",
    };
  },
};

export function contextReading(
  topic: string,
  location: string,
  cityName: string,
): ContextReading | undefined {
  return READERS[topic]?.(location, cityName);
}
