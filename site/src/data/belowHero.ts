/**
 * Below-hero content layer, per location × service.
 *
 * ── WHY THIS IS NOT AN EDIT TO services/*.yaml ────────────────────────────
 * `src/data/services/plumbing.yaml` and `hvac.yaml` are PER-SERVICE, shared by
 * `/austin/…` and `/san-antonio/…` alike. Round 10 lifts the copy freeze for
 * San Antonio and says, separately and explicitly, not to touch Austin's
 * service pages. Editing the shared YAML cannot do both. So the YAML is left
 * exactly as it is — Austin renders byte-identically — and San Antonio's
 * replacement lives here, keyed by location AND service.
 *
 * That also keeps CLAUDE.md's config-driven rule: adding a metro or a service
 * to this layer is a config entry, not a new page.
 *
 * ── WHAT LIVES HERE AND WHAT DOES NOT ─────────────────────────────────────
 * Prose that frames a reading lives here. NUMBERS DO NOT. Every figure on the
 * rendered page is computed at build time from `src/data/generated/**` by
 * `lib/tradeActivity.ts` and the dataset helpers — nothing in this file states
 * a count, a percentage or a date that the data has not produced. A brief that
 * quotes a figure is a starting hypothesis, not a source.
 *
 * Block order is fixed and identical on every page in this layer:
 *   #answer · #data · #method · #context · #faq · #sources
 * `#answer` is the extraction target — the largest text after the H1, written
 * as the thesis rather than an introduction. `#sources` is content, not footer
 * chrome.
 */
import type { TradeCategory } from "../ingest/tradeCategories";

export interface SourceRef {
  /** Feed name as it appears in data-sources.yaml, or the publisher. */
  name: string;
  /** What this page took from it. */
  used: string;
  /** Primary source. Never an aggregator. */
  url: string;
}

export interface ContextBlock {
  heading: string;
  body: string;
  /** A live dataset topic to render a reading from, if one applies. */
  topic?: string;
}

export interface OmittedReading {
  /** What the reading would have said. */
  reading: string;
  /** Exactly what feed or field it needed, and what is actually there. */
  needed: string;
}

export interface BelowHeroSpec {
  /** Replaces the hero's eyebrow / H1 / lede. Structure is untouched — no new
   * hero tool, no address input; see the round note in HANDOFF. */
  hero: { eyebrow: string; h1: string; lede: string; microcopy: string };
  /** The trade category to read from permit-trade-activity. */
  category: TradeCategory;
  /** How the trade is named in a sentence. Not derivable from the service
   * name: lowercasing "HVAC" gives "hvac", which reads as a typo. */
  subjectNoun: string;
  /** Question-shaped H2s. The answer's first sentence carries the figure. */
  answerHeading: string;
  dataHeading: string;
  methodHeading: string;
  /** How the metro's source classifies these rows, in plain words. */
  methodBody: string;
  contextHeading: string;
  context: ContextBlock[];
  faqHeading: string;
  /** `a` may contain `{…}` placeholders filled from the computed reading. */
  faq: { q: string; a: string }[];
  sourcesHeading: string;
  sources: SourceRef[];
  /** Readings deliberately not built, and what each needed. Rendered on the
   * page: a reader deserves to know what we looked for and did not find. */
  omitted: OmittedReading[];
}

const SA_PERMIT_SOURCE: SourceRef = {
  name: "City of San Antonio Permits Open Data",
  used: "Every residential trade permit issued in the window, by permit type and issue date. Counted and grouped by month; no other field is read.",
  url: "https://data.sanantonio.gov/dataset/permits-and-inspections",
};

const THI_METHODOLOGY: SourceRef = {
  name: "Texas Home Intelligence — permit methodology",
  used: "How permit types are mapped to trade categories, and why no cost figure is published from permit data.",
  url: "/methodology/",
};

export const BELOW_HERO: Record<string, BelowHeroSpec> = {
  "san-antonio/hvac": {
    hero: {
      eyebrow: "SAN ANTONIO HVAC PERMIT ACTIVITY",
      h1: "HVAC work in San Antonio, measured from the city's own permit record",
      lede:
        "How much mechanical permit activity San Antonio is actually running, how it moves through the year, " +
        "and what the city's record can and cannot tell you about it.",
      microcopy:
        "Counts and timing from the city's permit data · No cost figures — permit valuation does not support them",
    },
    category: "hvac",
    subjectNoun: "HVAC",
    answerHeading: "How much HVAC work is happening in San Antonio?",
    dataHeading: "San Antonio HVAC permits, month by month",
    methodHeading: "How this count is put together",
    methodBody:
      "San Antonio issues a dedicated Mechanical Permit type, so these rows are identified by the city's own " +
      "permit-type field — not by searching descriptions for the word “HVAC”. That matters: a type match either " +
      "holds or it does not, while a text match quietly inherits whatever a clerk happened to type. Every permit " +
      "type that rolled into this count is named below, with its share.",
    contextHeading: "What else bears on a San Antonio HVAC decision",
    context: [
      {
        heading: "What a system costs to run depends on the rate as much as the equipment",
        body:
          "This is the average price Texas households paid per kilowatt-hour in the most recent " +
          "month the U.S. Energy Information Administration has published — a statewide figure, " +
          "not a San Antonio one, and not your plan's rate. We publish the rate and stop there: " +
          "turning it into a monthly bill or a payback period needs this home's actual " +
          "consumption, which we do not have and will not assume.",
        topic: "electricity-rate",
      },
      {
        heading: "Air quality is the one condition we measure that changes what a filter has to do",
        body:
          "A system's filter is doing more work on a high-particulate day than a clear one. This is the current " +
          "AirNow reading for the San Antonio area — an area measurement, not a reading at any address, and it " +
          "describes today rather than the season.",
        topic: "air-quality",
      },
    ],
    faqHeading: "San Antonio HVAC permit questions",
    faq: [
      {
        q: "How many HVAC permits does San Antonio issue?",
        a: "{MEAN} a month on average across the {MONTHS} months from {WINDOW}, {TOTAL} in total. These are mechanical permits issued by the City of San Antonio, counted from the city's own permit record.",
      },
      {
        q: "When is HVAC work busiest in San Antonio?",
        a: "{PEAKS} Mechanical permit activity in San Antonio concentrates in summer, which is when cooling systems are under the most load and failures surface.",
      },
      {
        q: "Is HVAC activity in San Antonio going up?",
        a: "{TREND_SENTENCE} A change smaller than the counting noise on a monthly total of this size ({NOISE}) would not be distinguishable from ordinary month-to-month variation, so it would not be reported as a trend.",
      },
      {
        q: "What does a San Antonio HVAC permit cost?",
        a: "We do not publish that, and this data cannot support it. San Antonio's DECLARED VALUATION field is 0.00% populated on every residential and trade permit type, and declared valuation is in any case an applicant's fee-basis statement to the city rather than a paid invoice. A cost figure needs a different source.",
      },
      {
        q: "Do I need a permit to replace an HVAC system in San Antonio?",
        a: "The city issues mechanical permits for this class of work, which is why the activity shows up in this record at all. Whether your specific job needs one is a question for the City of San Antonio's Development Services department, not for us — the permit record shows what was issued, not what the rule requires.",
      },
    ],
    sourcesHeading: "Sources for this page",
    sources: [
      SA_PERMIT_SOURCE,
      {
        name: "U.S. Energy Information Administration",
        used: "Average monthly residential retail electricity price for Texas, in cents per kilowatt-hour. The rate only — no bill, payback or saving is derived from it.",
        url: "https://www.eia.gov/electricity/data.php",
      },
      {
        name: "AirNow (U.S. EPA)",
        used: "Current air-quality index for the San Antonio reporting area.",
        url: "https://www.airnow.gov/",
      },
      {
        name: "IRS Fact Sheet 2025-05",
        used: "The expiration date of the 25C Energy Efficient Home Improvement Credit, and the absence of a grandfather provision.",
        url: "https://www.irs.gov/newsroom/fs-2025-05",
      },
      THI_METHODOLOGY,
    ],
    omitted: [
      {
        reading: "Runtime hours / cooling degree days — how hard a San Antonio system works in a typical season",
        needed:
          "A cooling-degree-day series for San Antonio. The noaa-climate feed has no San Antonio file at all, and its Austin file is a one-observation SAMPLE carrying only normal high and low temperatures. There is no NWS forecast feed for San Antonio either.",
      },
      {
        reading: "Equipment-age or pipe-era percentile — how your system compares to the local housing stock",
        needed:
          "Parcel-level year-built data. The Bexar Appraisal District records request has not returned, so no parcel data exists for San Antonio.",
      },
      {
        reading: "Typical HVAC replacement cost in San Antonio",
        needed:
          "A cost source that is not permit valuation. Blocked, not merely unbuilt — see the measurement in docs/audits/round-6-permit-measurement.md.",
      },
    ],
  },

  "san-antonio/plumbing": {
    hero: {
      eyebrow: "SAN ANTONIO PLUMBING PERMIT ACTIVITY",
      h1: "Plumbing work in San Antonio, measured from the city's own permit record",
      lede:
        "San Antonio issues more plumbing permits than any other trade we track. Here is how many, how steady " +
        "the volume is, and which permit types make it up.",
      microcopy:
        "Counts and timing from the city's permit data · No cost figures — permit valuation does not support them",
    },
    category: "plumbing",
    subjectNoun: "plumbing",
    answerHeading: "How much plumbing work is happening in San Antonio?",
    dataHeading: "San Antonio plumbing permits, month by month",
    methodHeading: "How this count is put together",
    methodBody:
      "Plumbing is not one permit type in San Antonio — the city issues several, and a count that read only " +
      "“Plumbing General Permit” would miss most of the work. These rows are identified by the city's own " +
      "permit-type field across every plumbing type the mapping covers, and every one that issued a permit in " +
      "this window is named below with its share.",
    contextHeading: "What else bears on a San Antonio plumbing decision",
    context: [
      {
        heading: "Drought is the local condition most directly tied to buried supply and drain lines",
        body:
          "Central Texas clay soils shrink as they dry and swell as they rewet. That movement is a documented " +
          "contributor to stress on buried supply and drain lines, so a long dry stretch is worth knowing about. " +
          "This is the U.S. Drought Monitor reading for the San Antonio area — a county-level measurement, not a " +
          "reading at any address.",
        topic: "drought",
      },
    ],
    faqHeading: "San Antonio plumbing permit questions",
    faq: [
      {
        q: "How many plumbing permits does San Antonio issue?",
        a: "{MEAN} a month on average across the {MONTHS} months from {WINDOW}, {TOTAL} in total. That is more than any other trade category we track in San Antonio.",
      },
      {
        q: "What counts as a plumbing permit in San Antonio?",
        a: "{TYPES_SENTENCE} The city separates them by work type rather than issuing one general plumbing permit, so a count that reads only one type understates the activity substantially.",
      },
      {
        q: "Is plumbing activity in San Antonio going up?",
        a: "{TREND_SENTENCE} A change smaller than the counting noise on a monthly total of this size ({NOISE}) would not be distinguishable from ordinary month-to-month variation, so it would not be reported as a trend.",
      },
      {
        q: "What does a San Antonio plumbing permit cost?",
        a: "We do not publish that, and this data cannot support it. San Antonio's DECLARED VALUATION field is 0.00% populated on every residential and trade permit type, and declared valuation is in any case an applicant's fee-basis statement to the city rather than a paid invoice. A cost figure needs a different source.",
      },
      {
        q: "Does San Antonio plumbing activity follow a season?",
        a: "{SEASON_SENTENCE} Plumbing runs far steadier through the year than mechanical work does, which concentrates sharply in summer.",
      },
    ],
    sourcesHeading: "Sources for this page",
    sources: [
      SA_PERMIT_SOURCE,
      {
        name: "U.S. Drought Monitor",
        used: "Weekly drought category for Bexar County.",
        url: "https://droughtmonitor.unl.edu/",
      },
      THI_METHODOLOGY,
    ],
    omitted: [
      {
        reading: "Pipe-era reading — what supply material your neighbourhood's housing stock is likely to have",
        needed:
          "Parcel-level year-built data. The Bexar Appraisal District records request has not returned, so no parcel data exists for San Antonio.",
      },
      {
        reading: "Percentile against comparable homes",
        needed:
          "A signal that varies within the metro. Every San Antonio feed we hold is metro- or county-level; nothing varies by ZIP, so a percentile would be fabricated.",
      },
      {
        reading: "Typical repipe or water-heater replacement cost",
        needed:
          "A cost source that is not permit valuation. Blocked, not merely unbuilt — see docs/audits/round-6-permit-measurement.md.",
      },
    ],
  },
};

export function belowHeroSpec(location: string, service: string): BelowHeroSpec | undefined {
  return BELOW_HERO[`${location}/${service}`];
}
