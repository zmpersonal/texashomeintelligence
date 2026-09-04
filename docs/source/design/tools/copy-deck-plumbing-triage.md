# Plumbing Triage — Copy Deck

Source of truth for every user-facing string in `/tools/plumbing-triage/`. Round 18 renders these
verbatim.

> ## ⚠️ ONE CORRECTION APPLIED TO THE DELIVERED DECK — the electrical interrupt
>
> The deck as supplied in the Round 18 brief still ended the electrical-and-water interrupt with:
>
> > ~~Only turn off a breaker if the panel is dry and you can reach it standing on dry ground.~~
>
> **That line is not built and is struck here.** The owner's Round 17d instruction and Round 18
> item 6 both state it was an inference ESFI does not support: the source says do not enter a
> flooded area until the utility has confirmed power is off, and do not touch a breaker with wet
> hands or while standing on a wet surface. The replacement below is the owner's verbatim text.
> The source line is also corrected to ESFI's actual document title.
>
> Recorded by the owner and carried here: **ESFI covers the substance but not all three points on
> one page.**

---

## Entry screen

**H1:** Water trouble? Start here.

**Sub:** Five questions, no account, no address. We'll tell you what to shut off, what to look at,
and when to stop looking.

**Symptom buttons** (full width, one per row, in this order):

1. Water on the floor
2. No hot water
3. Sewage smell
4. No water at all
5. The bill went up

**Footer line:** This tells you what to check. It isn't an inspection and it can't see your house.

---

## Gas pre-screen

*Authored previously; carried verbatim from the design. Appears before everything.*

**Question:** Do you smell gas near the water heater?
**Note:** We ask first because everything else can wait and this can't.
**Buttons:** Yes, or I'm not sure · No gas smell

**On "Yes, or I'm not sure" — full screen, flow stops:**

> **Stop**
> If you smell gas, leave the house now.
> Don't flip switches. Don't use your phone inside.
> Call 911 and your gas utility from outside.
> Do not continue with this tool.

**Buttons:** Call 911 · I don't smell gas — go back

---

## PATH 1 — Water on the floor

### Screen 1a — Shutoff

*Authored previously; carried verbatim from the design.*

> **Before anything else**
> **Shut off the water.**
> For a single fixture, the valve is usually under it — turn clockwise.
> For the whole house, the main is typically near the street or where the line enters.
> If you can't find it or it won't turn, shut off the water heater too and call a plumber now.

**Buttons:** Water is off — what now? · I can't shut it off

### Screen 1b — Electrical interrupt

Shown immediately after the shutoff instruction on this path only, before any diagnostic question.
Full-screen. Nothing else on it.

**Is the water near anything electrical?**

An outlet, a power strip, an appliance, a breaker panel, a furnace or water heater.

Do not walk into standing water to find out. Look from where you are.

**Two buttons, equal weight:** Yes, or I can't tell from here · No — the water is away from all of it

**On "Yes, or I can't tell from here" — full screen, flow stops:**

> **Stop. Stay out of the water.**
>
> Water and live current together can be fatal on contact, and you cannot tell by looking whether
> water is energised.
>
> Do not enter the water to reach the breaker panel. If the panel is somewhere you'd have to wade
> to reach, leave it.
>
> **From a dry place, outside if you can:**
>
> 1. Keep everyone and pets out of the room.
> 2. Don't touch anything electrical — not a switch, not a cord, not an appliance.
> 3. Call your electric utility and tell them there is standing water near electrical equipment.
>    They can cut power at the street.
> 4. If anyone has been shocked, or you smell burning, call 911 first.
>
> **Don't go into the water until the utility has confirmed the power is off.** Don't touch a
> breaker with wet hands or while standing on anything wet.
>
> *Source: Electrical Safety Foundation International — Flooding and Disaster Safety*

**One button:** Understood — go back

**No verdict, no "what to check", no questions. The path ends here.**

On "No — the water is away from all of it": continue to 1c.

### Screen 1c — Where

**Where is the water coming from?**

1. Under a sink or behind a toilet
2. From the ceiling
3. Around the water heater
4. Coming up out of a drain
5. I can't tell

### Screen 1d — Verdicts

#### Under a sink or behind a toilet
**A supply line or a seal at the fixture**

Most floor water at a fixture comes from one of three places: the flexible supply line feeding it,
the shutoff valve behind it, or the seal where the fixture meets the floor. The first two usually
have their own valve within arm's reach, which is why this is the one kind of leak you can often
stop without touching the main.

**What to look at**
- The braided line running from the wall or floor to the fixture — feel it dry, then feel it again in ten minutes
- The small oval valve where that line meets the wall, and the floor directly under it
- Around the base of a toilet, and the tank bolts if it's a toilet
- Whether the water is clear or dirty

**When to stop looking**
Once you've shut the fixture valve and the water stops spreading, you're done for tonight. Cutting
into a wall or floor to chase it further is work for someone with a moisture meter.

#### From the ceiling
**Water travelling from somewhere else**

Ceiling water has almost never entered where you're seeing it. It runs along a joist or a pipe and
drops at the first low point, which can be a room away from the source. That's why chasing the
stain rarely finds it.

**What to look at**
- What's directly above — a bathroom, a laundry, an air handler, or open roof
- Whether it's dripping steadily, or only when a fixture upstairs runs
- Whether the ceiling is sagging or holding a bulge of water
- Whether it started during or after rain

**When to stop looking**
If the ceiling is sagging, stop and stay out from under it — a filled ceiling can come down all at
once. Put a container under a steady drip and leave the rest.

#### Around the water heater
**The tank, a fitting, or the pan drain**

Water at the base of a heater is either a fitting above it that's been dripping down, the relief
valve doing its job, or the tank itself. The last one doesn't get better. In Texas a lot of heaters
sit in attics or upstairs closets, which is why a slow one can go unnoticed until it reaches a
ceiling.

**What to look at**
- Whether it's dripping from a fitting at the top or seeping from the bottom seam
- The discharge pipe from the relief valve — if it's wet, the valve released
- Whether there's a drain pan under it, and whether the pan's drain line is clear
- Rust or mineral crust at the base

**When to stop looking**
Seeping from the bottom seam means the tank is done — nothing to check further. Shut the water to
the heater and turn off its gas or breaker.

#### Coming up out of a drain
**Water going the wrong way**

Water rising out of a drain is a blockage downstream, not a supply leak. Shutting the main won't
stop it. Anything you run — a sink, a washing machine, a shower — has to go somewhere, and if the
line is blocked it comes back up at the lowest opening.

**What to look at**
- Which drains back up and which don't, and whether more than one does at once
- Whether flushing a toilet makes water rise somewhere else
- Whether it's clear water or sewage — if it's sewage, use the sewage path instead
- Whether there's a cleanout access outside, usually a capped pipe near the foundation

**When to stop looking**
Stop running water anywhere in the house — that's the whole intervention. More than one fixture
backing up at once means the blockage is in the main line, which is not a plunger problem.

#### I can't tell
**Find the edge before you find the source**

When the source isn't obvious the useful thing isn't guessing — it's establishing whether it's
still growing.

**What to look at**
- Dry the edge of the water with a towel and mark where it ends. Check again in fifteen minutes
- Whether it's warm or cold to the touch
- Whether the sound of running water changes when you shut the main
- The lowest point in the room — water finds it, so the source is usually uphill

**When to stop looking**
If shutting the main stops the spread, it's a supply leak and it can wait until morning. If it
keeps spreading with the main off, it's drainage or groundwater and it needs a different answer.

### Three questions to ask — Path 1

*The delivered deck supplies a three-questions block for paths 2–5 but not for path 1. These are
the authored strings from the design (`Plumbing Triage.dc.html`), which storyboards this path.
Reported as a gap in Round 18 rather than newly written.*

1. Is this a repair to one fixture or a symptom of the supply line?
2. What's the diagnostic fee, and does it come off the repair if I go ahead?
3. Does this work need a permit, and are you pulling it?

---

## PATH 2 — No hot water

**No hot water**

Three things stop hot water: the heater lost its fuel or power, a safety cut out, or the tank
failed. Which one you're in is usually visible in a minute without tools.

First, if it's a gas heater and you smell gas anywhere near it — stop and use the gas path.

**What to look at**
- Electric: whether the heater's breaker has tripped
- Gas: whether the pilot or burner is lit, and whether other gas appliances still work
- Whether the water is lukewarm rather than cold — that's a different problem than none at all
- Any water around the base — if there's water, use the water-on-the-floor path first
- The thermostat setting, if it's reachable and labelled

**When to stop looking**
Reset a tripped breaker once. If it trips again, stop and leave it — a breaker that won't hold is
telling you something. Don't relight a pilot more than once, and not at all if you smell gas.

**Three questions to ask**
1. How old is the heater, and is it under warranty?
2. Is this the element, the thermostat, the valve, or the tank?
3. If it's the tank, what does replacement include — permit, disposal, pan, expansion tank?

---

## PATH 3 — Sewage smell

### Interrupt

*Authored previously; carried verbatim from the design.*

> **Health hazard**
> Raw sewage is a health hazard.
> Keep people and pets out of the affected area.
> Don't run any more water into the system — no sinks, no laundry, no flushing.

**Button:** Understood — what now?

### Verdict, after the interrupt

**A dry trap, a failed seal, or a vent problem**

Sewer gas reaches you when the water barrier that normally blocks it is gone. Usually that's a
drain nobody's used in weeks and the trap has evaporated — common in a guest bath or a floor drain.
Less often it's a toilet seal or a blocked vent.

**What to look at**
- Whether the smell is in one room or throughout
- Any drain that hasn't been used recently — run water in it for thirty seconds and see if the smell fades within the hour
- Whether a toilet rocks when you sit on it
- Whether it's worse after rain, or on windy days

**When to stop looking**
If running water in unused drains clears it, that was it. A smell that persists after every trap is
filled is a seal or a vent, and both are above what a look can settle.

**Three questions to ask**
1. Did you find the source, or are you replacing parts to see what helps?
2. If it's a vent, is the work on the roof or in the wall?
3. What did you check to rule out a cracked line under the slab?

---

## PATH 4 — No water at all

**No water at all**

Nothing coming out anywhere is usually upstream of the house — the meter, the main valve, or the
utility. Something coming out weakly, or at one fixture only, is a different problem.

**What to look at**
- Whether it's every fixture or just some — one dry fixture is that fixture's valve
- Whether the main shutoff got closed, including by anyone working on the house
- The meter, if you can reach it — whether the dial is moving with everything off
- Whether neighbours have water, which separates your house from the street
- Whether it's below freezing, or has been overnight

**When to stop looking**
If the whole street is out, it's the utility and there's nothing to check. If it froze, don't apply
heat to a pipe you can't see the whole length of — thawing a burst line just moves the flood
indoors.

**Three questions to ask**
1. Is the problem on my side of the meter or the utility's?
2. If it's a frozen line, what's the plan if it's already split?
3. What would prevent this next winter, and what does that cost?

---

## PATH 5 — The bill went up

**The bill went up**

A jump with no change in habits is usually a leak that never surfaces — most often a toilet
flapper, which can pass hundreds of gallons a day silently. The meter settles it in ten minutes.

**What to look at**
- Turn everything off, then watch the meter's low-flow indicator. Movement with everything off means water is going somewhere
- Put a few drops of food colouring in each toilet tank, wait fifteen minutes, and check the bowl for colour
- Irrigation — a broken head or a stuck valve runs at night and leaves no evidence by morning
- Any warm or unusually green patch of ground on the water line's route
- Whether the utility changed rates or the billing period covered more days

**When to stop looking**
If the meter is still with everything off, there's no leak and the answer is in the bill itself. If
it's moving and no toilet colours, the leak is underground or under the slab — that's the point to
stop.

**Three questions to ask**
1. How did you locate the leak — did you find it, or infer it?
2. Is it under the slab, and if so what's the access plan?
3. What's the repair if the pipe turns out to be worse than expected?

---

## Verdict screen footer

On every verdict, small:

> This is general guidance for Texas homes, not a diagnosis of yours. We haven't seen your house
> and can't tell you what's wrong with it.

---

## Removed by owner decision (Round 18)

- **The cost block** — the `Typical cost in Austin` panel, the sub-headline's promise of a cost
  figure, and `page-brief.md`'s Type C ordering that puts cost second. Round 6 measured city permit
  valuation as unusable in both metros.
- **Referral / contractor handoff** — paths end at the verdict. Utility and emergency instructions
  (911, the electric utility, the gas utility) are permitted and are not trade referral.
