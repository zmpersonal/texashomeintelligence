/**
 * Plumbing Triage — every user-facing string, and nothing else.
 *
 * ── WHY THE COPY IS DATA ──────────────────────────────────────────────────
 * `docs/source/design/tools/copy-deck-plumbing-triage.md` is the source of
 * truth and Round 18's brief is explicit: *"Use the copy deck verbatim — do
 * not rewrite, summarise, or improve any user-facing string."* Keeping the
 * strings in one config rather than scattered through markup makes that
 * checkable — a reviewer diffs this file against the deck, and the component
 * has no prose of its own to drift.
 *
 * ── WHAT THIS TOOL DELIBERATELY DOES NOT HAVE ─────────────────────────────
 *  - **No cost figure, anywhere.** Owner decision, Round 18. The design's
 *    `Typical cost in Austin` panel sourced a range to city permit valuation,
 *    which `docs/audits/round-6-permit-measurement.md` measured as unusable in
 *    both metros — San Antonio's DECLARED VALUATION 0.00% populated, Austin's
 *    plumbing field a whole-project median near $900k. A national figure would
 *    be a different claim in the same box, so the box is gone.
 *  - **No contractor or referral handoff.** Paths end at the verdict.
 *    `verdictFooter` is where a referral block would later slot in; the room is
 *    left and nothing fills it. Utility and emergency instructions — 911, the
 *    electric utility, the gas utility — are NOT trade referral and stay.
 *  - **No four-bucket freshness labels.** Round 17c's test: the badge attaches
 *    to a READING, and this tool reads no dataset. Every string here is general
 *    guidance, which is why it ships in both metros with no feed and no gate.
 *  - **No address, no autocomplete, no email gate.** Ungated by design.
 */

/** A screen the flow can be on. `end: true` screens have no way forward. */
export interface Choice {
  label: string;
  to: string;
  /** Rendered as a link rather than a flow step — 911 and utility calls. */
  href?: string;
}

export interface Screen {
  id: string;
  /** Small line above the headline. */
  eyebrow?: string;
  headline: string;
  /** Paragraphs under the headline, in order. */
  body?: string[];
  /** Numbered steps. Used by the electrical interrupt. */
  steps?: string[];
  /** The line after the steps, emphasised. */
  emphasis?: string;
  /** Attribution shown under the instruction. Not a data reading — see the
   * header note on labels. */
  sourceLine?: string;
  choices?: Choice[];
  /** Back target. Every screen except the entry has one. */
  back?: string;
  /**
   * A full-bleed screen with nothing but its own instruction: the shutoff and
   * the two interrupts. `page-brief.md`: *"the shutoff instruction is the most
   * important layout in the entire product… nothing else on screen competes."*
   */
  focus?: boolean;
  /** Terminal. The electrical interrupt: no verdict, no checks, no questions. */
  end?: boolean;
  verdict?: Verdict;
}

export interface Verdict {
  title: string;
  body: string;
  lookAt: string[];
  stopLooking: string;
  questions: string[];
}

/** The three questions shared by the five Path 1 verdicts.
 *
 * ⚠️ REPORTED AS A GAP, NOT WRITTEN HERE. The delivered deck supplies a
 * three-questions block for paths 2–5 and omits one for path 1. These are the
 * authored strings from `Plumbing Triage.dc.html`, which storyboards exactly
 * this path — carried across rather than newly composed. See the Round 18
 * report. */
const PATH1_QUESTIONS = [
  "Is this a repair to one fixture or a symptom of the supply line?",
  "What's the diagnostic fee, and does it come off the repair if I go ahead?",
  "Does this work need a permit, and are you pulling it?",
];

export const ENTRY = {
  h1: "Water trouble? Start here.",
  sub:
    "Five questions, no account, no address. We'll tell you what to shut off, what to look at, " +
    "and when to stop looking.",
  footerLine: "This tells you what to check. It isn't an inspection and it can't see your house.",
};

export const VERDICT_FOOTER =
  "This is general guidance for Texas homes, not a diagnosis of yours. We haven't seen your " +
  "house and can't tell you what's wrong with it.";

export const SCREENS: Screen[] = [
  // ── gas pre-screen — before everything ──────────────────────────────────
  {
    id: "gas-check",
    headline: "Do you smell gas near the water heater?",
    body: ["We ask first because everything else can wait and this can't."],
    choices: [
      { label: "Yes, or I'm not sure", to: "gas-stop" },
      { label: "No gas smell", to: "symptoms" },
    ],
  },
  {
    id: "gas-stop",
    eyebrow: "Stop",
    headline: "If you smell gas, leave the house now.",
    body: [
      "Don't flip switches. Don't use your phone inside.",
      "Call 911 and your gas utility from outside.",
      "Do not continue with this tool.",
    ],
    focus: true,
    end: true,
    choices: [{ label: "Call 911", to: "", href: "tel:911" }],
    back: "gas-check",
  },

  // ── symptom list ────────────────────────────────────────────────────────
  {
    id: "symptoms",
    headline: "What's happening?",
    choices: [
      { label: "Water on the floor", to: "shutoff" },
      { label: "No hot water", to: "v-hot-water" },
      { label: "Sewage smell", to: "sewage-stop" },
      { label: "No water at all", to: "v-no-water" },
      { label: "The bill went up", to: "v-bill" },
    ],
    back: "gas-check",
  },

  // ── PATH 1 ──────────────────────────────────────────────────────────────
  {
    id: "shutoff",
    eyebrow: "Before anything else",
    headline: "Shut off the water.",
    body: [
      "For a single fixture, the valve is usually under it — turn clockwise.",
      "For the whole house, the main is typically near the street or where the line enters.",
      "If you can't find it or it won't turn, shut off the water heater too and call a plumber now.",
    ],
    focus: true,
    choices: [
      { label: "Water is off — what now?", to: "electrical-check" },
      { label: "I can't shut it off", to: "electrical-check" },
    ],
    back: "symptoms",
  },
  {
    id: "electrical-check",
    headline: "Is the water near anything electrical?",
    body: [
      "An outlet, a power strip, an appliance, a breaker panel, a furnace or water heater.",
      "Do not walk into standing water to find out. Look from where you are.",
    ],
    choices: [
      { label: "Yes, or I can't tell from here", to: "electrical-stop" },
      { label: "No — the water is away from all of it", to: "where" },
    ],
    back: "shutoff",
  },
  {
    // TERMINAL. Round 18 item 4: no verdict, no checks, no onward navigation
    // except back. `end: true` is what the replay asserts against.
    id: "electrical-stop",
    eyebrow: "Stop. Stay out of the water.",
    headline: "Stop. Stay out of the water.",
    body: [
      "Water and live current together can be fatal on contact, and you cannot tell by looking " +
        "whether water is energised.",
      "Do not enter the water to reach the breaker panel. If the panel is somewhere you'd have " +
        "to wade to reach, leave it.",
      "From a dry place, outside if you can:",
    ],
    steps: [
      "Keep everyone and pets out of the room.",
      "Don't touch anything electrical — not a switch, not a cord, not an appliance.",
      "Call your electric utility and tell them there is standing water near electrical " +
        "equipment. They can cut power at the street.",
      "If anyone has been shocked, or you smell burning, call 911 first.",
    ],
    emphasis:
      "Don't go into the water until the utility has confirmed the power is off. Don't touch a " +
      "breaker with wet hands or while standing on anything wet.",
    sourceLine: "Source: Electrical Safety Foundation International — Flooding and Disaster Safety",
    focus: true,
    end: true,
    back: "electrical-check",
  },
  {
    id: "where",
    headline: "Where is the water coming from?",
    choices: [
      { label: "Under a sink or behind a toilet", to: "v-fixture" },
      { label: "From the ceiling", to: "v-ceiling" },
      { label: "Around the water heater", to: "v-heater" },
      { label: "Coming up out of a drain", to: "v-drain" },
      { label: "I can't tell", to: "v-unknown" },
    ],
    back: "electrical-check",
  },

  // ── PATH 1 verdicts ─────────────────────────────────────────────────────
  {
    id: "v-fixture",
    headline: "A supply line or a seal at the fixture",
    back: "where",
    verdict: {
      title: "A supply line or a seal at the fixture",
      body:
        "Most floor water at a fixture comes from one of three places: the flexible supply line " +
        "feeding it, the shutoff valve behind it, or the seal where the fixture meets the floor. " +
        "The first two usually have their own valve within arm's reach, which is why this is the " +
        "one kind of leak you can often stop without touching the main.",
      lookAt: [
        "The braided line running from the wall or floor to the fixture — feel it dry, then feel it again in ten minutes",
        "The small oval valve where that line meets the wall, and the floor directly under it",
        "Around the base of a toilet, and the tank bolts if it's a toilet",
        "Whether the water is clear or dirty",
      ],
      stopLooking:
        "Once you've shut the fixture valve and the water stops spreading, you're done for " +
        "tonight. Cutting into a wall or floor to chase it further is work for someone with a " +
        "moisture meter.",
      questions: PATH1_QUESTIONS,
    },
  },
  {
    id: "v-ceiling",
    headline: "Water travelling from somewhere else",
    back: "where",
    verdict: {
      title: "Water travelling from somewhere else",
      body:
        "Ceiling water has almost never entered where you're seeing it. It runs along a joist or " +
        "a pipe and drops at the first low point, which can be a room away from the source. " +
        "That's why chasing the stain rarely finds it.",
      lookAt: [
        "What's directly above — a bathroom, a laundry, an air handler, or open roof",
        "Whether it's dripping steadily, or only when a fixture upstairs runs",
        "Whether the ceiling is sagging or holding a bulge of water",
        "Whether it started during or after rain",
      ],
      stopLooking:
        "If the ceiling is sagging, stop and stay out from under it — a filled ceiling can come " +
        "down all at once. Put a container under a steady drip and leave the rest.",
      questions: PATH1_QUESTIONS,
    },
  },
  {
    id: "v-heater",
    headline: "The tank, a fitting, or the pan drain",
    back: "where",
    verdict: {
      title: "The tank, a fitting, or the pan drain",
      body:
        "Water at the base of a heater is either a fitting above it that's been dripping down, " +
        "the relief valve doing its job, or the tank itself. The last one doesn't get better. In " +
        "Texas a lot of heaters sit in attics or upstairs closets, which is why a slow one can go " +
        "unnoticed until it reaches a ceiling.",
      lookAt: [
        "Whether it's dripping from a fitting at the top or seeping from the bottom seam",
        "The discharge pipe from the relief valve — if it's wet, the valve released",
        "Whether there's a drain pan under it, and whether the pan's drain line is clear",
        "Rust or mineral crust at the base",
      ],
      stopLooking:
        "Seeping from the bottom seam means the tank is done — nothing to check further. Shut the " +
        "water to the heater and turn off its gas or breaker.",
      questions: PATH1_QUESTIONS,
    },
  },
  {
    id: "v-drain",
    headline: "Water going the wrong way",
    back: "where",
    verdict: {
      title: "Water going the wrong way",
      body:
        "Water rising out of a drain is a blockage downstream, not a supply leak. Shutting the " +
        "main won't stop it. Anything you run — a sink, a washing machine, a shower — has to go " +
        "somewhere, and if the line is blocked it comes back up at the lowest opening.",
      lookAt: [
        "Which drains back up and which don't, and whether more than one does at once",
        "Whether flushing a toilet makes water rise somewhere else",
        "Whether it's clear water or sewage — if it's sewage, use the sewage path instead",
        "Whether there's a cleanout access outside, usually a capped pipe near the foundation",
      ],
      stopLooking:
        "Stop running water anywhere in the house — that's the whole intervention. More than one " +
        "fixture backing up at once means the blockage is in the main line, which is not a " +
        "plunger problem.",
      questions: PATH1_QUESTIONS,
    },
  },
  {
    id: "v-unknown",
    headline: "Find the edge before you find the source",
    back: "where",
    verdict: {
      title: "Find the edge before you find the source",
      body:
        "When the source isn't obvious the useful thing isn't guessing — it's establishing " +
        "whether it's still growing.",
      lookAt: [
        "Dry the edge of the water with a towel and mark where it ends. Check again in fifteen minutes",
        "Whether it's warm or cold to the touch",
        "Whether the sound of running water changes when you shut the main",
        "The lowest point in the room — water finds it, so the source is usually uphill",
      ],
      stopLooking:
        "If shutting the main stops the spread, it's a supply leak and it can wait until morning. " +
        "If it keeps spreading with the main off, it's drainage or groundwater and it needs a " +
        "different answer.",
      questions: PATH1_QUESTIONS,
    },
  },

  // ── PATH 2 ──────────────────────────────────────────────────────────────
  {
    id: "v-hot-water",
    headline: "No hot water",
    back: "symptoms",
    verdict: {
      title: "No hot water",
      body:
        "Three things stop hot water: the heater lost its fuel or power, a safety cut out, or the " +
        "tank failed. Which one you're in is usually visible in a minute without tools. First, if " +
        "it's a gas heater and you smell gas anywhere near it — stop and use the gas path.",
      lookAt: [
        "Electric: whether the heater's breaker has tripped",
        "Gas: whether the pilot or burner is lit, and whether other gas appliances still work",
        "Whether the water is lukewarm rather than cold — that's a different problem than none at all",
        "Any water around the base — if there's water, use the water-on-the-floor path first",
        "The thermostat setting, if it's reachable and labelled",
      ],
      stopLooking:
        "Reset a tripped breaker once. If it trips again, stop and leave it — a breaker that " +
        "won't hold is telling you something. Don't relight a pilot more than once, and not at " +
        "all if you smell gas.",
      questions: [
        "How old is the heater, and is it under warranty?",
        "Is this the element, the thermostat, the valve, or the tank?",
        "If it's the tank, what does replacement include — permit, disposal, pan, expansion tank?",
      ],
    },
  },

  // ── PATH 3 ──────────────────────────────────────────────────────────────
  {
    id: "sewage-stop",
    eyebrow: "Health hazard",
    headline: "Raw sewage is a health hazard.",
    body: [
      "Keep people and pets out of the affected area.",
      "Don't run any more water into the system — no sinks, no laundry, no flushing.",
    ],
    focus: true,
    choices: [{ label: "Understood — what now?", to: "v-sewage" }],
    back: "symptoms",
  },
  {
    id: "v-sewage",
    headline: "A dry trap, a failed seal, or a vent problem",
    back: "sewage-stop",
    verdict: {
      title: "A dry trap, a failed seal, or a vent problem",
      body:
        "Sewer gas reaches you when the water barrier that normally blocks it is gone. Usually " +
        "that's a drain nobody's used in weeks and the trap has evaporated — common in a guest " +
        "bath or a floor drain. Less often it's a toilet seal or a blocked vent.",
      lookAt: [
        "Whether the smell is in one room or throughout",
        "Any drain that hasn't been used recently — run water in it for thirty seconds and see if the smell fades within the hour",
        "Whether a toilet rocks when you sit on it",
        "Whether it's worse after rain, or on windy days",
      ],
      stopLooking:
        "If running water in unused drains clears it, that was it. A smell that persists after " +
        "every trap is filled is a seal or a vent, and both are above what a look can settle.",
      questions: [
        "Did you find the source, or are you replacing parts to see what helps?",
        "If it's a vent, is the work on the roof or in the wall?",
        "What did you check to rule out a cracked line under the slab?",
      ],
    },
  },

  // ── PATH 4 ──────────────────────────────────────────────────────────────
  {
    id: "v-no-water",
    headline: "No water at all",
    back: "symptoms",
    verdict: {
      title: "No water at all",
      body:
        "Nothing coming out anywhere is usually upstream of the house — the meter, the main " +
        "valve, or the utility. Something coming out weakly, or at one fixture only, is a " +
        "different problem.",
      lookAt: [
        "Whether it's every fixture or just some — one dry fixture is that fixture's valve",
        "Whether the main shutoff got closed, including by anyone working on the house",
        "The meter, if you can reach it — whether the dial is moving with everything off",
        "Whether neighbours have water, which separates your house from the street",
        "Whether it's below freezing, or has been overnight",
      ],
      stopLooking:
        "If the whole street is out, it's the utility and there's nothing to check. If it froze, " +
        "don't apply heat to a pipe you can't see the whole length of — thawing a burst line just " +
        "moves the flood indoors.",
      questions: [
        "Is the problem on my side of the meter or the utility's?",
        "If it's a frozen line, what's the plan if it's already split?",
        "What would prevent this next winter, and what does that cost?",
      ],
    },
  },

  // ── PATH 5 ──────────────────────────────────────────────────────────────
  {
    id: "v-bill",
    headline: "The bill went up",
    back: "symptoms",
    verdict: {
      title: "The bill went up",
      body:
        "A jump with no change in habits is usually a leak that never surfaces — most often a " +
        "toilet flapper, which can pass hundreds of gallons a day silently. The meter settles it " +
        "in ten minutes.",
      lookAt: [
        "Turn everything off, then watch the meter's low-flow indicator. Movement with everything off means water is going somewhere",
        "Put a few drops of food colouring in each toilet tank, wait fifteen minutes, and check the bowl for colour",
        "Irrigation — a broken head or a stuck valve runs at night and leaves no evidence by morning",
        "Any warm or unusually green patch of ground on the water line's route",
        "Whether the utility changed rates or the billing period covered more days",
      ],
      stopLooking:
        "If the meter is still with everything off, there's no leak and the answer is in the bill " +
        "itself. If it's moving and no toilet colours, the leak is underground or under the slab " +
        "— that's the point to stop.",
      questions: [
        "How did you locate the leak — did you find it, or infer it?",
        "Is it under the slab, and if so what's the access plan?",
        "What's the repair if the pipe turns out to be worse than expected?",
      ],
    },
  },
];

/**
 * External sources this tool cites, in the shape `scripts/check-citations.ts`
 * reads. One entry today: ESFI, on the electrical interrupt.
 *
 * `urlVerifiedByFetch` is absent-meaning-unasserted for the same reason it is
 * everywhere on this site — no fetch from the build environment has ever
 * reached a citation host. `checkedByHumanOn` records the owner opening it.
 */
export const TOOL_CITATIONS = [
  {
    name: "Electrical Safety Foundation International — Flooding and Disaster Safety",
    used:
      "The electrical-and-water interrupt: do not enter a flooded area until the utility has " +
      "confirmed power is off, and do not touch a breaker with wet hands or while standing on a " +
      "wet surface.",
    url: "https://www.esfi.org/flooding-and-disaster-safety/",
    checkedByHumanOn: "2026-09-05",
    citedBy: "/tools/plumbing-triage/ electrical interrupt",
  },
];
