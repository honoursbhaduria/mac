"""Decision-time forecast selection.

For every delivery interval starting at ``T``::

    decision_cutoff = T - decision_lead
    eligible        = WINDFOR vintages for T with publishTime <= decision_cutoff
    selected        = the eligible vintage with the latest publishTime

Vintages published after the cutoff are never selected, even if they would have been
more accurate: using them would introduce hindsight bias.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd

from app.utils.frames import frame_records
from app.utils.timestamps import utc_series

SELECTION_COLUMNS = [
    "start_time",
    "decision_cutoff",
    "forecast_publish_time",
    "forecast_mw",
    "vintages_eligible",
]

# WINDFOR is published at hourly resolution.
GRID_FREQ = pd.Timedelta(hours=1)


def build_hourly_grid(
    decision_lo: datetime,
    decision_hi: datetime,
    lead: timedelta,
    delivery_lo: datetime | None = None,
    delivery_hi: datetime | None = None,
) -> pd.DatetimeIndex:
    """Hourly UTC delivery start times ``T`` whose cutoff ``T - lead`` lies in
    ``[decision_lo, decision_hi)`` and, if given, ``T`` lies in ``[delivery_lo, delivery_hi)``."""
    lo = pd.Timestamp(decision_lo) + lead
    hi = pd.Timestamp(decision_hi) + lead
    if delivery_lo is not None:
        lo = max(lo, pd.Timestamp(delivery_lo))
    if delivery_hi is not None:
        hi = min(hi, pd.Timestamp(delivery_hi))
    lo = lo.tz_convert("UTC").ceil("h")
    hi = hi.tz_convert("UTC")
    if lo >= hi:
        return pd.DatetimeIndex([], dtype="datetime64[ns, UTC]", name="start_time")
    grid = pd.date_range(lo, hi, freq=GRID_FREQ, inclusive="left", name="start_time")
    return grid.as_unit("ns")


def select_decision_forecasts(forecasts: pd.DataFrame, grid: pd.DatetimeIndex, lead: timedelta) -> pd.DataFrame:
    """Return one row per grid interval with the selected decision-time forecast
    (``forecast_mw`` is NaN when no vintage was published by the cutoff)."""
    base = pd.DataFrame({"start_time": utc_series(pd.Series(grid, dtype="datetime64[ns, UTC]"))})
    base["decision_cutoff"] = base["start_time"] - pd.Timedelta(lead)

    candidates = forecasts.merge(base, on="start_time", how="inner")
    eligible = candidates[candidates["publish_time"] <= candidates["decision_cutoff"]]
    counts = eligible.groupby("start_time").size().rename("vintages_eligible")
    # Sorting by publish_time then taking the last row per interval selects the latest
    # eligible vintage. Normalisation guarantees (start_time, publish_time) is unique.
    latest = (
        eligible.sort_values(["start_time", "publish_time"])
        .groupby("start_time", as_index=False)
        .last()[["start_time", "publish_time", "forecast_mw"]]
        .rename(columns={"publish_time": "forecast_publish_time"})
    )

    out = base.merge(latest, on="start_time", how="left")
    out = out.merge(counts, on="start_time", how="left")
    out["vintages_eligible"] = out["vintages_eligible"].fillna(0).astype("int64")
    out["forecast_publish_time"] = utc_series(out["forecast_publish_time"])
    return out[SELECTION_COLUMNS].sort_values("start_time").reset_index(drop=True)


@dataclass(frozen=True)
class Vintage:
    publish_time: pd.Timestamp
    forecast_mw: float
    eligible: bool
    selected: bool
    horizon_hours: float  # start_time - publish_time


def vintage_history(forecasts: pd.DataFrame, start_time: datetime, cutoff: datetime) -> list[Vintage]:
    """Chronological publication history for one delivery interval with eligibility at
    ``cutoff`` and the selected (latest eligible) vintage flagged."""
    start = pd.Timestamp(start_time)
    rows = forecasts[forecasts["start_time"] == start].sort_values("publish_time")
    records = frame_records(rows)
    cut = pd.Timestamp(cutoff)
    eligible_mask = rows["publish_time"] <= cut
    selected_publish = rows.loc[eligible_mask, "publish_time"].max() if eligible_mask.any() else None
    return [
        Vintage(
            publish_time=r["publish_time"],
            forecast_mw=float(r["forecast_mw"]),
            eligible=bool(r["publish_time"] <= cut),
            selected=selected_publish is not None and r["publish_time"] == selected_publish,
            horizon_hours=round((start - r["publish_time"]).total_seconds() / 3600, 3),
        )
        for r in records
    ]
