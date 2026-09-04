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
}

export const SERVICE_NOTICES: Record<string, ServiceNotice[]> = {
  "san-antonio/hvac": [
    {
      heading: "The federal 25C credit for HVAC equipment expired on December 31, 2025",
      body:
        "The Energy Efficient Home Improvement Credit under Internal Revenue Code section 25C — the " +
        "credit homeowners claimed for qualifying heat pumps, air conditioners and furnaces — terminated " +
        "for property placed in service after December 31, 2025 under the One Big Beautiful Bill Act. " +
        "There is no grandfather provision: equipment purchased before July 4, 2025 but installed after " +
        "the expiry does not qualify. If a quote or an installer's page still prices the credit in, that " +
        "is a reason to ask, not a reason to hurry.",
      sourceName: "IRS Fact Sheet 2025-05",
      sourceUrl: "https://www.irs.gov/newsroom/fs-2025-05",
      confirmedOn: "2026-09-04",
      // Statutory dates do not drift, but IRS guidance on them does, and a
      // successor credit would make this page wrong by omission rather than by
      // error. Quarterly is the cadence for a fact of this shape.
      reviewEveryDays: 90,
    },
  ],
};
