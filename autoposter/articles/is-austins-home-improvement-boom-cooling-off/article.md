---
title: "Is Austin's home-improvement boom actually cooling off?"
description: "Austin's permit record says the boom is not cooling evenly: roofing is below its own pace, HVAC is above it, and solar just had its biggest month in a year."
publishedAt: "2026-09-11"
published: false
metrics:
  - permit_activity_solar
  - permit_activity_hvac
  - permit_activity_roofing
sources:
  - name: "City of Austin Issued Construction Permits (Socrata)"
    asOf: "2026-08-01"
# NO `embed:` — DELIBERATE, and checked rather than assumed.
# The site's permit dataset is `municipal-permits/austin`, and its observations are
# INDIVIDUAL PERMIT RECORDS whose `value` is an object (permitType, workDescription,
# status), not a monthly count. The embed template renders a two-column numeric table, so
# pointing it here would render an empty or meaningless receipts table under a sourced
# article — the exact failure of the first article's embed (LEARNINGS L9/L10). Monthly
# counts are an aggregation the site does not compute today. The three-trade table in the
# body carries the figures as real HTML, which is what the rule actually requires.
card:
  question: "Is Austin's home-improvement boom actually cooling off?"
  headline: "224 solar permits"
  subhead: "up 138% month over month"
  source: "City of Austin"
  asOf: "Aug 2026"
---

## The short answer

**Mostly no.** One Austin trade really is running below its own recent pace. The rest are
running above it, and one of them just had its biggest month in a year.

Austin issued 224 solar permits in August 2026 — up 138% month over month, and
159% above its 11-month average (City of Austin Issued Construction Permits (Socrata), as of August 2026). That is not a market cooling off.

## What "cooling off" would actually look like

A boom that is ending shows up as permit counts falling below where that trade has been
running. So that is the comparison: each Austin trade against its own preceding eleven months,
and against nothing else. Permit counts are an activity signal — they say how much work is
being started, never what it costs — and they are only comparable inside one city's own
filing system.

By that test, here is where Austin's three most visible trades stand.

| Trade | August 2026 | Against its own average |
|---|---|---|
| Solar | 224 solar permits | 159% above its 11-month average |
| HVAC | 1,037 HVAC permits | 19% above its 11-month average |
| Roofing | 144 roofing permits | 8% below its 11-month average |

## The one that is genuinely slower

Roofing. Austin issued 144 roofing permits in August, 8% below its 11-month average (City of Austin Issued Construction Permits (Socrata), as of
August 2026). It is the only one of the three sitting below its own run-rate, and it has been
drifting for months rather than dropping suddenly.

If your sense that things have gone quiet comes from roofing, the data agrees with you.

## The one that looks like cooling and is not

HVAC is the trade most people would point at, because it did fall: down 15% month over month
(City of Austin Issued Construction Permits (Socrata), as of August 2026). July to August, that reads like the end of a busy summer.

Against its own eleven-month average, though, HVAC is 19% above its 11-month average. A month can be down
from the one before it and still be a strong month. Both things are true, and only one of them
is a trend.

## The one nobody expected

Solar. 224 solar permits in a single month, up 138% month over month — the largest month in the
twelve we hold (City of Austin Issued Construction Permits (Socrata), as of August 2026).

We cannot say from the permits alone what drove the solar jump — a filing deadline, an incentive change and genuine demand all look identical in a count.

So we are not going to tell you why. We are telling you that it happened, in Austin, in August,
by that much, from the city's own issued-permit record — and that anyone claiming to know the
cause is working from something other than this data.

## What this is useful for

If you are getting quotes right now, the useful read is that installer demand is not uniform.
Roofing is the slower lane. Solar is the busy one, and a trade running at 159% above its 11-month average
is a trade where scheduling slips and quotes get thinner on detail.

That is worth knowing before you assume a slow quote means a slow market.
