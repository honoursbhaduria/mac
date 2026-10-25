"""Forecast accuracy metrics computed on matched observations only.

With ``F_t`` the selected forecast (MW), ``A_t`` the actual (MW) and ``e_t = F_t - A_t``:

* MAE   = mean(|e_t|)                         [MW]
* RMSE  = sqrt(mean(e_t^2))                   [MW]
* Bias  = mean(e_t)                           [MW]  (positive => over-forecast)
* WAPE  = 100 * sum(|e_t|) / sum(A_t)          [%]   (null if sum(A_t) <= 0)
* Bias% = 100 * sum(e_t) / sum(A_t)            [%]   (null if sum(A_t) <= 0)

Every metric is null when there are no matched observations.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

FloatArray = npt.NDArray[np.float64]


@dataclass(frozen=True)
class Metrics:
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    wape_pct: float | None
    bias_pct: float | None
    total_abs_error_mw: float | None
    sum_actual_mw: float | None
    sum_forecast_mw: float | None
    mean_forecast_mw: float | None
    mean_actual_mw: float | None
    notes: tuple[str, ...] = ()


def _arrays(
    forecast: Sequence[float] | FloatArray, actual: Sequence[float] | FloatArray
) -> tuple[FloatArray, FloatArray]:
    f = np.asarray(forecast, dtype=np.float64)
    a = np.asarray(actual, dtype=np.float64)
    if f.shape != a.shape:
        raise ValueError("forecast and actual must have the same length")
    keep = np.isfinite(f) & np.isfinite(a)
    return f[keep], a[keep]


def mae(forecast: Sequence[float] | FloatArray, actual: Sequence[float] | FloatArray) -> float | None:
    f, a = _arrays(forecast, actual)
    return float(np.mean(np.abs(f - a))) if f.size else None


def rmse(forecast: Sequence[float] | FloatArray, actual: Sequence[float] | FloatArray) -> float | None:
    f, a = _arrays(forecast, actual)
    return float(np.sqrt(np.mean((f - a) ** 2))) if f.size else None


def bias(forecast: Sequence[float] | FloatArray, actual: Sequence[float] | FloatArray) -> float | None:
    f, a = _arrays(forecast, actual)
    return float(np.mean(f - a)) if f.size else None


def wape(forecast: Sequence[float] | FloatArray, actual: Sequence[float] | FloatArray) -> float | None:
    f, a = _arrays(forecast, actual)
    denom = float(np.sum(a))
    if not f.size or denom <= 0:
        return None
    return float(100 * np.sum(np.abs(f - a)) / denom)


def compute_metrics(forecast: Sequence[float] | FloatArray, actual: Sequence[float] | FloatArray) -> Metrics:
    f, a = _arrays(forecast, actual)
    if not f.size:
        return Metrics(
            0,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            ("No matched observations: all metrics are undefined.",),
        )
    err = f - a
    sum_a = float(np.sum(a))
    notes: list[str] = []
    if sum_a <= 0:
        notes.append("Sum of actual generation is zero or negative: WAPE and bias % are undefined.")
        wape_pct = bias_pct = None
    else:
        wape_pct = float(100 * np.sum(np.abs(err)) / sum_a)
        bias_pct = float(100 * np.sum(err) / sum_a)
    return Metrics(
        n=int(f.size),
        mae_mw=float(np.mean(np.abs(err))),
        rmse_mw=float(np.sqrt(np.mean(err**2))),
        bias_mw=float(np.mean(err)),
        wape_pct=wape_pct,
        bias_pct=bias_pct,
        total_abs_error_mw=float(np.sum(np.abs(err))),
        sum_actual_mw=sum_a,
        sum_forecast_mw=float(np.sum(f)),
        mean_forecast_mw=float(np.mean(f)),
        mean_actual_mw=float(np.mean(a)),
        notes=tuple(notes),
    )


METRIC_DEFINITIONS: list[dict[str, str]] = [
    {
        "key": "mae_mw",
        "name": "Mean Absolute Error",
        "formula": "mean(|F_t - A_t|)",
        "unit": "MW",
        "denominator": "Number of matched intervals",
        "interpretation": "Typical size of a forecast miss for one interval, regardless of direction.",
    },
    {
        "key": "rmse_mw",
        "name": "Root Mean Square Error",
        "formula": "sqrt(mean((F_t - A_t)^2))",
        "unit": "MW",
        "denominator": "Number of matched intervals",
        "interpretation": "Like MAE but penalises large misses more heavily; RMSE >= MAE always.",
    },
    {
        "key": "bias_mw",
        "name": "Mean Bias Error",
        "formula": "mean(F_t - A_t)",
        "unit": "MW",
        "denominator": "Number of matched intervals",
        "interpretation": (
            "Positive: forecast above actual on average (over-forecast). Negative: below actual (under-forecast)."
        ),
    },
    {
        "key": "wape_pct",
        "name": "Weighted Absolute Percentage Error",
        "formula": "100 * sum(|F_t - A_t|) / sum(A_t)",
        "unit": "%",
        "denominator": "Sum of actual generation over matched intervals (undefined if zero)",
        "interpretation": (
            "Total absolute miss relative to total actual generation. Stable when individual actuals are small."
        ),
    },
    {
        "key": "bias_pct",
        "name": "Forecast bias %",
        "formula": "100 * sum(F_t - A_t) / sum(A_t)",
        "unit": "%",
        "denominator": "Sum of actual generation over matched intervals (undefined if zero)",
        "interpretation": "Net over- (+) or under- (-) forecast relative to total actual generation.",
    },
    {
        "key": "total_abs_error_mw",
        "name": "Total absolute error",
        "formula": "sum(|F_t - A_t|)",
        "unit": "MW (summed)",
        "denominator": "None (sum over matched intervals)",
        "interpretation": "Numerator of WAPE. A sum of interval MW values, not an energy quantity.",
    },
    {
        "key": "coverage_pct",
        "name": "Matched coverage",
        "formula": "100 * matched / evaluation intervals",
        "unit": "%",
        "denominator": "Hourly evaluation intervals in the selected window",
        "interpretation": "Share of intervals with both an eligible forecast and an actual observation.",
    },
]
