"""Validate and normalise raw FUELHH / WINDFOR records into typed DataFrames.

Rules
-----
* Timestamps are parsed and normalised to UTC. Values without an explicit offset are
  interpreted as UTC (Elexon's documented convention) and reported as a warning.
* Records with missing, malformed or non-numeric fields are rejected and counted;
  nothing is imputed.
* Duplicate policy (deterministic, never averaged):
  - Actuals keyed by ``startTime``: keep the record with the latest ``publishTime``
    (the most recent revision); ties keep the last record in source order.
  - Forecasts keyed by ``(startTime, publishTime)``: keep the last record in source
    order. Identical duplicates are collapsed silently; conflicting values raise a warning.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal

import pandas as pd

from app.utils.frames import frame_records
from app.utils.timestamps import london_date_range_to_utc, parse_timestamp, utc_series

Severity = Literal["info", "warning", "error"]

ACTUAL_COLUMNS = ["start_time", "actual_mw", "actual_publish_time", "settlement_date", "settlement_period"]
FORECAST_COLUMNS = ["start_time", "publish_time", "forecast_mw"]


@dataclass(frozen=True)
class QualityWarning:
    code: str
    message: str
    count: int = 0
    severity: Severity = "warning"


@dataclass
class Normalized:
    frame: pd.DataFrame
    warnings: list[QualityWarning] = field(default_factory=list)
    received: int = 0
    rejected: int = 0


def _numeric(value: Any) -> float | None:
    """Accept ints/floats (not bools) and numeric strings; reject NaN/inf."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


class _Tally:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}

    def add(self, code: str) -> None:
        self.counts[code] = self.counts.get(code, 0) + 1


_MESSAGES: dict[str, tuple[str, Severity]] = {
    "not_an_object": ("{ds}: records that were not JSON objects were rejected.", "warning"),
    "bad_start_time": ("{ds}: records with a missing or unparseable startTime were rejected.", "warning"),
    "bad_publish_time": ("{ds}: records with a missing or unparseable publishTime were rejected.", "warning"),
    "bad_generation": ("{ds}: records with null or non-numeric generation were rejected.", "warning"),
    "naive_timestamp": (
        "{ds}: timestamps without a UTC offset were interpreted as UTC (Elexon's documented convention).",
        "warning",
    ),
    "misaligned_start": ("{ds}: startTime values not on a half-hour boundary were rejected.", "warning"),
    "wrong_fuel_type": ("{ds}: records with a fuelType other than WIND were rejected.", "warning"),
    "negative_generation": ("{ds}: negative generation values were kept as reported.", "info"),
    "settlement_period_mismatch": (
        "{ds}: settlementDate/settlementPeriod disagreed with startTime; startTime was used for matching.",
        "warning",
    ),
    "duplicate_identical": ("{ds}: identical duplicate records were collapsed.", "info"),
    "duplicate_conflict": (
        "{ds}: conflicting duplicate records were resolved deterministically (see duplicate policy).",
        "warning",
    ),
}


def _warnings(dataset: str, tally: _Tally) -> list[QualityWarning]:
    out = []
    for code, count in sorted(tally.counts.items()):
        template, severity = _MESSAGES[code]
        out.append(QualityWarning(f"{dataset.lower()}_{code}", template.format(ds=dataset), count, severity))
    return out


def _parse_time(record: dict[str, Any], key: str, tally: _Tally, bad_code: str) -> pd.Timestamp | None:
    try:
        parsed, naive = parse_timestamp(record.get(key))
    except ValueError:
        tally.add(bad_code)
        return None
    if naive:
        tally.add("naive_timestamp")
    return pd.Timestamp(parsed)


def normalize_actuals(raw: list[Any]) -> Normalized:
    tally = _Tally()
    rows: list[dict[str, Any]] = []
    for order, rec in enumerate(raw):
        if not isinstance(rec, dict):
            tally.add("not_an_object")
            continue
        fuel = rec.get("fuelType")
        if fuel is not None and str(fuel).upper() != "WIND":
            tally.add("wrong_fuel_type")
            continue
        start = _parse_time(rec, "startTime", tally, "bad_start_time")
        if start is None:
            continue
        if start.second or start.microsecond or start.minute % 30:
            tally.add("misaligned_start")
            continue
        gen = _numeric(rec.get("generation"))
        if gen is None:
            tally.add("bad_generation")
            continue
        if gen < 0:
            tally.add("negative_generation")
        publish: pd.Timestamp | None = None
        if rec.get("publishTime") is not None:
            publish = _parse_time(rec, "publishTime", tally, "bad_publish_time")
            if publish is None:
                continue
        period = rec.get("settlementPeriod")
        rows.append(
            {
                "start_time": start,
                "actual_mw": gen,
                "actual_publish_time": publish,
                "settlement_date": rec.get("settlementDate"),
                "settlement_period": period if isinstance(period, int) and not isinstance(period, bool) else None,
                "_order": order,
            }
        )
    frame = pd.DataFrame(rows, columns=[*ACTUAL_COLUMNS, "_order"])
    frame["start_time"] = utc_series(frame["start_time"])
    frame["actual_publish_time"] = utc_series(frame["actual_publish_time"])
    frame["actual_mw"] = frame["actual_mw"].astype("float64")

    if not frame.empty:
        dup_mask = frame.duplicated("start_time", keep=False)
        if dup_mask.any():
            groups = frame[dup_mask].groupby("start_time")
            conflicting = int((groups["actual_mw"].nunique() > 1).sum())
            identical = int(groups.ngroups - conflicting)
            if conflicting:
                tally.counts["duplicate_conflict"] = conflicting
            if identical:
                tally.counts["duplicate_identical"] = identical
            # NaT publish times sort first, so a timed revision always wins over an untimed one.
            frame = frame.sort_values(["start_time", "actual_publish_time", "_order"], na_position="first")
            frame = frame.drop_duplicates("start_time", keep="last")
    frame = frame.sort_values("start_time").drop(columns="_order").reset_index(drop=True)
    mismatched = _settlement_period_mismatches(frame)
    if mismatched:
        tally.counts["settlement_period_mismatch"] = mismatched
    return Normalized(frame, _warnings("FUELHH", tally), len(raw), len(raw) - len(rows))


def _settlement_period_mismatches(frame: pd.DataFrame) -> int:
    """Count rows whose (settlementDate, settlementPeriod) disagrees with startTime.

    Settlement period ``n`` of a London settlement date starts ``30 * (n - 1)`` elapsed
    minutes after local midnight (so DST days have 46 or 50 periods). Mismatches are
    reported, not corrected: ``startTime`` remains the matching key.
    """
    subset = frame.dropna(subset=["settlement_date", "settlement_period"])
    mismatches = 0
    rows = frame_records(subset)
    for row in rows:
        try:
            day = date.fromisoformat(str(row["settlement_date"]))
        except ValueError:
            mismatches += 1
            continue
        midnight, _ = london_date_range_to_utc(day, day)
        expected = midnight + timedelta(minutes=30 * (int(row["settlement_period"]) - 1))
        if pd.Timestamp(expected) != row["start_time"]:
            mismatches += 1
    return mismatches


def normalize_forecasts(raw: list[Any]) -> Normalized:
    tally = _Tally()
    rows: list[dict[str, Any]] = []
    for order, rec in enumerate(raw):
        if not isinstance(rec, dict):
            tally.add("not_an_object")
            continue
        start = _parse_time(rec, "startTime", tally, "bad_start_time")
        if start is None:
            continue
        if start.second or start.microsecond or start.minute % 30:
            tally.add("misaligned_start")
            continue
        publish = _parse_time(rec, "publishTime", tally, "bad_publish_time")
        if publish is None:
            continue
        gen = _numeric(rec.get("generation"))
        if gen is None:
            tally.add("bad_generation")
            continue
        if gen < 0:
            tally.add("negative_generation")
        rows.append({"start_time": start, "publish_time": publish, "forecast_mw": gen, "_order": order})
    frame = pd.DataFrame(rows, columns=[*FORECAST_COLUMNS, "_order"])
    frame["start_time"] = utc_series(frame["start_time"])
    frame["publish_time"] = utc_series(frame["publish_time"])
    frame["forecast_mw"] = frame["forecast_mw"].astype("float64")

    if not frame.empty:
        key = ["start_time", "publish_time"]
        dup_mask = frame.duplicated(key, keep=False)
        if dup_mask.any():
            groups = frame[dup_mask].groupby(key)
            conflicting = int((groups["forecast_mw"].nunique() > 1).sum())
            identical = int(groups.ngroups - conflicting)
            if conflicting:
                tally.counts["duplicate_conflict"] = conflicting
            if identical:
                tally.counts["duplicate_identical"] = identical
            frame = frame.sort_values("_order").drop_duplicates(key, keep="last")
    frame = frame.sort_values(["start_time", "publish_time"]).drop(columns="_order").reset_index(drop=True)
    return Normalized(frame, _warnings("WINDFOR", tally), len(raw), len(raw) - len(rows))
