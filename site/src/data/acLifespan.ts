/**
 * AC Lifespan — all user-facing copy and every constant, as data.
 *
 * Same reason as `plumbingTriage.ts`: copy in a config file can be reviewed as
 * copy, and a replay can assert on it without parsing markup.
 *
 * ── WHAT THIS TOOL REFUSES TO DO, AND WHY IT IS NAMED "LIFESPAN" ANYWAY ────
 * The name is inherited from the design brief. The tool does NOT estimate a
 * lifespan, a replacement window, or a repair-versus-replace verdict. It has
 * not seen the equipment, does not know its condition, and cannot know whether
 * it has already been replaced — a system swapped without a permit leaves no
 * trace anywhere this site can read. Converting an entered age into "time to
 * replace" would be a lead funnel wearing a data product's clothes, and it
 * would be wrong for exactly the homeowner who already fixed the problem.
 *
 * What it does instead: three published facts about the metro, one industry
 * convention stated as a convention, and a clear statement of what it cannot
 * see. `LIMITS` is not a disclaimer at the bottom; it is a section of the tool.
 */

/** The two launch metros, in the order the page renders them. */
export const METROS = [
  { id: "austin", label: "Austin" },
  { id: "san-antonio", label: "San Antonio" },
] as const;

export type MetroId = (typeof METROS)[number]["id"];

/**
 * The parts-warranty convention.
 *
 * ⚠️ STATED AS AN INDUSTRY CONVENTION, NOT AS A FACT ABOUT ANYONE'S UNIT, and
 * not attributed to any manufacturer — no manufacturer's warranty document has
 * been read for this. Registration windows, what "parts" covers, whether labour
 * is included at all, and whether any of it survives a change of owner vary by
 * brand and by model. The tool says so on the page, not only here.
 */
export const WARRANTY = {
  registeredYears: 10,
  unregisteredYears: 5,
  termLine:
    "Manufacturers commonly offer a 10-year parts warranty if the unit was registered shortly " +
    "after installation, and 5 years if it was not.",
  varianceLine:
    "That is a common pattern across the industry, not a fact about your unit. Registration " +
    "deadlines, what counts as a covered part, whether labour is included, and whether any of it " +
    "transfers to a new owner all vary by manufacturer and by model. Your own paperwork, or the " +
    "model and serial number on the outdoor unit, is the only thing that settles it.",
} as const;

/** Verdicts keyed by where an entered age falls. No verdict recommends anything. */
export const WARRANTY_VERDICTS = {
  withinBoth:
    "A system that age is inside both terms — the 5-year one as well as the 10-year one.",
  registeredOnly:
    "A system that age is inside the 10-year registered term and outside the 5-year unregistered " +
    "one. Whether that helps you depends entirely on whether it was registered.",
  outsideBoth:
    "A system that age is outside both terms. Parts coverage from the manufacturer has usually " +
    "ended by then.",
} as const;

export const COPY = {
  eyebrow: "TOOL",
  h1: "What we can tell you about air conditioning in your metro",
  lede:
    "Three published measurements and one industry convention. Enter how old your system is and " +
    "we will tell you where that sits against the usual parts-warranty terms — and nothing else, " +
    "because nothing else would be honest.",
  /** The promise and the refusal, in the same breath, above the fold. */
  honestyLine:
    "This tool will not tell you when to replace your system. It has not seen it.",

  ageHeading: "How old is your system?",
  ageBody:
    "If you know roughly when it was installed, enter the age in years. This is the only thing " +
    "you tell us, it stays in your browser, and nothing is stored or sent anywhere.",
  ageLabel: "Age in years",
  ageHint: "A whole number. Leave it blank if you are not sure.",
  /** The label chip before anything is entered, and after. Requirement 4 of
   * data-labeling-spec.md: the label must change visibly at the moment of edit. */
  ageBucketEmpty: "Nothing entered",
  ageBucketFilled: "Homeowner-reported",
  ageEmptyState:
    "Enter an age above and this becomes a statement about the number you entered. Until then, " +
    "here is the convention itself.",
  ageNoJs:
    "This part needs JavaScript, because it is arithmetic on something you type. Everything else " +
    "on this page is already in the page — both metros' cooling load, the electricity rate, the " +
    "tax-credit position and the warranty terms are all above and below, whether scripts run or not.",

  coolingHeading: "How hard a typical year works a system here",
  coolingBody:
    "Cooling degree days measure how much cooling a period demanded — not how hot it felt, and " +
    "not what anything cost. Both metros are shown, from the 30-year normal at one named weather " +
    "station near each city.",

  rateHeading: "What electricity costs in Texas",
  rateBody:
    "The published statewide residential rate. We show the rate and stop there: turning it into " +
    "a monthly bill, a running cost or a payback period needs this home's actual consumption, " +
    "which we do not have and will not assume.",

  creditHeading: "The federal tax credit",

  limitsHeading: "What this tool cannot see",
  sourcesHeading: "Where these numbers come from",
} as const;

/**
 * The refusals, on the page rather than in a comment. Each names the thing and
 * the reason, because "we can't do that" without a reason reads as a feature
 * that is coming soon.
 */
export const LIMITS: { heading: string; body: string }[] = [
  {
    heading: "Whether your system has already been replaced",
    body:
      "A replacement done without a permit leaves no record anywhere we can read. If your unit " +
      "was swapped five years ago and nobody filed for it, every figure on this page still " +
      "describes the metro correctly and says nothing about your house.",
  },
  {
    heading: "The age of your equipment",
    body:
      "We do not know it and cannot look it up. Travis Central Appraisal District's improvement " +
      "export carries no street address at all, so there is nothing to look your house up by, " +
      "and Bexar publishes no bulk export. The export does record that a property has an HVAC " +
      "system, but whether the year on that record is the equipment's or the building's has " +
      "never been established, and we will not build on a field whose meaning we have not " +
      "checked. So the age on this page is the number you typed, labelled as the number you " +
      "typed.",
  },
  {
    heading: "Its condition, its size, or whether it is right for your house",
    body:
      "Sizing is an engineering calculation from the building's envelope, its ductwork and its " +
      "orientation. We have none of that, and a number produced without it would be worse than " +
      "no number.",
  },
  {
    heading: "When to replace it",
    body:
      "We are not going to guess. Age alone does not decide it — a well-maintained fifteen-year-old " +
      "system can outlast a neglected eight-year-old one, and the question turns on condition, " +
      "repair history and what a specific failure would cost. A tool that turned your age into a " +
      "replacement date would be selling something, not measuring anything.",
  },
];

/**
 * Where the two things this round does NOT build would attach, recorded here
 * so the round that builds them does not have to re-derive the layout.
 *
 *  GATE      — between `#your-system` and `#cooling-load`. Everything above it
 *              is metro-level and free; everything below is the same today, so
 *              the gate would move the cooling-load, rate and credit blocks
 *              behind it without any of them being rewritten. The page is built
 *              in that order for exactly this reason.
 *  REFERRAL  — after `#limits`, never before it. A homeowner should read what
 *              the tool cannot see BEFORE being offered an introduction, not
 *              after. Round 24's privacy page states that nothing is shared
 *              with any company and no list of companies exists; that stays
 *              true until a handoff mechanism and a legal read exist, so the
 *              slot is a comment in the markup and nothing else.
 */
export const SLOTS = { gateAfter: "#your-system", referralAfter: "#limits" } as const;
