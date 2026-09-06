"""
thi_source.py — READ-ONLY reader for THI's committed datasets.

This is decision B as re-decided in Phase 0: instead of a Cloudflare Worker route (a file
under `site/src/pages/`, outside the Rule 0 boundary, and untestable because THI has no
staging surface), the autoposter reads THI's already-committed generated data directly and
produces its own artifact inside `autoposter/`.

**This module never writes to `site/`.** It opens files for reading and nothing else.

WHAT IT PRODUCES: one `Series` per (area, metric), each a time-ordered list of
`(period, value)` points plus provenance. Everything downstream — signals, scoring, the feed —
is computed from these. No model involvement anywhere in this file.

TWO TRAPS THIS FILE EXISTS TO AVOID (both found in the real data, Phase 2):

1. **Partial trailing periods.** A monthly series whose latest period is the current month is
   measured over a handful of days. Left in, September's 4-days-of-permits reads as an ~80%
   collapse and becomes a confident, wrong headline. Incomplete trailing periods are dropped.

2. **Composition breaks.** THI's drought feed reported one county per metro until 2026-08-25,
   then several. Aggregating across "all counties present this week" makes the metro appear to
   jump when only the *coverage* changed. Each metro is therefore pinned to the one anchor
   county that has been present for the whole series.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

# Resolve from __file__, never the cwd (social-autoposter step 7: a loader that resolves from
# the cwd reports things missing the moment it runs from a subdirectory).
REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATED = REPO_ROOT / "site" / "src" / "data" / "generated"
CROSSWALK = REPO_ROOT / "site" / "src" / "data" / "zip-area-crosswalk.csv"

# THI's file-level `location` -> our area id.
AREA_OF_LOCATION = {"austin": "austin_metro", "san-antonio": "san_antonio_metro", "texas": "texas"}
AREA_TYPE = {"austin_metro": "metro", "san_antonio_metro": "metro", "texas": "state"}
AREA_LABEL = {"austin_metro": "Austin metro", "san_antonio_metro": "San Antonio metro",
              "texas": "Texas"}

# The anchor county per metro — see trap 2. These are the counties present for the whole
# drought series, so the metro's readings stay comparable across the composition change.
DROUGHT_ANCHOR = {"austin": ("48453", "Travis"), "san-antonio": ("48029", "Bexar")}

_DROUGHT_STAGE = re.compile(r"\bD([0-4])\b")


@dataclass
class Point:
    period: str      # ISO date identifying the period the reading covers
    value: float


@dataclass
class Series:
    area_id: str
    metric: str
    points: list[Point]
    source: str
    as_of: str
    unit: str = ""
    cadence: str = "weekly"          # weekly | monthly | daily
    note: str = ""
    county: str = ""     # set where a metro's reading is actually one county's (drought anchor)
    dropped: list[str] = field(default_factory=list)   # audit trail of what was excluded

    @property
    def latest(self) -> float:
        return self.points[-1].value

    @property
    def values(self) -> list[float]:
        return [p.value for p in self.points]

    def __repr__(self) -> str:
        return (f"Series({self.area_id}/{self.metric} n={len(self.points)} "
                f"{self.points[0].period}..{self.points[-1].period} latest={self.latest})")


def _load(dataset: str, location: str) -> dict | None:
    path = GENERATED / dataset / f"{location}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _live(doc: dict | None) -> bool:
    """Only `live` datasets are usable. `sample` status is seeded placeholder data and must
    never reach a published figure (THI CLAUDE.md: sample is never presented as fact)."""
    return bool(doc) and doc.get("status") == "live"


def _source_name(doc: dict, fallback: str) -> str:
    return (doc.get("source") or {}).get("name") or fallback


def _current_month(today: date) -> str:
    return f"{today.year:04d}-{today.month:02d}"


# ---------------------------------------------------------------- metric extractors

def _drought(location: str, today: date) -> Series | None:
    doc = _load("usdm-drought", location)
    if not _live(doc):
        return None
    fips, county = DROUGHT_ANCHOR[location]
    pts, dropped = [], []
    for obs in doc["observations"]:
        if not str(obs.get("key", "")).startswith(fips + "-"):
            dropped.append(obs.get("key", "?"))
            continue
        match = _DROUGHT_STAGE.search(str((obs.get("value") or {}).get("droughtIndex", "")))
        if not match:
            continue
        pts.append(Point(obs["observedAt"][:10], float(match.group(1))))
    if len(pts) < 2:
        return None
    pts.sort(key=lambda p: p.period)
    return Series(
        AREA_OF_LOCATION[location], "drought_stage", pts,
        _source_name(doc, "U.S. Drought Monitor"), pts[-1].period,
        unit="D-stage", cadence="weekly", county=county,
        note=f"anchored to {county} County ({fips}) — the one county present for the whole "
             f"series; see trap 2",
        dropped=[f"{len(dropped)} rows from counties added mid-series"] if dropped else [],
    )


def _monthly_value(location: str, dataset: str, metric: str, field_name: str,
                   fallback_source: str, unit: str, today: date,
                   kind: str | None = None, source_override: str | None = None) -> Series | None:
    """`kind` filters `value.kind` when a dataset interleaves record types.

    Trap 3: THI's climate file carries twelve 1991-2020 monthly NORMALS alongside the real
    monthly ACTUALS, in one `observations[]`, with the normals dated to 2020. Blended, the
    series is meaningless and every delta is noise. Only one kind may enter a series.
    """
    doc = _load(dataset, location)
    if not _live(doc):
        return None
    current, pts, dropped = _current_month(today), [], []
    for obs in doc["observations"]:
        raw = obs.get("value") or {}
        if kind is not None and raw.get("kind") != kind:
            dropped.append(f"kind={raw.get('kind')}")
            continue
        value = raw.get(field_name)
        if value is None:
            continue
        period = obs["observedAt"][:10]
        if period[:7] >= current:        # trap 1: the running month is incomplete
            dropped.append(period[:7])
            continue
        pts.append(Point(period, float(value)))
    if len(pts) < 2:
        return None
    pts.sort(key=lambda p: p.period)
    return Series(
        AREA_OF_LOCATION[location], metric, pts,
        source_override or _source_name(doc, fallback_source),
        pts[-1].period, unit=unit, cadence="monthly",
        dropped=sorted({(f"incomplete current month {d}" if d[:1].isdigit()
                         else f"other record type ({d})") for d in dropped}),
    )


def _permit_trades(location: str, today: date) -> list[Series]:
    doc = _load("permit-trade-activity", location)
    if not _live(doc):
        return []
    current = _current_month(today)
    by_trade: dict[str, list[Point]] = {}
    dropped: list[str] = []
    for obs in doc["observations"]:
        value = obs.get("value") or {}
        trade, month, count = value.get("category"), value.get("month"), value.get("permitCount")
        if not trade or not month or count is None:
            continue
        if month >= current:             # trap 1
            dropped.append(month)
            continue
        by_trade.setdefault(trade, []).append(Point(f"{month}-01", float(count)))
    out = []
    for trade, pts in sorted(by_trade.items()):
        if len(pts) < 2:
            continue
        pts.sort(key=lambda p: p.period)
        out.append(Series(
            AREA_OF_LOCATION[location], f"permit_activity_{trade}", pts,
            _source_name(doc, "Municipal permit records"), pts[-1].period,
            unit="permits/month", cadence="monthly",
            note="permit activity is a COUNT — an activity instrument, never a price "
                 "instrument (THI CLAUDE.md)",
            dropped=[f"incomplete current month {m}" for m in sorted(set(dropped))],
        ))
    return out


def _air_quality(location: str, today: date) -> Series | None:
    """Daily AQI collapsed to a weekly maximum — a week's worst air is the readable figure,
    and it makes the cadence comparable with the other weekly series."""
    doc = _load("airnow", location)
    if not _live(doc):
        return None
    weeks: dict[str, float] = {}
    for obs in doc["observations"]:
        aqi = (obs.get("value") or {}).get("aqi")
        if aqi is None:
            continue
        day = datetime.fromisoformat(obs["observedAt"].replace("Z", "+00:00")).date()
        monday = day.fromordinal(day.toordinal() - day.weekday()).isoformat()
        weeks[monday] = max(weeks.get(monday, 0.0), float(aqi))
    # trap 1 again: the running week is partial, and a weekly MAX only ever grows.
    this_week = today.fromordinal(today.toordinal() - today.weekday()).isoformat()
    dropped = [w for w in weeks if w >= this_week]
    pts = [Point(w, v) for w, v in sorted(weeks.items()) if w < this_week]
    if len(pts) < 2:
        return None
    return Series(
        AREA_OF_LOCATION[location], "air_quality_index", pts,
        _source_name(doc, "AirNow"), pts[-1].period, unit="AQI", cadence="weekly",
        note="weekly maximum of daily AQI",
        dropped=[f"incomplete current week {w}" for w in dropped],
    )


def load_history(today: date | None = None, min_points: int = 4) -> list[Series]:
    """Every usable (area, metric) series THI can currently support. READ-ONLY.

    `min_points` is `config.movers.history_min_weeks`. A series below it is DROPPED, not
    scored with a shrug: below four readings there is no baseline to be surprised against,
    and a confident number computed from two points is exactly the false precision the
    honesty gate exists to stop (harness Meta-Rule 5, gate the data before the feature).
    """
    today = today or datetime.now(timezone.utc).date()
    out: list[Series] = []
    for location in ("austin", "san-antonio"):
        for series in (
            _drought(location, today),
            _air_quality(location, today),
            _monthly_value(location, "noaa-climate", "cooling_degree_days",
                           "coolingDegreeDaysF", "NOAA NCEI", "°F-days", today,
                           kind="monthly-actual",
                           # The dataset's own source string names BOTH the 1991-2020 normals
                           # and the monthly actuals. We keep only the actuals, so citing the
                           # normals on a post would credit data that is not in the figure.
                           source_override="NOAA NCEI Global Summary of the Month"),
        ):
            if series:
                out.append(series)
        out.extend(_permit_trades(location, today))
    energy = _monthly_value("texas", "eia-electricity", "energy_price_cents_kwh",
                            "pricePerKwhCents", "U.S. EIA", "¢/kWh", today)
    if energy:
        out.append(energy)

    kept, thin = [], []
    for series in out:
        (kept if len(series.points) >= min_points else thin).append(series)
    for series in thin:
        # stderr: a dropped series is diagnostic, not part of the artifact's output.
        print(f"  [dropped] {series.area_id}/{series.metric}: {len(series.points)} points "
              f"< min {min_points}", file=sys.stderr)
    return kept


def audience_coverage() -> dict[str, float]:
    """Share of covered ZIPs each area speaks to. Read from THI's own crosswalk, not guessed."""
    counts: dict[str, int] = {}
    rows = CROSSWALK.read_text().splitlines()[1:]
    for row in rows:
        parts = row.split(",")
        if len(parts) > 1:
            counts[parts[1].strip()] = counts.get(parts[1].strip(), 0) + 1
    total = sum(counts.values()) or 1
    out = {"texas": 1.0}
    for area, key in (("austin_metro", "austin"), ("san_antonio_metro", "san_antonio")):
        out[area] = counts.get(key, 0) / total
    return out


if __name__ == "__main__":
    print(f"reading (read-only) from {GENERATED}")
    for s in load_history():
        print(" ", s, f"src={s.source!r}", ("| " + "; ".join(s.dropped)) if s.dropped else "")
    print("audience coverage:", audience_coverage())
