"""SYNTHETIC TEST DATA ONLY.

Hand-built FUELHH / WINDFOR records with independently calculated expectations. This
module lives under ``tests/`` and must never be imported by application code.

Scenario (decision date 2026-01-31, lead 24 h -> delivery 2026-02-01 00:00Z..23:00Z):

T0 = 2026-02-01T00:00Z, cutoff 2026-01-31T00:00Z
    vintages: 01-30T10:00 -> 1000, 01-30T23:30 -> 1100,
              01-31T00:00 -> 1150 (exactly at cutoff => eligible, SELECTED),
              01-31T06:00 -> 1200 (after cutoff; equals the actual but must be excluded)
    actual 1200 (and 1300 at 00:30)          error = 1150 - 1200 = -50
T1 = 01:00Z, cutoff 01-31T01:00Z
    vintages: 01-30T12:00 -> 2000 (SELECTED), 01-31T02:00 -> 1500 (after cutoff, perfect)
    actual 1500 (no 01:30 record)              error = +500
T2 = 02:00Z: only vintage 01-31T05:00 -> 900 (after cutoff)  => missing_forecast; actual 800
T3 = 03:00Z: vintage 01-30T15:00 -> 3000 (SELECTED); no actual => missing_actual
T4..T23: nothing => missing_both

Exact-alignment expectations over matched {T0, T1}:
    MAE = (50 + 500) / 2 = 275
    RMSE = sqrt((50^2 + 500^2) / 2) = sqrt(126250) = 355.3167...
    Bias = (-50 + 500) / 2 = 225
    WAPE = 100 * 550 / (1200 + 1500) = 20.370370...
    Bias% = 100 * 450 / 2700 = 16.666...
    coverage = 2 / 24 = 8.33 %
Without the cutoff rule (latest vintage overall) both errors would be 0.
"""

from __future__ import annotations

import math
from typing import Any

DECISION_DATE = "2026-01-31"
LEAD_HOURS = 24

FORECASTS: list[dict[str, Any]] = [
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-30T10:00:00Z",
        "startTime": "2026-02-01T00:00:00Z",
        "generation": 1000,
    },
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-30T23:30:00Z",
        "startTime": "2026-02-01T00:00:00Z",
        "generation": 1100,
    },
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-31T00:00:00Z",
        "startTime": "2026-02-01T00:00:00Z",
        "generation": 1150,
    },
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-31T06:00:00Z",
        "startTime": "2026-02-01T00:00:00Z",
        "generation": 1200,
    },
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-30T12:00:00Z",
        "startTime": "2026-02-01T01:00:00Z",
        "generation": 2000,
    },
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-31T02:00:00Z",
        "startTime": "2026-02-01T01:00:00Z",
        "generation": 1500,
    },
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-31T05:00:00Z",
        "startTime": "2026-02-01T02:00:00Z",
        "generation": 900,
    },
    {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-30T15:00:00Z",
        "startTime": "2026-02-01T03:00:00Z",
        "generation": 3000,
    },
]


def _fuel(start: str, period: int, gen: float) -> dict[str, Any]:
    return {
        "dataset": "FUELHH",
        "publishTime": start,  # publish time is not used for matching
        "startTime": start,
        "settlementDate": "2026-02-01",
        "settlementPeriod": period,
        "fuelType": "WIND",
        "generation": gen,
    }


ACTUALS: list[dict[str, Any]] = [
    _fuel("2026-02-01T00:00:00Z", 1, 1200),
    _fuel("2026-02-01T00:30:00Z", 2, 1300),
    _fuel("2026-02-01T01:00:00Z", 3, 1500),
    _fuel("2026-02-01T02:00:00Z", 5, 800),
]

EXPECTED = {
    "matched": 2,
    "evaluation_intervals": 24,
    "mae": 275.0,
    "rmse": math.sqrt(126250),
    "bias": 225.0,
    "wape": 100 * 550 / 2700,
    "bias_pct": 100 * 450 / 2700,
    "missing_forecast": 1,
    "missing_actual": 1,
    "missing_both": 20,
    "actual_records_available": 4,
    "intervals_with_actual": 3,
    "coverage_pct": round(100 * 2 / 24, 2),
}
