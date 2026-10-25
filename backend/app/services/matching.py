"""Match selected decision-time forecasts with actual outturn.

WINDFOR is hourly; FUELHH is half-hourly (MW averaged over each settlement period).
Two documented alignment policies are offered:

* ``exact`` (default): the actual is the FUELHH record whose startTime equals the
  forecast startTime ``T`` (settlement period ``[T, T+30m)``).
* ``hourly_mean``: the actual is the mean of the two settlement periods starting at
  ``T`` and ``T+30m``. If either half-hour is missing the actual is treated as missing
  rather than estimated from one half.
"""

from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd

Alignment = Literal["exact", "hourly_mean"]

STATUS_MATCHED = "matched"
STATUS_MISSING_FORECAST = "missing_forecast"
STATUS_MISSING_ACTUAL = "missing_actual"
STATUS_MISSING_BOTH = "missing_both"


def align_actuals(selected: pd.DataFrame, actuals: pd.DataFrame, alignment: Alignment) -> pd.Series:
    """Return actual MW aligned to ``selected['start_time']`` (NaN where missing)."""
    lookup = actuals.set_index("start_time")["actual_mw"]
    starts = selected["start_time"]
    first = starts.map(lookup)
    if alignment == "exact":
        return first.astype("float64")
    second = (starts + pd.Timedelta(minutes=30)).map(lookup)
    return ((first + second) / 2).astype("float64")  # NaN if either half is missing


def match_intervals(selected: pd.DataFrame, actuals: pd.DataFrame, alignment: Alignment) -> pd.DataFrame:
    """Add actuals, status and errors. Errors exist only for matched intervals."""
    out = selected.copy()
    out["actual_mw"] = align_actuals(selected, actuals, alignment)
    has_f = out["forecast_mw"].notna()
    has_a = out["actual_mw"].notna()
    out["status"] = np.select(
        [has_f & has_a, ~has_f & has_a, has_f & ~has_a],
        [STATUS_MATCHED, STATUS_MISSING_FORECAST, STATUS_MISSING_ACTUAL],
        default=STATUS_MISSING_BOTH,
    )
    out["error_mw"] = np.where(has_f & has_a, out["forecast_mw"] - out["actual_mw"], np.nan)
    out["abs_error_mw"] = out["error_mw"].abs()
    out["forecast_horizon_hours"] = (out["start_time"] - out["forecast_publish_time"]).dt.total_seconds() / 3600
    return out
