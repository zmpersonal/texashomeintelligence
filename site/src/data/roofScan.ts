/**
 * Roof Scan — all user-facing copy and every constant, as data.
 *
 * Same reason as `plumbingTriage.ts` and `acLifespan.ts`: copy in a config file
 * can be reviewed as copy, and a replay can assert on it without parsing markup.
 *
 * ── THE NAME IS INHERITED; NOTHING HERE SCANS A ROOF ──────────────────────
 * The design brief calls this "Roof Scan" and opens it with a satellite image
 * and a footprint drawn over the reader's house. That image cannot be built —
 * see docs/audits/round-27-roof-scan.md — and more importantly the reading it
 * implies cannot be made. This tool has not seen anyone's roof. It publishes
 * what two NOAA products and one city permit series recorded over an AREA, and
 * it says which product each number came from, because the two hail products
 * disagree and that disagreement is the most useful thing on the page.
 *
 * ── THE ONE RULE THIS FILE EXISTS TO HOLD ─────────────────────────────────
 * No size, no unit, no cost, no damage, no replacement timing. SWDI's MAXSIZE
 * column has no published unit — 0.75 and 1.5 are as consistent with inches as
 * with anything else, and inches and millimetres are a factor of 25 apart — so
 * this tool ships COUNTS. Storm Events does document its magnitude in inches,
 * and that size is still not printed here: a hail size measured at an
 * observation point is not a size at a reader's address, and a page that prints
 * one number in inches beside another product's unitless count invites the
 * reader to read both as inches.
 */

/** The two launch metros, in the order the page renders them. */
export const METROS = [
  { id: "austin", label: "Austin" },
  { id: "san-antonio", label: "San Antonio" },
] as const;

export type MetroId = (typeof METROS)[number]["id"];

export const COPY = {
  eyebrow: "TOOL",
  h1: "What the record shows about hail and roofing work in your area",
  lede:
    "Two NOAA products and one city permit series, each named, each with the period it covers. " +
    "The two hail products do not agree with each other, and the page shows you both rather " +
    "than picking the more dramatic one.",
  /** The promise and the refusal in the same breath, above the fold. */
  honestyLine:
    "This tool has not seen your roof. It cannot tell you whether yours is damaged, whether it " +
    "needs replacing, or when — only what was recorded over the area around you.",

  zipHeading: "Which area?",
  zipBody:
    "Enter a ZIP and we will say which county it sits in and put that county's reading first. " +
    "Both metros are on this page either way. Nothing is stored and nothing is sent anywhere.",
  zipLabel: "ZIP code",
  zipHint: "Five digits. Austin and San Antonio metros.",
  /** The label chip beside the ZIP field, before and after entry. Requirement 4
   * of data-labeling-spec.md: it must change visibly at the moment of edit. */
  zipBucketEmpty: "Nothing entered",
  zipBucketFilled: "Your ZIP — area readings, not your address",
  zipEmptyState: "Enter a ZIP above and we will name its county. Until then, both metros are below.",
  zipNoJs:
    "Narrowing to your county needs JavaScript, because it is a lookup on something you type. " +
    "Everything else on this page is already in the page: both metros' confirmed-hail counts by " +
    "county, both permit readings, and the licensing position are all below, whether scripts run " +
    "or not.",

  radarHeading: "Radar hail signatures",
  radarBody:
    "NOAA's Severe Weather Data Inventory records the storm cells NEXRAD flagged as probably " +
    "producing hail. A signature is a radar detection over a box on the map. It is not a report " +
    "that hail fell, and it is not a report about any address.",

  confirmedHeading: "Confirmed hail reports",
  confirmedBody:
    "NOAA's Storm Events Database records hail that a person reported and the National Weather " +
    "Service accepted. It is filed by county, it runs months behind the weather because a human " +
    "confirms each entry, and it is a much smaller number than the radar one. Both are true.",

  differenceHeading: "Why the two hail numbers do not match, and why we show both",

  permitsHeading: "Re-roofing work on the public record",
  /**
   * Read before the two numbers, not after. HANDOFF records that the metros'
   * roofing counts differ 3.27x for measurement-method reasons alone, so the
   * comparison a reader would make unprompted is the one fact this section
   * must head off.
   */
  permitsBody:
    "Each city is counted by its own mechanism, and the two mechanisms are not the same " +
    "instrument. San Antonio publishes a dedicated Re-Roof Permit class and we count it. Austin " +
    "publishes no roofing permit type at all, so its figure is a text match on the permit " +
    "description — which sweeps in rooftop solar, rooftop equipment and anything else whose " +
    "wording happens to contain the word. Read each number against its own city over time. " +
    "Setting one against the other would measure the difference between two permit vocabularies, " +
    "not a difference between roofs.",

  licenceHeading: "Who is allowed to do the work",

  limitsHeading: "What this tool cannot see",
  sourcesHeading: "Where these numbers come from",
} as const;

/**
 * The radar-versus-confirmed explainer. This is the centre of the tool, not a
 * footnote, so it is a section of its own with its own heading — a reader who
 * skims must still come away knowing the two numbers measure different things.
 */
export const DIFFERENCE: { heading: string; body: string }[] = [
  {
    heading: "One is a radar detection, the other is a person",
    body:
      "A radar hail signature is an algorithm's read of a storm cell's reflectivity profile — " +
      "NEXRAD saying this cell probably contains hail. A confirmed report is someone who saw " +
      "hail, told the National Weather Service, and had it accepted into the record. A storm " +
      "can throw dozens of signatures across a metro and produce no confirmed report at all, " +
      "because nobody was standing where it fell or nobody called it in.",
  },
  {
    heading: "They are not counted over the same shape",
    body:
      "Storm Events files by county. The radar product returns no county at all, so its records " +
      "are pulled over a box drawn around a single reference point for each metro — which is not " +
      "a county, does not follow any boundary, and includes and excludes places a county line " +
      "would not. Nothing on this site converts one shape into the other.",
  },
  {
    heading: "Neither one is a statement about a house",
    body:
      "A signature over a metro box and a report filed for a county are both area readings. " +
      "Neither says hail struck a particular roof, and no arithmetic on this page can get from " +
      "one to the other. What they are good for is knowing whether this was a season worth " +
      "looking at your roof after.",
  },
];

/**
 * The refusals, on the page rather than in a comment. Each names the thing and
 * the reason, because "we can't do that" without a reason reads as a feature
 * that is coming soon.
 */
export const LIMITS: { heading: string; body: string }[] = [
  {
    heading: "Whether your roof is damaged",
    body:
      "We have not seen it, and nothing in these feeds is about your address. Hail recorded a " +
      "mile away tells you the season was worth a look; it does not tell you what it did to your " +
      "roof. That is what a person on a ladder is for.",
  },
  {
    heading: "How big the hail was",
    body:
      "The radar product's size column has no published unit. NOAA's own REST usage " +
      "documentation for this service does not define the columns and does not mention that " +
      "field at all, and the values are as consistent with inches as with anything else — and " +
      "inches and millimetres are a factor of twenty-five apart. So this page publishes counts " +
      "and no sizes. A number whose unit we would be guessing at is worse than no number.",
  },
  {
    heading: "Your roof's age, area, or what a replacement would cost",
    body:
      "There is no route to any of the three. Travis Central Appraisal District publishes no " +
      "street address in its improvement export, so nothing can be looked up by address, and " +
      "Bexar publishes no bulk export at all. Building-footprint data that would give a roof " +
      "area was set aside on licensing grounds. And the declared valuation on a permit is an " +
      "applicant's fee-basis statement to the city, not a paid invoice, so it is not a cost.",
  },
  {
    heading: "When to replace it",
    body:
      "We are not going to guess. Age alone does not decide it, a hail season does not decide " +
      "it, and neither does a permit filed down the street. A tool that turned an area's storm " +
      "record into a replacement date for your house would be selling something, not measuring " +
      "anything.",
  },
];

/**
 * Where the two things this round does NOT build would attach, recorded here so
 * the round that builds them does not have to re-derive the layout.
 *
 *  GATE      — between `#your-area` and `#radar-signatures`. Everything above
 *              it is one field the reader already knows; everything below is
 *              area-level published data, in the order a gate would need to
 *              move it. Nothing below the slot depends on anything else below
 *              it, so a gate can be inserted without rewriting a block.
 *  REFERRAL  — after `#limits`, never before it, and after `#licensing` in
 *              particular: a reader should learn that Texas does not license
 *              roofing contractors BEFORE being offered an introduction to
 *              one. Round 24's /privacy/ states that nothing is shared with any
 *              company and that no list of companies exists; that stays true
 *              until a handoff mechanism and a legal read exist, so the slot is
 *              a comment in the markup and nothing else.
 */
export const SLOTS = { gateAfter: "#your-area", referralAfter: "#limits" } as const;
