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
  /** ISO date a HUMAN opened it and confirmed it resolves. Not the same thing
   * as the build having fetched it — nothing here has ever been fetched from
   * the build environment. See HANDOFF, Round 13b/14. */
  checkedByHumanOn?: string;
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
  /** The noun as it appears at the START of the #data table caption, where a
   * lowercase word reads as a typo. Optional, and set only where it differs —
   * so adding it cannot change a page that does not opt in. */
  dataCaptionNoun?: string;
  /** Question-shaped H2s. The answer's first sentence carries the figure. */
  answerHeading: string;
  dataHeading: string;
  methodHeading: string;
  /** How the metro's source classifies these rows, in plain words. */
  methodBody: string;
  /** Reconciles this count against another THI page that counts the same thing
   * differently. Two of our own pages disagreeing on one fact is a citation
   * liability, so where that happens the page says why. */
  dataReconciliation?: string;
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

/**
 * The San Antonio dataset citation, DERIVED FROM THE FETCHER rather than typed
 * out beside it.
 *
 * Round 14 cited a UUID the owner supplied and flagged that it could not be
 * confirmed against our own code — both fetchers resolve the package by SLUG,
 * `package_show?id=building-permits`, and the UUID appeared nowhere in the repo.
 * Round 14b resolved it: the owner opened
 * `data.sanantonio.gov/dataset/building-permits` and confirmed the dataset —
 * title "Building Permits", organization "Land and Building Development", four
 * resources including PERMITS ISSUED. So the slug is right, and it is also the
 * identifier the code actually requests.
 *
 * ── WHY THIS IS PARSED AND NOT TYPED ──────────────────────────────────────
 * A citation and a fetch that name the same dataset in two places drift apart
 * the first time one of them changes. Reading the id out of the fetcher's own
 * source makes that impossible: change `PACKAGE_SHOW_URL` and this citation
 * follows, or the build fails saying so. It is the same trick
 * `scripts/fixture-condition.ts` uses to take alert copy from `alerts.ts`
 * instead of restating it.
 *
 * `?raw` is a Vite build-time import — the source text becomes a string
 * constant at build, so this costs nothing at runtime and pulls no ingest code
 * into any bundle.
 */
import saPermitsFetcherSource from "../ingest/fetchers/sanAntonioPermits.ts?raw";

function sanAntonioDatasetUrl(): string {
  const m = saPermitsFetcherSource.match(
    /package_show\?id=([A-Za-z0-9_-]+)/,
  );
  if (!m) {
    throw new Error(
      "belowHero: could not read the CKAN package id out of " +
        "src/ingest/fetchers/sanAntonioPermits.ts. The citation on all three San Antonio " +
        "pages is derived from it so the two cannot drift — fix this extractor rather than " +
        "hardcoding the URL back.",
    );
  }
  return `https://data.sanantonio.gov/dataset/${m[1]}`;
}

/** Exported so a replay can assert the derivation, not just the rendered page. */
export const SA_DATASET_URL = sanAntonioDatasetUrl();

const SA_PERMIT_SOURCE: SourceRef = {
  name: "City of San Antonio Permits Open Data",
  used: "Every residential trade permit issued in the window, by permit type and issue date. Counted and grouped by month; no other field is read.",
  url: SA_DATASET_URL,
  // Owner opened it 2026-09-04: title "Building Permits", organization "Land
  // and Building Development", four resources including PERMITS ISSUED and the
  // PERMITS ISSUED 2020-2024 archive. Last Updated August 29, 2026.
  checkedByHumanOn: "2026-09-04",
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
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "AirNow (U.S. EPA)",
        used: "Current air-quality index for the San Antonio reporting area.",
        url: "https://www.airnow.gov/",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "IRS Fact Sheet 2025-05 — FAQs on the OBBB modification of section 25C (and 25D, 25E, 30C, 30D, 45L, 45W, 179D)",
        used: "Q1: the section 25C credit is not allowed for property placed in service after December 31, 2025. Q6: no grandfather provision for equipment bought earlier.",
        // Round 14: was /newsroom/fs-2025-05, which the owner confirmed is dead.
        url: "https://www.irs.gov/newsroom/faqs-for-modification-of-sections-25c-25d-25e-30c-30d-45l-45w-and-179d-under-public-law-119-21-139-stat-72-july-4-2025-commonly-known-as-the-one-big-beautiful-bill-obbb",
        checkedByHumanOn: "2026-09-04",
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

  "san-antonio/roofing": {
    hero: {
      eyebrow: "SAN ANTONIO ROOFING PERMIT ACTIVITY",
      h1: "Roofing work in San Antonio, counted from a dedicated permit class",
      lede:
        "San Antonio issues a Re-Roof Permit — its own permit type for replacing a roof covering. " +
        "That makes roof activity here countable rather than inferred, and this is what the count says.",
      microcopy:
        "A permit-class count, not a text search · No cost figures — permit valuation does not support them",
    },
    category: "roofing",
    subjectNoun: "re-roof",
    dataCaptionNoun: "Re-roof",
    answerHeading: "How much roofing work is happening in San Antonio?",
    dataHeading: "San Antonio re-roof permits, month by month",
    methodHeading: "Why this count is firmer than most permit counts",
    methodBody:
      "San Antonio has a permit type called Re-Roof Permit, and it is the only type that rolls into this " +
      "category — every permit counted here is one the city itself classified as a re-roof. Nothing is " +
      "inferred from a description field, so nothing depends on how a clerk worded the job, and the count " +
      "does not quietly absorb work that merely mentions a roof. That is unusual: most trade activity has " +
      "to be recovered from free text, and a text match picks up whatever happens to share a word.",
    dataReconciliation:
      "Our own /data/san-antonio/roof-permits/ page reports a larger number over a longer window, and the " +
      "two are not in conflict. That page is a per-permit archive that accumulates records as the city " +
      "publishes them, starting before this window opens; this is a rolling count of the last twelve " +
      "complete calendar months, recomputed each run. Different questions, different answers, both from " +
      "the same Re-Roof Permit type.",
    contextHeading: "What else bears on a San Antonio roofing decision",
    context: [
      {
        heading: "What NOAA actually recorded in Bexar County",
        body:
          "Roof damage claims follow storms, so the honest starting point is what the record holds for " +
          "this county specifically — not for the region, and not for a county next door. This is every " +
          "storm event NOAA logged in Bexar County over the window it covers.",
        topic: "storm-exposure",
      },
      {
        heading: "Drought moves a roof less than it moves a foundation, but it moves the timing",
        body:
          "Dry stretches are when roofing crews are most available and least weather-delayed, and wet ones " +
          "are when a small leak stops being small. This is the U.S. Drought Monitor reading for the San " +
          "Antonio area — a county-level measurement, not a reading at any address.",
        topic: "drought",
      },
    ],
    faqHeading: "San Antonio roofing questions",
    faq: [
      {
        q: "Do you need a permit to replace a roof in San Antonio?",
        a: "The city issues a dedicated Re-Roof Permit, and it issued {TOTAL} of them in the {MONTHS} months from {WINDOW} — so a permitted re-roof is the ordinary case here, not the exception. Whether your specific job needs one is a question for San Antonio's Development Services Department; the permit record shows what was issued, not what the rule requires.",
      },
      {
        q: "How many roofs are replaced in San Antonio each year?",
        a: "{MEAN} a month on average, {TOTAL} across the {MONTHS}-month window. That is a count of permits the city issued, which is the closest public measure of roof replacement volume — it is not a count of roofs, since a permit can cover more than one structure and unpermitted work leaves no record.",
      },
      {
        q: "What does a roof replacement cost in San Antonio?",
        a: "We do not publish that, and this data cannot support it. San Antonio's DECLARED VALUATION field is 0.00% populated on every residential and trade permit type including Re-Roof, and declared valuation is in any case an applicant's fee-basis statement to the city rather than a paid invoice. A credible cost figure needs a different source — contractor-reported job data, insurance claim settlements, or a materials-and-labour index — none of which we hold. We would rather publish nothing than a number derived from an empty field.",
      },
      {
        q: "Is roofing work in San Antonio seasonal?",
        a: "{SEASON_SENTENCE}",
      },
      {
        q: "How do you tell if a roof has hail damage?",
        a: "From the ground, and then with someone qualified on the roof. Look for dents on gutters, downspouts, vents and any metal flashing — soft metal shows a strike before shingles do — and for granules collecting at downspout outlets. Photograph what you find with the date. What we can tell you from the public record is whether NOAA logged hail in your county in the window we hold; what we cannot tell you is whether your roof was hit, because no public dataset records that.",
      },
      {
        q: "Does homeowners insurance cover roof replacement in Texas?",
        a: "That depends on your policy and the cause, and no public dataset we hold can answer it for your home. What is worth knowing before you call: Texas policies commonly distinguish replacement cost from actual cash value, and many carry a separate wind-and-hail deductible set as a percentage of the dwelling coverage rather than a flat sum. Both change the arithmetic more than the headline price does. Your declarations page states which applies.",
      },
      {
        q: "Do roofing contractors need a licence in Texas?",
        a: "No. Texas has no state roofing licence, which makes a licence number the wrong thing to check here. See the note above for what is checkable instead.",
      },
    ],
    sourcesHeading: "Sources for this page",
    sources: [
      SA_PERMIT_SOURCE,
      {
        name: "NOAA Storm Events Database (NCEI)",
        used: "Storm events recorded in Bexar County, by type. Published on a two-to-four-month lag, which the page states rather than smoothing over.",
        url: "https://www.ncdc.noaa.gov/stormevents/",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "U.S. Drought Monitor",
        used: "Weekly drought category for Bexar County.",
        url: "https://droughtmonitor.unl.edu/",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "Texas Department of Licensing and Regulation",
        used: "Which trades Texas licenses, and the absence of roofing among them.",
        // Round 13b: /programs.htm was dead. /licenses.htm is the live list.
        url: "https://www.tdlr.texas.gov/licenses.htm",
        checkedByHumanOn: "2026-09-04",
      },
      THI_METHODOLOGY,
    ],
    omitted: [
      {
        reading: "Roof age, or how much of the local housing stock is due for replacement",
        needed:
          "Parcel-level year-built data, and a prior re-roof date per parcel. The Bexar Appraisal District records request has not returned, and no public source records when a specific roof was last replaced.",
      },
      {
        reading: "Hail exposure scored per ZIP or neighbourhood",
        needed:
          "A signal that varies within the metro. NOAA storm events carry a county, not a ZIP, and every other San Antonio feed we hold is metro- or county-level — so a per-ZIP hail score would be invented, not measured.",
      },
      {
        reading: "Typical roof replacement cost, or a cost range by material",
        needed:
          "A cost source that is not permit valuation. Blocked, not merely unbuilt — measured end to end in docs/audits/round-6-permit-measurement.md.",
      },
      {
        reading: "Insurance claim rates or average settlement for roof damage",
        needed:
          "Texas Department of Insurance loss data at county level. We ingest a TDI series for Austin only, and it is a SAMPLE feed carrying no San Antonio rows.",
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
        checkedByHumanOn: "2026-09-04",
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
