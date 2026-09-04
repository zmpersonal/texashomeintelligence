# Component State Inventory

Every state below needs a design. The happy path is roughly 20% of this list, and in San Antonio it is not the common case.

---

## 1. Address input (Type A, step 1)

| State | Notes |
|---|---|
| Empty / resting | Placeholder should show a format example, not "Enter address" |
| Typing, suggestions open | Provider-dependent; confirm provider before designing |
| No suggestions returned | Allow manual entry — don't trap the user |
| Selected, valid | |
| Outside coverage (not Austin/SA) | **Not an error.** Offer the ZIP-level dashboard + waitlist for their metro |
| Outside Texas | Different message; be gracious, don't pretend to serve them |
| Apartment / multi-unit detected | Tools assume single-family; say so and offer the data pages instead |
| Geocode succeeded, lookup failed | → degraded path |
| Rate-limited / provider down | Fall back to manual entry; never a dead end |

---

## 2. Property lookup result (Type A, step 2)

| State | Notes |
|---|---|
| Full match | Year built, sqft, stories prefilled and editable |
| Partial match | Some fields present, others blank and requested |
| **No record** | **The San Antonio default.** "We couldn't find records for this address — roughly when was it built?" Never render as an error. |
| Record found but user disputes it | Edit must be obvious. Edited fields reclassify to homeowner-reported and the label must visibly change |
| Stale record | Show as-of date; CAD data is annual with supplements |
| Loading | Multi-second joins are likely. Needs a real loading state, not a spinner — say what's being checked ("checking permit records…") |

---

## 3. Fact chips (free tier)

| State | Notes |
|---|---|
| Value present | Value + unit + label chip + as-of date |
| **Value absent, and that's meaningful** | "No permit on record" is a finding, not a blank — often means pre-digital or unpermitted work. Design a treatment that reads as informative |
| Value absent, genuinely unknown | Distinct from above. Don't conflate them |
| Homeowner-supplied value | Visibly different label; must not look like a records value |
| Value from a wider geography than requested | e.g. metro median because ZIP was below the volume floor. Must say so on the chip |
| Low confidence | Wider range or explicit hedge |

---

## 4. Gate steps (Type A, steps 3–5)

| State | Notes |
|---|---|
| Step resting / active / complete | Progress must be visible; user should know how many steps remain |
| Back navigation | Editing an earlier step without losing later input |
| Email invalid | Inline, non-punitive |
| Email already known | Returning user — don't make them re-enter everything |
| Submitting | |
| Submitted, report sending | |
| Send failed | Offer retry and show the report on screen anyway — never lose the user's work |
| Step 5 contractor options | Default selected = "just send my report." Contractor options must not be visually louder |
| Consent copy | Must render at the size it's stored at; this string is versioned and legally load-bearing |

---

## 5. Report output (Type A, post-gate)

| State | Notes |
|---|---|
| Full report | All sections populated |
| Partial report | Some sections unavailable due to missing data — show what exists, name what's missing |
| Range display | Low/mid/high with the band visible. Never a single number |
| Wide range (low confidence) | Visually distinct from a tight range |
| Handoff to QuoteReady | Tool facts flow into the brief; must not feel like starting over |

---

## 6. Calculator (Type B)

| State | Notes |
|---|---|
| Defaults loaded | Should show a usable number before any input — no empty state |
| Input changed, recomputing | |
| Result: ZIP-level | Show n and geography |
| Result: aggregated to metro | Below volume floor. Must say "based on metro data — not enough local permits" |
| Result: aggregated to state | Same, one level up |
| Below floor entirely | Withhold the number rather than publish something thin |
| Escalation note | "Escalated to [month] using published price indexes" + method link |
| Model version | Visible, small |

---

## 7. Triage (Type C)

| State | Notes |
|---|---|
| Symptom selection | Large tap targets; majority mobile, often one-handed, often stressed |
| Branch step | One question at a time |
| **Safety-critical branch** | Gas smell, sewage backup, electrical + water. Must interrupt the flow and dominate the screen. Design this as its own layout, not a warning banner |
| Shutoff instruction | Given free, first, before anything else. Should be the most legible thing on the page |
| Verdict: emergency | |
| Verdict: urgent but not emergency | |
| Verdict: can wait | |
| Cost range | Same range component as Type B |
| "3 questions to ask" | Copyable |
| Optional QuoteReady handoff | End of flow only. Never gates the useful content |
| Back / restart | Users will mis-tap under stress |

---

## 8. Global

| State | Notes |
|---|---|
| Loading (any data join) | |
| Feed unavailable | Name which feed and when it was last confirmed. Don't hide the outage |
| Data stale beyond threshold | Show it. The dual-date convention already on the site handles this |
| JS disabled / slow connection | Type C should degrade to a usable static flow |
| Reduced motion | |
| Screen reader | Label chips carry meaning and must be announced, not decorative |

---

## 9. Hub (`/tools/`)

| State | Notes |
|---|---|
| Nine cards, two experience types | "Instant, no email" vs "free report by email" must be scannable |
| Tool unavailable in user's metro | Card present, state noted — don't hide it |
| Tool not yet live | Omit the card. Do **not** design a "coming soon" state; hold the route instead |
