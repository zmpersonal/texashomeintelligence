/**
 * Dated external facts that no feed carries.
 *
 * A page may state a fact we did not measure ONLY if it is cited to the
 * primary source and carries the date we confirmed it. That is the whole
 * contract of this file: name, primary URL, confirmed-on date.
 *
 * ── THESE GO STALE, AND THAT IS THE POINT ─────────────────────────────────
 * A tax-credit expiry is exactly the kind of fact that is correct on the day
 * it is written and wrong two sessions later, with nothing in the build to
 * notice. `reviewEveryDays` records the cadence each one must be re-checked
 * against its primary source; the cadence and the owner seam are written down
 * in HANDOFF.md, because a review interval that lives only in a code comment
 * is not a process.
 *
 * NEVER cite an aggregator, a news write-up, or an installer's blog for one of
 * these. The IRS notice below is cited to irs.gov and nothing else.
 */
export interface ServiceNotice {
  heading: string;
  body: string;
  sourceName: string;
  sourceUrl: string;
  /** ISO date this was last verified against the primary source. */
  confirmedOn: string;
  /** How often it must be re-verified. Recorded in HANDOFF.md. */
  reviewEveryDays: number;
  /**
   * Whether `sourceUrl` was confirmed to RESOLVE, as distinct from whether the
   * CLAIM was confirmed. They are different things and collapsing them is how a
   * citation quietly rots into a dead link.
   *
   * Round 12 set this on the roofing notice; Round 13b found out how right that
   * was — the owner opened the URL and it was DEAD. The flag is what made the
   * failure catchable by review instead of by a reader.
   *
   * ⚠️ ABSENT DOES NOT MEAN VERIFIED. Round 13b fetch-tested every external URL
   * the three San Antonio pages cite — all seven — and this sandbox's egress
   * proxy denies EVERY ONE of them, irs.gov, eia.gov, airnow.gov,
   * ncdc.noaa.gov, droughtmonitor.unl.edu and data.sanantonio.gov included.
   * Not one citation on this site has been fetch-verified from here. So absent
   * means only "not asserted either way", and the honest state of the whole set
   * is listed in HANDOFF.md as an owner action. Setting this to `false` records
   * a KNOWN-unverified link; it does not imply the unflagged ones are fine.
   */
  urlVerifiedByFetch?: false;
  /**
   * ISO date a HUMAN opened this URL and confirmed it resolves and says what it
   * is cited for. Deliberately a SEPARATE field from `urlVerifiedByFetch`:
   * a person clicking a link and a build issuing a request are different
   * evidence with different failure modes, and collapsing them would let one
   * stand in for the other. Round 14 set these after the owner opened all seven
   * cited URLs — which is how two of them turned out to be dead.
   */
  checkedByHumanOn?: string;
  /**
   * Whether the CLAIM'S WORDING has been checked against the source TEXT — as
   * distinct from the URL resolving. A live link under a paraphrase nobody read
   * is the quieter failure of the two, and Round 14 nearly shipped the inverse
   * error: it softened a claim that turned out to be verbatim correct, on a
   * suspicion it could not check.
   *
   * `true` means a human read the source and confirmed the wording. It does NOT
   * mean the build fetched anything — nothing here ever has. Pair it with
   * `wordingVerifiedOn`.
   */
  wordingVerifiedAgainstSource?: boolean;
  /** ISO date the wording was checked against the source text, by a human. */
  wordingVerifiedOn?: string;
}

/**
 * ── THE BUILD-TIME GATE (Round 10b) ───────────────────────────────────────
 * Round 10 wrote the cadence down and left enforcing it as a seam. A cadence
 * nothing checks is a comment, so this checks it: every notice is verified at
 * BUILD time, and one past its review date FAILS THE BUILD rather than
 * shipping quietly.
 *
 * The argument these pages make is that other people's pages are stale. A page
 * making that argument cannot be allowed to go stale itself without anyone
 * noticing — and "without anyone noticing" is the only failure mode that
 * matters here, because a wrong tax-credit date reads exactly like a right one.
 *
 * This is deliberately a HARD failure, not a warning. A warning in build output
 * is a thing nobody reads on the run that matters. The cost is real and
 * accepted: 90 days after `confirmedOn`, the build stops until a human opens
 * irs.gov, confirms the fact still holds, and moves the date. That is the
 * process the seam was asking for.
 *
 * It runs at module load, so anything that imports the notices — the page, the
 * build, `astro check` — triggers it. There is no path that renders a notice
 * without passing through it.
 */
/**
 * The clock this gate runs against.
 *
 * NOT `new Date()`, and this is the whole reason the gate works at all.
 * Astro evaluates modules under the Cloudflare Workers runtime, which freezes
 * the clock at the Unix epoch in global scope — measured during this round:
 * a module-level `new Date().toISOString()` returns `1970-01-01T00:00:00.000Z`
 * during `npm run build`. A staleness check written the obvious way compares
 * every review date against 1970, finds nothing overdue, and never fires. It
 * would have looked like a closed seam and been a decoration.
 *
 * `__THI_BUILD_TIME__` is injected by `astro.config.mjs` via Vite's `define`,
 * read in real Node when the config loads. Outside a Vite build — `tsx`, the
 * unit replay — the constant is undefined and the real system clock is used.
 */
declare const __THI_BUILD_TIME__: string | undefined;
export function buildNow(): Date {
  const injected = typeof __THI_BUILD_TIME__ === "string" ? __THI_BUILD_TIME__ : undefined;
  if (!injected) return new Date();
  const d = new Date(injected);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export interface StaleNotice {
  key: string;
  heading: string;
  confirmedOn: string;
  dueOn: string;
  daysOverdue: number;
  sourceName: string;
  sourceUrl: string;
}

/** Adding `reviewEveryDays` to any future dated claim opts it into this gate. */
export function reviewDueDate(notice: ServiceNotice): Date {
  const confirmed = new Date(notice.confirmedOn);
  if (Number.isNaN(confirmed.getTime())) {
    throw new Error(
      `serviceNotices: "${notice.heading}" has an unparseable confirmedOn ("${notice.confirmedOn}"). ` +
        `A dated claim whose date cannot be read is worse than an undated one.`,
    );
  }
  return new Date(confirmed.getTime() + notice.reviewEveryDays * 86_400_000);
}

/** Every notice whose review date has passed. Pure — takes `now` so it is
 * testable without waiting three months. */
export function staleNotices(
  notices: Record<string, ServiceNotice[]>,
  now: Date = new Date(),
): StaleNotice[] {
  const out: StaleNotice[] = [];
  for (const [key, list] of Object.entries(notices)) {
    for (const n of list) {
      if (!Number.isFinite(n.reviewEveryDays) || n.reviewEveryDays <= 0) {
        throw new Error(
          `serviceNotices: "${n.heading}" (${key}) has a non-positive reviewEveryDays ` +
            `(${n.reviewEveryDays}). Every dated volatile claim must carry a real cadence.`,
        );
      }
      const due = reviewDueDate(n);
      if (now.getTime() > due.getTime()) {
        out.push({
          key,
          heading: n.heading,
          confirmedOn: n.confirmedOn,
          dueOn: due.toISOString().slice(0, 10),
          daysOverdue: Math.floor((now.getTime() - due.getTime()) / 86_400_000),
          sourceName: n.sourceName,
          sourceUrl: n.sourceUrl,
        });
      }
    }
  }
  return out;
}

export function assertNoticesFresh(
  notices: Record<string, ServiceNotice[]>,
  now: Date = new Date(),
): void {
  const stale = staleNotices(notices, now);
  if (stale.length === 0) return;
  const lines = stale.map(
    (s) =>
      `  • ${s.key} — "${s.heading}"\n` +
      `      confirmed ${s.confirmedOn}, review was due ${s.dueOn} (${s.daysOverdue} day${s.daysOverdue === 1 ? "" : "s"} overdue)\n` +
      `      re-verify against: ${s.sourceName} — ${s.sourceUrl}`,
  );
  throw new Error(
    `\n\nBUILD STOPPED — ${stale.length} dated claim${stale.length === 1 ? " is" : "s are"} past ` +
      `${stale.length === 1 ? "its" : "their"} review date:\n\n${lines.join("\n\n")}\n\n` +
      `These are volatile facts on indexed pages. Open the primary source, confirm the claim still\n` +
      `holds, then update \`confirmedOn\` in src/data/serviceNotices.ts — or change the claim.\n` +
      `Do NOT move the date without re-reading the source: that is the one thing this check exists\n` +
      `to prevent.\n`,
  );
}

export const SERVICE_NOTICES: Record<string, ServiceNotice[]> = {
  "san-antonio/hvac": [
    {
      heading: "The federal 25C credit for HVAC equipment expired on December 31, 2025",
      body:
        "The Energy Efficient Home Improvement Credit under Internal Revenue Code section 25C — the " +
        "credit homeowners claimed for qualifying heat pumps, air conditioners and furnaces — was " +
        "ended by the One Big Beautiful Bill Act. The IRS states the test plainly: the credit " +
        "\u201Cwill not be allowed for any property placed in service after December 31, 2025.\u201D " +
        "Placed in service, not purchased — so equipment bought before July 4, 2025 but not placed in " +
        "service until after the cutoff does not qualify. There is no grandfather provision. " +
        "If a quote or an installer\u2019s page still prices the credit in, that is a reason to ask, " +
        "not a reason to hurry. " +
        "One qualification the IRS attaches to this guidance itself: these FAQs are not published in " +
        "the Internal Revenue Bulletin, so the IRS will not rely on them to resolve a case \u2014 " +
        "though a taxpayer who relies on them reasonably and in good faith is protected from " +
        "accuracy-related penalties.",
      sourceName:
        "IRS Fact Sheet 2025-05, Q1 — FAQs on the OBBB modification of sections 25C, 25D, 25E, 30C, 30D, 45L, 45W and 179D",
      // Round 14: was /newsroom/fs-2025-05, which the owner confirmed is DEAD.
      // This is the full FAQ slug, supplied by the owner.
      sourceUrl:
        "https://www.irs.gov/newsroom/faqs-for-modification-of-sections-25c-25d-25e-30c-30d-45l-45w-and-179d-under-public-law-119-21-139-stat-72-july-4-2025-commonly-known-as-the-one-big-beautiful-bill-obbb",
      checkedByHumanOn: "2026-09-04",
      urlVerifiedByFetch: false,
      // ROUND 14b RESTORED "placed in service", and the correction is worth
      // recording because the mistake was mine and it ran the wrong way.
      // Round 14 could not fetch irs.gov, suspected the statutory test might be
      // installation-completed, and SOFTENED A CLAIM THAT WAS VERBATIM CORRECT.
      // The owner read FS-2025-05 in full: Q1's table states for section 25C
      // that the credit "will not be allowed for any property placed in service
      // after December 31, 2025". The installation-completed test in Q7 is real
      // but governs section 25D, the residential clean energy credit — a
      // different section, stated in the same document. Two adjacent tests, and
      // the hedge picked the wrong one to worry about.
      // The lesson kept: hedging is not free. An unverified softening is still
      // an unverified change to what the page tells a reader.
      wordingVerifiedAgainstSource: true,
      wordingVerifiedOn: "2026-09-04",
      confirmedOn: "2026-09-04",
      // Statutory dates do not drift, but IRS guidance on them does, and a
      // successor credit would make this page wrong by omission rather than by
      // error. Quarterly is the cadence for a fact of this shape.
      reviewEveryDays: 90,
    },
  ],

  "san-antonio/roofing": [
    {
      heading: "Texas licenses HVAC, electrical and mold work. It does not license roofing.",
      // Round 14 NARROWED this to what the ONE cited page actually supports.
      // It previously said "no other Texas agency licenses it either" — true,
      // but TDLR's list shows what TDLR regulates, not what every Texas agency
      // does, and proving that negative needs a source no single page provides.
      // Rewriting was chosen over adding a second source for exactly that
      // reason. The contrast is untouched and fully sourced: three named trades
      // are on TDLR's list, roofing is not, and the practical guidance for a
      // homeowner — there is no licence number to check — is identical either
      // way.
      body:
        "The Texas Department of Licensing and Regulation publishes the list of occupations it " +
        "regulates. Air Conditioning and Refrigeration Contractors, Electricians, and Mold Assessors " +
        "and Remediators are on it. Roofing is not — so there is no TDLR licence number to ask a " +
        "roofer for, the way there is for the trades either side of it. " +
        "That does not make a roofer unqualified; it means a licence number is not the thing to check. " +
        "What is checkable: liability and workers' compensation insurance carried in the company's own " +
        "name, how long the business has traded under that name, and the manufacturer certification " +
        "behind whatever workmanship warranty is offered.",
      sourceName: "Texas Department of Licensing and Regulation — Programs Licensed and Regulated by TDLR",
      // Round 13b: was /programs.htm, which the owner confirmed is DEAD. This is
      // the live equivalent, and it carries both halves of the contrast on one
      // page: its program list includes Air Conditioning and Refrigeration,
      // Electricians, and Mold Assessors and Remediators, and roofing appears
      // nowhere on it.
      sourceUrl: "https://www.tdlr.texas.gov/licenses.htm",
      // STILL not fetched from here, and still not implied to be. The egress
      // proxy denies www.tdlr.texas.gov (connect_rejected, confirmed against the
      // proxy's own status endpoint on 2026-09-04), so the replacement URL is as
      // unchecked from this environment as the one it replaces. It was supplied
      // by the owner, who did open it — which is exactly the human check this
      // flag exists to route work to. It stays false until a fetch confirms it.
      urlVerifiedByFetch: false,
      checkedByHumanOn: "2026-09-04",
      confirmedOn: "2026-09-04",
      // An occupation entering state licensure is a legislative act, and the
      // Texas Legislature meets in regular session in odd-numbered years. A
      // half-year cadence catches a change well before a session's laws take
      // effect, without pretending a statutory fact needs monthly review.
      reviewEveryDays: 180,
    },
  ],
};

// Runs on import. Any page, build, or `astro check` that reaches the notices
// reaches this first.
assertNoticesFresh(SERVICE_NOTICES, buildNow());
