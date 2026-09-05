/**
 * What /tools/ lists, as data.
 *
 * ── WHY EVERY ENTRY CARRIES A `wontDo` ────────────────────────────────────
 * A hub is where a reader decides whether to open a page, which makes it the
 * easiest place on the site to overstate one. The three tools each refuse
 * something specific and say so on their own pages; if the hub describes only
 * what they do, it quietly re-promises the thing the tool declines. So the
 * refusal travels with the description, in the same card, at the same weight.
 *
 * Descriptions are written from the BUILT PAGES, not from the design deck.
 * Round 25 and Round 27 both found that most of what the deck promised each
 * tool was unbuildable; a hub written from the deck would advertise the tools
 * that were not built.
 */

export interface HubTool {
  name: string;
  href: string;
  /** What the built page actually publishes. */
  description: string;
  /** The refusal the page makes, restated so the hub cannot outrun it. */
  wontDo: string;
}

export const WORKING_TOOLS: HubTool[] = [
  {
    name: "Plumbing Triage",
    href: "/tools/plumbing-triage/",
    description:
      "Five questions about water trouble happening right now. It opens with the gas-smell " +
      "question because that one cannot wait, then works through what to shut off and what to " +
      "look at. No account, no address, nothing stored.",
    wontDo:
      "It ends at what to check. It is not an inspection, it cannot see your house, and it " +
      "does not quote a repair or hand you to anyone.",
  },
  {
    name: "AC Lifespan",
    href: "/tools/ac-lifespan/",
    description:
      "How much cooling a typical year demands in Austin and San Antonio, from NOAA's " +
      "1991-2020 normals at one named weather station near each city; the published Texas " +
      "residential electricity rate; where a system age you enter sits against common " +
      "parts-warranty terms; and the position of the expired federal 25C credit.",
    wontDo:
      "It will not tell you when to replace your system. It has not seen it, and age alone " +
      "does not decide it.",
  },
  {
    name: "Roof Scan",
    href: "/tools/roof-scan/",
    description:
      "Confirmed hail reports by county from NOAA Storm Events — every county in each metro, " +
      "including the ones that reported none — re-roof permit activity counted separately for " +
      "each city by that city's own mechanism, and where Texas licensing does and does not apply.",
    wontDo:
      "Counts only, no hail sizes: the radar product's size column has no published unit. And " +
      "an area's storm record is not a statement about a particular roof.",
  },
  {
    name: "Home Dashboard",
    href: "/dashboard/",
    description:
      "Enter a ZIP and see the Home Stress Index for that area — one 0-100 score, the five " +
      "signals behind it, what changed since last week, and a link to how it is calculated. " +
      "Open, no account, nothing stored.",
    wontDo:
      "It describes conditions across an area, not damage to a home. It is not a prediction, " +
      "an inspection, or a probability of loss.",
  },
];

/**
 * The things this site does not publish, and the measurement that stopped each.
 *
 * ── WHY THIS REPLACED THREE PAGES ─────────────────────────────────────────
 * Until this round /tools/ listed QuickConnect, Home Risk Report and Cost
 * Calculators, each linking a noindexed placeholder saying "coming soon" or
 * "planned for later". Every one of the three is named in ROADMAP.md's
 * out-of-scope list, and the copy on two of them contradicted findings a later
 * round had already made — a cost calculator described as "in active
 * development" when HANDOFF records that the reachable free sources give
 * indices rather than prices, and a per-address risk report when Round 16c
 * measured that neither county publishes a street address to look one up by.
 *
 * Deleting the pages and saying the same thing once, with the measurement
 * attached, is both more honest and more useful: "we publish no cost figure
 * because Texas re-roof permit valuations are unpopulated" is a fact about
 * Texas permit data that stands on its own. "Coming soon" is not.
 */
export interface NotPublished {
  heading: string;
  body: string;
}

export const NOT_PUBLISHED: NotPublished[] = [
  {
    heading: "Repair and replacement cost figures",
    body:
      "We measured why. San Antonio's DECLARED VALUATION field is 0.00% populated on every " +
      "residential and trade permit type, and Austin's coalesced valuation has a median of 1 — " +
      "so neither city's permit record carries a usable cost. Declared valuation is in any case " +
      "an applicant's fee-basis statement to the city, not a paid invoice. The free national " +
      "alternatives publish price indices, which measure how prices moved rather than what a " +
      "job costs; the one source giving per-unit installed costs is subscription-licensed. " +
      "Publishing an index as though it were a price would be the same error as publishing a " +
      "permit valuation as one.",
  },
  {
    heading: "A report about one specific address",
    body:
      "Travis Central Appraisal District's improvement export carries no street address in any " +
      "member — the keys are internal parcel ids — and Bexar publishes no bulk export at all. " +
      "There is nothing to look a property up by, so everything on this site is a reading for a " +
      "ZIP, a county or a metro, and says which.",
  },
  {
    heading: "Introductions to contractors",
    body:
      "No mechanism exists and no list of companies exists. Our privacy page says so in the " +
      "present tense, and it will keep saying so until both a handoff and a legal read exist. " +
      "What we do publish is which Texas trades carry a state licence to check and which do not.",
  },
  {
    heading: "What your water is doing to your pipes",
    body:
      "This one is close. Austin Water publishes its treated hardness in its own water-quality " +
      "report — 70 ppm at the low end, 126 at the high, 93 on average — which is a usable, " +
      "utility-published figure for delivered water. San Antonio's equivalent has not been read " +
      "yet, and the USGS ambient samples that are easy to get measure untreated water in " +
      "streams and wells, which is a different question from what comes out of a tap. We are " +
      "not shipping a two-metro tool that works in one metro.",
  },
];
