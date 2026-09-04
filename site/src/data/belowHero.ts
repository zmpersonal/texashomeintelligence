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
  /**
   * Why NO cost figure is published from this metro's permit feed.
   *
   * Spec-supplied because the two metros fail for DIFFERENT MEASURED REASONS
   * and one sentence cannot carry both truthfully: San Antonio's valuation
   * field is empty, Austin's is populated with the wrong quantity. The refusal
   * itself is not optional and is not stated here — the component states it,
   * on every page in this layer, and this only says why.
   */
  costOmission: string;
  /**
   * For a count assembled by TEXT MATCH rather than by a permit class: the key
   * into `lib/textMatchComposition.ts`, which measures what the match sweeps
   * in and returns the sentences. A key, not the sentences — the shares are
   * counted at build time and nothing in this file states one.
   *
   * Declaring it is mandatory for a text-matched page: the component throws if
   * the topic yields nothing, rather than publishing a text-matched total with
   * no account of what is in it.
   */
  answerCompositionTopic?: string;
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

/**
 * The Austin dataset citation, derived the same way — and cross-checked.
 *
 * Austin is not San Antonio's portal and must not inherit its URL: Austin
 * publishes on SOCRATA (`data.austintexas.gov`), addressed by a four-four
 * resource id, while San Antonio publishes on CKAN, addressed by a package
 * slug. Nothing about the San Antonio derivation transfers except the
 * principle, which is the part worth transferring.
 *
 * TWO fetchers name this resource, and that is the reason for the assertion
 * below rather than a single parse. `austinPermits.ts` builds the archive
 * behind `/data/austin/roof-permits/`; `permitTradeActivity.ts` builds the
 * monthly counts these pages render. If those two ever pointed at different
 * resources, this citation would be right about one page and wrong about the
 * other, silently. So both are read and required to agree — and the citation
 * is derived from `austinPermits.ts`, as Round 15 specified.
 *
 * `/d/<id>` is Socrata's own canonical dataset address; `/resource/<id>.json`
 * is the API endpoint the fetchers call, which is the same dataset and not a
 * page a reader should be sent to.
 */
import austinPermitsFetcherSource from "../ingest/fetchers/austinPermits.ts?raw";
import tradeActivityFetcherSource from "../ingest/fetchers/permitTradeActivity.ts?raw";

function austinResourceId(source: string, file: string): string {
  const m = source.match(
    /data\.austintexas\.gov\/resource\/([a-z0-9]{4}-[a-z0-9]{4})\.json/,
  );
  if (!m) {
    throw new Error(
      `belowHero: could not read the Socrata resource id out of src/ingest/fetchers/${file}. ` +
        "The Austin dataset citation is derived from it so the two cannot drift — fix this " +
        "extractor rather than hardcoding the URL back.",
    );
  }
  return m[1];
}

function austinDatasetUrl(): string {
  const cited = austinResourceId(austinPermitsFetcherSource, "austinPermits.ts");
  const counted = austinResourceId(tradeActivityFetcherSource, "permitTradeActivity.ts");
  if (cited !== counted) {
    throw new Error(
      `belowHero: austinPermits.ts reads Socrata resource ${cited} but permitTradeActivity.ts ` +
        `reads ${counted}. The Austin service pages cite the first and count from the second, so ` +
        "a citation that named one while the numbers came from the other would be wrong without " +
        "looking wrong. Reconcile the fetchers before citing either.",
    );
  }
  return `https://data.austintexas.gov/d/${cited}`;
}

/** Exported so a replay can assert the derivation, not just the rendered page. */
export const AUSTIN_DATASET_URL = austinDatasetUrl();

const AUSTIN_PERMIT_SOURCE: SourceRef = {
  name: "City of Austin Issued Construction Permits (Socrata)",
  used: "Every issued construction permit in the window, by permit type, work class, description and issue date. Counted and grouped by month; no valuation field is read.",
  url: AUSTIN_DATASET_URL,
  // NOT set. No human has opened this URL and no fetch from this environment
  // has ever reached data.austintexas.gov — the egress proxy denies it, as it
  // denies every other citation host on this site. It is derived from the
  // fetcher that has been successfully querying this resource daily, which is
  // strong evidence the id is right and no evidence at all about what a
  // browser sees at /d/<id>. The weekly citation check will be the first thing
  // to open it. See HANDOFF.
  // checkedByHumanOn: unset until a human confirms.
};

/** The valuation problem, per metro. Both refuse a cost figure; the reasons
 * are different and measured, and neither is generic caution. */
const SA_COST_OMISSION =
  "San Antonio's DECLARED VALUATION field is 0.00% populated on every residential and trade " +
  "permit type, and declared valuation is an applicant's fee-basis statement to the city rather " +
  "than a paid invoice.";
//
// NOTE ON THE ABSENT NUMERALS. The measured medians behind this sentence are
// six figures on a plumbing permit and seven on a mechanical one. They are
// described in words rather than printed, and that is not squeamishness: they
// are PERMIT VALUATIONS, the exact quantity this layer refuses to publish.
// Printing them inside the explanation of why we do not publish them would
// hand an answer engine a dollar figure attached to a trade and a city, which
// is the citation liability the rule exists to prevent. `saservicerender`'s
// cost guard caught this on all three Austin pages and was right to.
const AUSTIN_COST_OMISSION =
  "Austin's permit record does carry valuation fields, which is the harder failure of the two: " +
  "the coalesced value has a median of 1, and the trade-named fields carry whole-project " +
  "construction values — the median on a plumbing permit runs to six figures and on a mechanical " +
  "permit to seven — rather than the cost of the trade work. Declared valuation is in any case an " +
  "applicant's fee-basis statement to the city rather than a paid invoice.";

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
    costOmission: SA_COST_OMISSION,
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
    costOmission: SA_COST_OMISSION,
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
    costOmission: SA_COST_OMISSION,
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

  /* ── AUSTIN ──────────────────────────────────────────────────────────────
   * Round 15. Three pages on the same component, deliberately NOT a fork.
   *
   * HVAC and plumbing map onto San Antonio's almost exactly: Austin issues a
   * Mechanical Permit and a Plumbing Permit, one dedicated type each, matched
   * on the city's own permit-type field. The structure carries over because
   * the measurement does.
   *
   * ROOFING DOES NOT, and the page is written around that rather than around
   * it. Austin publishes no roofing permit type. Its roofing count is
   * recovered by matching the word "roof" against the permit description, so
   * it is a measure of roof-RELATED activity that includes rooftop solar,
   * rooftop equipment and the occasional sign permit for a business with
   * "Roofing" in its name. That is stated in #answer, where the figure is, and
   * not left for #method — a reader who quotes one passage from the page must
   * quote the caveat with the number.
   *
   * Nothing on the Austin roofing page compares its count to San Antonio's,
   * and no San Antonio figure appears anywhere near it. The two cities differ
   * by a factor of roughly three for measurement-method reasons alone, and a
   * side-by-side would read as a finding about Texas roofing when it is a
   * finding about two permit vocabularies.
   */

  "austin/hvac": {
    hero: {
      eyebrow: "AUSTIN HVAC PERMIT ACTIVITY",
      h1: "HVAC work in Austin, measured from the city's own permit record",
      lede:
        "How much mechanical permit activity Austin is actually running, how sharply it swings " +
        "with the cooling season, and what the city's record can and cannot tell you about it.",
      microcopy:
        "Counts and timing from the city's permit data \u00b7 No cost figures \u2014 permit valuation does not support them",
    },
    category: "hvac",
    subjectNoun: "HVAC",
    costOmission: AUSTIN_COST_OMISSION,
    answerHeading: "How much HVAC work is happening in Austin?",
    dataHeading: "Austin HVAC permits, month by month",
    methodHeading: "How this count is put together",
    methodBody:
      "Austin issues a single Mechanical Permit type and it is the only type that rolls into this " +
      "category, so every permit counted here is one the city itself classified as mechanical work. " +
      "Nothing is recovered from a description field. That matters more on this site than it might " +
      "elsewhere: Austin's roofing count on the sibling page has to be recovered from text, and the " +
      "difference in how firm the two numbers are is the difference between a type match and a word " +
      "search.",
    contextHeading: "What else bears on an Austin HVAC decision",
    context: [
      {
        heading: "What a system costs to run depends on the rate as much as the equipment",
        body:
          "This is the average price Texas households paid per kilowatt-hour in the most recent " +
          "month the U.S. Energy Information Administration has published \u2014 a statewide figure, " +
          "not an Austin one, and not your plan's rate. We publish the rate and stop there: " +
          "turning it into a monthly bill or a payback period needs this home's actual " +
          "consumption, which we do not have and will not assume.",
        topic: "electricity-rate",
      },
      {
        heading: "The one reading on this page that describes this week rather than the year",
        body:
          "Every other figure here covers a twelve-month window. This is the current National " +
          "Weather Service point forecast for Austin, and it is the condition a cooling system is " +
          "actually being asked to meet today \u2014 which is when a marginal one announces itself. " +
          "There is no equivalent feed for San Antonio, which is why that city's page does not " +
          "carry this reading and says so.",
        topic: "forecast-conditions",
      },
      {
        heading: "Air quality is the one condition we measure that changes what a filter has to do",
        body:
          "A system's filter is doing more work on a high-particulate day than a clear one. This is " +
          "the latest AirNow reading for the Austin area \u2014 an area measurement, not a reading at " +
          "any address. Read the badge with the number: when the feed is reachable this is today's " +
          "reading, and when it is not, it is the last value we actually received and the badge " +
          "says so rather than the page pretending otherwise.",
        topic: "air-quality",
      },
    ],
    faqHeading: "Austin HVAC permit questions",
    faq: [
      {
        q: "How many HVAC permits does Austin issue?",
        a: "{MEAN} a month on average across the {MONTHS} months from {WINDOW}, {TOTAL} in total. These are mechanical permits issued by the City of Austin, counted from the city's own permit record.",
      },
      {
        q: "When is HVAC work busiest in Austin?",
        a: "{SEASON_SENTENCE} Mechanical permit activity concentrates in the cooling season, which is when systems are under the most load and failures surface. A permit count records when work was FILED rather than when it was done, so read a busy month as a busy month for the permit desk as much as for the trade.",
      },
      {
        q: "Is HVAC activity in Austin going up?",
        a: "{TREND_SENTENCE} A change smaller than the counting noise on a monthly total of this size ({NOISE}) would not be distinguishable from ordinary month-to-month variation, so it would not be reported as a trend.",
      },
      {
        q: "What does an Austin HVAC permit cost?",
        a: "We do not publish that, and this data cannot support it. Austin's permit record carries valuation fields, but the coalesced value has a median of 1 and the trade-named fields carry whole-project construction values rather than the cost of the trade work \u2014 the median valuation on a mechanical permit runs to seven figures, which is a building, not a furnace. Declared valuation is in any case an applicant's fee-basis statement to the city rather than a paid invoice. A cost figure needs a different source.",
      },
      {
        q: "Do I need a permit to replace an HVAC system in Austin?",
        a: "The city issues mechanical permits for this class of work, which is why the activity shows up in this record at all. Whether your specific job needs one is a question for the City of Austin's Development Services Department, not for us \u2014 the permit record shows what was issued, not what the rule requires.",
      },
    ],
    sourcesHeading: "Sources for this page",
    sources: [
      AUSTIN_PERMIT_SOURCE,
      {
        name: "U.S. Energy Information Administration",
        used: "Average monthly residential retail electricity price for Texas, in cents per kilowatt-hour. The rate only \u2014 no bill, payback or saving is derived from it.",
        url: "https://www.eia.gov/electricity/data.php",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "National Weather Service API",
        used: "Current point forecast high and low for the Austin area. One forecast, underived.",
        url: "https://api.weather.gov/",
      },
      {
        name: "AirNow (U.S. EPA)",
        used: "Latest air-quality index for the Austin reporting area.",
        url: "https://www.airnow.gov/",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "IRS Fact Sheet 2025-05 \u2014 FAQs on the OBBB modification of section 25C (and 25D, 25E, 30C, 30D, 45L, 45W, 179D)",
        used: "Q1: the section 25C credit is not allowed for property placed in service after December 31, 2025. Q6: no grandfather provision for equipment bought earlier.",
        url: "https://www.irs.gov/newsroom/faqs-for-modification-of-sections-25c-25d-25e-30c-30d-45l-45w-and-179d-under-public-law-119-21-139-stat-72-july-4-2025-commonly-known-as-the-one-big-beautiful-bill-obbb",
        checkedByHumanOn: "2026-09-04",
      },
      THI_METHODOLOGY,
    ],
    omitted: [
      {
        reading: "Cooling degree days \u2014 how hard an Austin system works in a typical season",
        needed:
          "A cooling-degree-day series. The noaa-climate feed's Austin file is a one-observation SAMPLE carrying normal high and low temperatures only, so there is nothing to accumulate. The forecast reading above describes one day and is not a substitute for a season.",
      },
      {
        reading: "Equipment-age percentile \u2014 how your system compares to the local housing stock",
        needed:
          "Parcel-level year-built data. We do not ingest Travis Central Appraisal District records, so nothing here knows the age of any particular house. Census ACS gives a median home age for the metro, which is a fact about Austin rather than about your system, and it does not change what anyone does this month.",
      },
      {
        reading: "Typical HVAC replacement cost in Austin",
        needed:
          "A cost source that is not permit valuation. Blocked, not merely unbuilt \u2014 see the measurement in docs/audits/round-6-permit-measurement.md. We also hold a BLS median hourly wage for Austin trades, and it is deliberately not used here: its newest record is from January 2025, and a wage is not a price.",
      },
    ],
  },

  "austin/roofing": {
    hero: {
      eyebrow: "AUSTIN ROOF-RELATED PERMIT ACTIVITY",
      h1: "Roof work in Austin, recovered from the city's description text",
      lede:
        "Austin publishes no roofing permit class, so roof activity here has to be matched on the " +
        "word \u201croof\u201d rather than counted from a permit type. This is what that count says, and " +
        "what it includes that a homeowner would not expect.",
      microcopy:
        "A text match, not a permit class \u00b7 Broader than roof replacement \u00b7 No cost figures \u2014 permit valuation does not support them",
    },
    category: "roofing",
    subjectNoun: "roof-related",
    dataCaptionNoun: "Roof-related",
    costOmission: AUSTIN_COST_OMISSION,
    answerCompositionTopic: "austin-roof-text-match",
    answerHeading: "How much roofing work is happening in Austin?",
    dataHeading: "Austin roof-related permits, month by month",
    methodHeading: "Why this count is softer than a permit-class count",
    methodBody:
      "Austin's permit vocabulary has no roofing type. A re-roof is filed under a general work " +
      "class \u2014 Repair, Remodel, Addition and Remodel \u2014 and the only thing distinguishing it from " +
      "any other repair is the wording of the description. So the count is a text match: a permit " +
      "enters this category when its work class, permit type or description contains the word " +
      "\u201croof\u201d. One row in the whole window arrives by work class instead, from a Roof class the " +
      "city has used almost never. A text match either over-collects or under-collects and usually " +
      "does both, and the table below names every source value so the composition is visible " +
      "rather than asserted.",
    dataReconciliation:
      "Our own /data/austin/roof-permits/ page reports a larger number over a longer window, and " +
      "the two are not in conflict. That page is a per-permit archive that accumulates records as " +
      "the city publishes them, starting before this window opens and running to the newest " +
      "partial month; this is a rolling count of the last twelve COMPLETE calendar months, " +
      "recomputed each run, with the unfinished month dropped so a few days of data cannot be " +
      "mistaken for a quiet month. Different questions, different windows, the same text match " +
      "behind both.",
    contextHeading: "What else bears on an Austin roofing decision",
    context: [
      {
        heading: "What NOAA actually recorded in Travis County",
        body:
          "Roof damage claims follow storms, so the honest starting point is what the record holds " +
          "for this county specifically \u2014 not for the region, and not for a county next door. This " +
          "is every storm event NOAA logged in Travis County over the window it covers, hail " +
          "included where hail was logged.",
        topic: "storm-exposure",
      },
      {
        heading: "Drought moves a roof less than it moves a foundation, but it moves the timing",
        body:
          "Dry stretches are when roofing crews are most available and least weather-delayed, and " +
          "wet ones are when a small leak stops being small. This is the U.S. Drought Monitor " +
          "reading for Travis County \u2014 a county-level measurement, not a reading at any address.",
        topic: "drought",
      },
    ],
    faqHeading: "Austin roofing questions",
    faq: [
      {
        q: "How many roofing permits does Austin issue?",
        a: "{MEAN} a month on average, {TOTAL} across the {MONTHS} months from {WINDOW} \u2014 but that figure is broader than roof replacement. Austin publishes no roof-specific permit class, so these are permits whose work class, permit type or description mentions a roof, and rooftop solar is the single largest contributor. Read it as roof-related construction activity.",
      },
      {
        q: "What counts as a roofing permit in Austin?",
        a: "{TYPES_SENTENCE} A text match cannot distinguish a re-roof from a rooftop solar array, a rooftop equipment change-out, an electrical mast passing through a roof, or a sign permit for a business with \u201cRoofing\u201d in its name \u2014 all of which are in this count, because all of them are what the city wrote down.",
      },
      {
        q: "Do you need a permit to replace a roof in Austin?",
        a: "A re-roof in the City of Austin requires a building permit, normally pulled by the roofing contractor as part of the job. Because Austin files those under general work classes rather than a dedicated roofing class, they are harder to count than to obtain. Whether your specific job needs one is a question for Austin's Development Services Department; the permit record shows what was issued, not what the rule requires.",
      },
      {
        q: "Is roofing work in Austin seasonal?",
        a: "{SEASON_SENTENCE} Bear in mind that this series mixes roof replacement with rooftop solar, so part of what moves through the year is solar installation rather than roofing demand.",
      },
      {
        q: "What does a roof replacement cost in Austin?",
        a: "We do not publish that, and this data cannot support it. Austin's permit record carries valuation fields, but the coalesced value has a median of 1 and the trade-named fields carry whole-project construction values rather than trade costs. Declared valuation is in any case an applicant's fee-basis statement to the city rather than a paid invoice. A credible cost figure needs a different source \u2014 contractor-reported job data, insurance claim settlements, or a materials-and-labour index \u2014 none of which we hold.",
      },
      {
        q: "How do you tell if a roof has hail damage?",
        a: "From the ground, and then with someone qualified on the roof. Look for dents on gutters, downspouts, vents and any metal flashing \u2014 soft metal shows a strike before shingles do \u2014 and for granules collecting at downspout outlets. Photograph what you find with the date. What we can tell you from the public record is whether NOAA logged hail in your county in the window we hold; what we cannot tell you is whether your roof was hit, because no public dataset records that.",
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
      AUSTIN_PERMIT_SOURCE,
      {
        name: "NOAA Storm Events Database (NCEI)",
        used: "Storm events recorded in Travis County, by type. Published on a two-to-four-month lag, which the page states rather than smoothing over.",
        url: "https://www.ncdc.noaa.gov/stormevents/",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "U.S. Drought Monitor",
        used: "Weekly drought category for Travis County.",
        url: "https://droughtmonitor.unl.edu/",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "Texas Department of Licensing and Regulation",
        used: "Which trades Texas licenses, and the absence of roofing among them.",
        url: "https://www.tdlr.texas.gov/licenses.htm",
        checkedByHumanOn: "2026-09-04",
      },
      THI_METHODOLOGY,
    ],
    omitted: [
      {
        reading: "A count of roof replacements, as opposed to roof-related permits",
        needed:
          "A roofing permit class Austin does not publish, or a description field structured enough to separate a re-roof from a rooftop solar install reliably. Neither exists, which is why this page states the composition instead of quietly presenting the total as replacement volume.",
      },
      {
        reading: "Roof age, or how much of the local housing stock is due for replacement",
        needed:
          "Parcel-level year-built data, and a prior re-roof date per parcel. We do not ingest Travis Central Appraisal District records, and no public source records when a specific roof was last replaced.",
      },
      {
        reading: "Hail exposure scored per ZIP or neighbourhood",
        needed:
          "A signal that varies within the metro. NOAA storm events carry a county, not a ZIP, and every other Austin feed we hold is metro- or county-level \u2014 so a per-ZIP hail score would be invented, not measured.",
      },
      {
        reading: "Typical roof replacement cost, or a cost range by material",
        needed:
          "A cost source that is not permit valuation. Blocked, not merely unbuilt \u2014 measured end to end in docs/audits/round-6-permit-measurement.md.",
      },
      {
        reading: "Insurance claim rates or average settlement for roof damage",
        needed:
          "Texas Department of Insurance loss data at county level. We ingest a TDI series for Austin, and it is a SAMPLE feed \u2014 a placeholder, not a measurement \u2014 so nothing on this page is drawn from it.",
      },
    ],
  },

  "austin/plumbing": {
    hero: {
      eyebrow: "AUSTIN PLUMBING PERMIT ACTIVITY",
      h1: "Plumbing work in Austin, measured from the city's own permit record",
      lede:
        "How many plumbing permits Austin issues, how steady the volume is through the year, and " +
        "the one local rule currently in force that changes what a household may do with water.",
      microcopy:
        "Counts and timing from the city's permit data \u00b7 No cost figures \u2014 permit valuation does not support them",
    },
    category: "plumbing",
    subjectNoun: "plumbing",
    dataCaptionNoun: "Plumbing",
    costOmission: AUSTIN_COST_OMISSION,
    answerHeading: "How much plumbing work is happening in Austin?",
    dataHeading: "Austin plumbing permits, month by month",
    methodHeading: "How this count is put together",
    methodBody:
      "Austin issues one Plumbing Permit type and it is the only type that rolls into this " +
      "category, so these rows are identified by the city's own permit-type field rather than by " +
      "searching descriptions. A type match either holds or it does not; a text match quietly " +
      "inherits whatever a clerk happened to type. Note that this is one undifferentiated type \u2014 " +
      "Austin does not separate a sewer job from an irrigation job from a gas line in the permit " +
      "type, so nothing on this page can break the volume down by kind of plumbing work.",
    contextHeading: "What else bears on an Austin plumbing decision",
    context: [
      {
        heading: "Drought is the local condition most directly tied to buried supply and drain lines",
        body:
          "Central Texas clay soils shrink as they dry and swell as they rewet. That movement is a " +
          "documented contributor to stress on buried supply and drain lines, so a long dry stretch " +
          "is worth knowing about. This is the U.S. Drought Monitor reading for Travis County \u2014 a " +
          "county-level measurement, not a reading at any address.",
        topic: "drought",
      },
      {
        heading: "The rule that is actually in force this month",
        body:
          "A drought category describes conditions. Austin Water's drought-response stage describes " +
          "what the city currently permits \u2014 which watering days and hours apply, and therefore what " +
          "an irrigation repair can and cannot be tested on. It is the one reading in this layer " +
          "that is a rule rather than a measurement, and it is the reason this page carries an " +
          "Austin-only feed at all.",
        topic: "water-stage",
      },
    ],
    faqHeading: "Austin plumbing permit questions",
    faq: [
      {
        q: "How many plumbing permits does Austin issue?",
        a: "{MEAN} a month on average across the {MONTHS} months from {WINDOW}, {TOTAL} in total. These are plumbing permits issued by the City of Austin, counted from the city's own permit record.",
      },
      {
        q: "What counts as a plumbing permit in Austin?",
        a: "{TYPES_SENTENCE} Austin issues one general plumbing type rather than separating sewer, gas, irrigation and backflow work the way some Texas cities do, so this count is complete for the trade and cannot be broken down within it.",
      },
      {
        q: "Is plumbing activity in Austin going up?",
        a: "{TREND_SENTENCE} A change smaller than the counting noise on a monthly total of this size ({NOISE}) would not be distinguishable from ordinary month-to-month variation, so it would not be reported as a trend.",
      },
      {
        q: "When is plumbing work busiest in Austin?",
        a: "{SEASON_SENTENCE} A permit count records when work was FILED rather than when it was done, so read a busy month as a busy month for the permit desk as much as for the trade. Nothing here forecasts the next one.",
      },
      {
        q: "What does an Austin plumbing permit cost?",
        a: "We do not publish that, and this data cannot support it. Austin's permit record carries valuation fields, but the coalesced value has a median of 1 and the trade-named fields carry whole-project construction values rather than trade costs \u2014 the median valuation on a plumbing permit runs to six figures, which is the building it is attached to. Declared valuation is in any case an applicant's fee-basis statement to the city rather than a paid invoice. A cost figure needs a different source.",
      },
      {
        q: "Can I water my lawn in Austin right now?",
        a: "That depends on the drought-response stage currently in force, which is shown above with the date we last confirmed it. We publish the stage and link to Austin Water for the restrictions themselves, because those change with the stage and a mirrored copy of a rules list is the kind of thing that goes quietly out of date. Austin Water is the authority; we are reporting what it published.",
      },
    ],
    sourcesHeading: "Sources for this page",
    sources: [
      AUSTIN_PERMIT_SOURCE,
      {
        name: "U.S. Drought Monitor",
        used: "Weekly drought category for Travis County.",
        url: "https://droughtmonitor.unl.edu/",
        checkedByHumanOn: "2026-09-04",
      },
      {
        name: "Austin Water \u2014 drought response",
        used: "The drought-response stage currently in force. The stage only; the restrictions themselves are the city's to publish and are linked rather than mirrored.",
        url: "https://www.austintexas.gov/water/austin-water-drought-response",
      },
      THI_METHODOLOGY,
    ],
    omitted: [
      {
        reading: "Pipe-era reading \u2014 what supply material your neighbourhood's housing stock is likely to have",
        needed:
          "Parcel-level year-built data. We do not ingest Travis Central Appraisal District records. Census ACS gives a median home age for the metro, which is one number for all of Austin and does not change what anyone does this month.",
      },
      {
        reading: "Soil movement risk under this address",
        needed:
          "A soil map unit that says something. The USDA SSURGO reading we hold for Austin returns \u201cUrban land, 0 to 6 percent slopes\u201d \u2014 a classification that records the presence of pavement and buildings rather than the clay content the drought note above is about. Publishing it would look like an answer.",
      },
      {
        reading: "Percentile against comparable homes",
        needed:
          "A signal that varies within the metro. Every Austin feed we hold is metro- or county-level; nothing varies by ZIP, so a percentile would be fabricated.",
      },
      {
        reading: "Typical repipe or water-heater replacement cost",
        needed:
          "A cost source that is not permit valuation. Blocked, not merely unbuilt \u2014 see docs/audits/round-6-permit-measurement.md. The BLS median hourly wage we hold for Austin plumbers is not it: its newest record is from January 2025, and a wage is not a price.",
      },
    ],
  },
};

export function belowHeroSpec(location: string, service: string): BelowHeroSpec | undefined {
  return BELOW_HERO[`${location}/${service}`];
}
