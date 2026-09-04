# Copy Deck — Nine Tools

Real strings. Design against these, not placeholder text — the length and tone of these lines determine the layout.

Voice: plain, specific, unhurried. Short sentences. No exclamation marks. Never "Get Free Quotes." Never imply diagnosis. State what records show and what they don't.

---

## Global

**Trust line (every tool, near the action):**
> No phone number required. We don't ask for it, and we don't sell it.

**Source line pattern:**
> Source: [Feed name] · data through [date] · confirmed [date]

**Disclaimer (footer of every tool):**
> This organizes public records and information you provide. It is not an inspection, diagnosis, or professional evaluation.

**Geography fallback:**
> Not enough permits in [ZIP] for a local figure — this reflects [metro] instead.

**No record found:**
> We couldn't find property records for this address. That's common for newer construction and some unincorporated areas. Tell us roughly when it was built and we'll continue.

**Missing permit (a finding, not a blank):**
> No permit on record. In this area that usually means the work predates digital records, or it was done without a permit.

---

## `/tools/` hub

**H1:** Tools for Texas homeowners
**Sub:** Nine free tools built on public records — storm history, permits, drought, and published price data. Most run instantly. A few send a report.

Card labels: `Instant · no email` / `Free report by email`

| Tool | Card line |
|---|---|
| AC lifespan | How much life is left in your air conditioner |
| Roof scan | What your roof has been through, and what's next |
| Pipe report | What's likely behind your walls, and what your water is doing to it |
| Storm check | Was your house in the path, and does it still matter |
| Roof cost calculator | What a roof replacement runs in your area |
| AC cost calculator | What a system replacement runs in your area |
| Water heater calculator | Replacement cost, and whether yours is overdue |
| Plumbing triage | Something's wrong right now — start here |
| AC triage | Not cooling? Find out if it's serious |

---

## `ac-lifespan` (reference implementation)

**H1:** How much life is left in your AC
**Sub:** Texas runs air conditioners harder than almost anywhere. Enter your address and we'll pull the permit history and tell you where your system likely stands.

**Step 1:** What's your address?
**Step 2:** Does this look right? — *Built [year] · [sqft] sq ft · Source: [CAD], as of [date]*
**Step 3 (optional):** Anything going on with it? — Cooling fine · Not keeping up · Uneven rooms · Getting loud · Just planning ahead

**Free chips:**
- System age — *Last mechanical permit: [year]* / *No mechanical permit on record*
- Local runtime — *[Metro] cooling load runs about [n]× the national average*
- Size check — *[n] tons for [sqft] sq ft*

**Gate:** Your report includes an estimated replacement window, cost range by system size, and what your current system likely costs to run each summer.

**Answer block (below hero):**
> A central air conditioner in [metro] typically lasts [n]–[n] years — shorter than the national range, because cooling demand here runs roughly [n]× the national average. Systems installed before [year] are also likely to use a refrigerant that's now expensive to service, which changes the repair-versus-replace math well before the unit fails.

---

## `roof-scan`

**H1:** What your roof has been through
**Sub:** Hail, heat, and age all leave a record. Enter your address and we'll pull the storm history and permit record for your property.

**Chips:** Roof area · Last re-roof permit · Hail events within one mile, last 10 years
**Gate:** Your report includes a replacement cost range, an estimated replacement window, and your property's hail exposure compared with the rest of your ZIP.

---

## `pipe-report`

**H1:** What's likely behind your walls
**Sub:** Homes built in certain years used pipe materials that fail predictably. Your water supply matters too. Enter your address for both.

**Chips:** Pipe era · Water hardness · Last water heater permit

**Careful wording — cohort, never claim:**
> Homes built in [area] around [year] commonly used [material]. We can't see inside your walls — this is what the records suggest for houses like yours.

**Gate:** Your report includes repipe and water heater cost ranges, and an adjusted water heater lifespan based on your water's hardness.

---

## `storm-check`

**H1:** Was your house in the path?
**Sub:** Pick a storm and we'll check what was recorded at your address — and whether your roof was already there when it hit.

**Chips:** Recorded hail size at this location · Roof predates the storm? · Days since the event
**Gate:** Your report includes what to document, the questions to ask an adjuster, and how this event compares with others in your area.

---

## Calculators (B)

**Roof — H1:** What a roof replacement costs in your area
**Sub:** Built from re-roof permit valuations filed in your area, brought current with published material and labor price indexes.

**AC — H1:** What an AC replacement costs in your area
**Water heater — H1:** What a water heater replacement costs — and whether yours is overdue

**Result:**
> **$[low] – $[high]** — Typical range for [scope] in [geography]
> Based on [n] permits filed in the last 12 months. Escalated to [month] using published price indexes. [How this is calculated →]

**Honest caveat (keep it):**
> Permit valuations reflect what contractors declare, which often runs below what a homeowner pays. Treat this as a floor, not a quote.

---

## `plumbing-triage`

**H1:** Something's wrong. Start here.
**Sub:** Tell us what's happening. We'll tell you what to do in the next five minutes, whether it's an emergency, and what it usually costs.

**Symptoms:** Water on the floor · No hot water · Sewage smell or backup · No water at all · Water bill jumped

**Shutoff first, always:**
> **Before anything else: shut off the water.** For a single fixture, the valve is usually under it — turn clockwise. For the whole house, the main is typically near the street or where the line enters. If you can't find it or it won't turn, shut off the water heater too and call a plumber now.

**Safety interrupt (gas):**
> **Stop. If you smell gas, leave the house now.** Don't flip switches, don't use your phone inside. Call 911 and your gas utility from outside. Do not continue with this tool.

**Safety interrupt (sewage):**
> Raw sewage is a health hazard. Keep people and pets out of the affected area and don't run any more water into the system.

**Verdicts:** Call someone now · Today, not next week · This can wait, but don't forget it

**Closer:** Three questions to ask whoever you call:

---

## `ac-triage`

**H1:** Dying, or just dirty?
**Sub:** Most summer AC failures are one of about five things, and two of them you can check yourself in ten minutes.

**Symptoms:** Blowing warm · Runs constantly, never cools · Iced up · Won't turn on · Water around the indoor unit

**Free self-check pattern:**
> **Check this first.** [Instruction.] If that fixes it, you've saved a service call. If not, here's what it likely is.

**Frozen-coil interrupt:**
> Turn the system off and let it thaw before anyone looks at it — running a frozen unit can damage the compressor, which is the expensive part.

**Verdict:** Likely cause · Repair or replace · Typical cost in [metro] · Three questions to ask

---

## FAQ seeds (each tool needs 5–8)

- How accurate is this?
- Where does this data come from?
- What if you don't have records for my house?
- Do I have to talk to a contractor?
- Will you call me? — *No. We don't collect phone numbers.*
- How often is this updated?
- Can I use this with my own contractor?
