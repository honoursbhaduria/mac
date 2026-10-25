from datetime import UTC, date, datetime, timedelta

import pandas as pd

from app.services.data_normalization import normalize_actuals, normalize_forecasts
from app.services.forecast_selection import build_hourly_grid, select_decision_forecasts, vintage_history
from app.services.matching import match_intervals
from app.utils.timestamps import london_date_range_to_utc

LEAD = timedelta(hours=24)


def wf(start: str, publish: str, gen: float) -> dict[str, object]:
    return {"startTime": start, "publishTime": publish, "generation": gen}


def grid_of(*starts: str) -> pd.DatetimeIndex:
    return pd.DatetimeIndex([pd.Timestamp(s) for s in starts]).as_unit("ns")


def select(raw: list[dict[str, object]], *starts: str, lead: timedelta = LEAD) -> pd.DataFrame:
    return select_decision_forecasts(normalize_forecasts(raw).frame, grid_of(*starts), lead)


def test_selects_latest_vintage_published_before_cutoff() -> None:
    raw = [
        wf("2026-01-10T12:00:00Z", "2026-01-08T12:00:00Z", 100),
        wf("2026-01-10T12:00:00Z", "2026-01-09T09:30:00Z", 200),  # latest eligible
        wf("2026-01-10T12:00:00Z", "2026-01-09T04:30:00Z", 150),
    ]
    out = select(raw, "2026-01-10T12:00:00Z")
    row = out.iloc[0]
    assert row["forecast_mw"] == 200
    assert row["forecast_publish_time"] == pd.Timestamp("2026-01-09T09:30:00Z")
    assert row["decision_cutoff"] == pd.Timestamp("2026-01-09T12:00:00Z")
    assert row["vintages_eligible"] == 3


def test_rejects_forecast_published_after_cutoff_even_if_newer() -> None:
    raw = [
        wf("2026-01-10T12:00:00Z", "2026-01-09T09:30:00Z", 200),
        wf("2026-01-10T12:00:00Z", "2026-01-09T12:00:01Z", 999),  # one second late
        wf("2026-01-10T12:00:00Z", "2026-01-10T09:30:00Z", 888),
    ]
    out = select(raw, "2026-01-10T12:00:00Z")
    assert out.iloc[0]["forecast_mw"] == 200
    assert out.iloc[0]["vintages_eligible"] == 1


def test_publish_time_equal_to_cutoff_is_eligible() -> None:
    raw = [
        wf("2026-01-10T12:00:00Z", "2026-01-09T09:30:00Z", 200),
        wf("2026-01-10T12:00:00Z", "2026-01-09T12:00:00Z", 210),
    ]
    assert select(raw, "2026-01-10T12:00:00Z").iloc[0]["forecast_mw"] == 210


def test_no_eligible_forecast_gives_nan_not_a_substitute() -> None:
    raw = [wf("2026-01-10T12:00:00Z", "2026-01-10T00:00:00Z", 500)]
    row = select(raw, "2026-01-10T12:00:00Z").iloc[0]
    assert pd.isna(row["forecast_mw"])
    assert pd.isna(row["forecast_publish_time"])
    assert row["vintages_eligible"] == 0


def test_forecasts_for_other_intervals_are_not_used() -> None:
    raw = [wf("2026-01-10T13:00:00Z", "2026-01-08T00:00:00Z", 777)]
    assert pd.isna(select(raw, "2026-01-10T12:00:00Z").iloc[0]["forecast_mw"])


def test_lead_time_changes_selection() -> None:
    raw = [
        wf("2026-01-10T12:00:00Z", "2026-01-08T12:00:00Z", 100),
        wf("2026-01-10T12:00:00Z", "2026-01-10T06:00:00Z", 300),
    ]
    assert select(raw, "2026-01-10T12:00:00Z", lead=timedelta(hours=24)).iloc[0]["forecast_mw"] == 100
    assert select(raw, "2026-01-10T12:00:00Z", lead=timedelta(hours=6)).iloc[0]["forecast_mw"] == 300


def test_matching_uses_normalised_delivery_start_time() -> None:
    forecasts = normalize_forecasts([wf("2026-07-10T12:00:00+01:00", "2026-07-09T00:00:00Z", 100)])
    actuals = normalize_actuals(
        [
            {"startTime": "2026-07-10T11:00:00Z", "generation": 90, "fuelType": "WIND"},  # same instant
            {"startTime": "2026-07-10T12:00:00Z", "generation": 5000, "fuelType": "WIND"},  # wrong hour
        ]
    )
    sel = select_decision_forecasts(forecasts.frame, grid_of("2026-07-10T11:00:00Z"), LEAD)
    row = match_intervals(sel, actuals.frame, "exact").iloc[0]
    assert row["actual_mw"] == 90
    assert row["error_mw"] == 10
    assert row["status"] == "matched"


def test_missing_actual_is_reported_and_has_no_error() -> None:
    forecasts = normalize_forecasts([wf("2026-01-10T12:00:00Z", "2026-01-09T00:00:00Z", 100)])
    sel = select_decision_forecasts(forecasts.frame, grid_of("2026-01-10T12:00:00Z"), LEAD)
    row = match_intervals(sel, normalize_actuals([]).frame, "exact").iloc[0]
    assert row["status"] == "missing_actual"
    assert pd.isna(row["error_mw"]) and pd.isna(row["actual_mw"])


def test_hourly_mean_requires_both_half_hours() -> None:
    forecasts = normalize_forecasts(
        [
            wf("2026-01-10T12:00:00Z", "2026-01-09T00:00:00Z", 100),
            wf("2026-01-10T13:00:00Z", "2026-01-09T00:00:00Z", 100),
        ]
    )
    actuals = normalize_actuals(
        [
            {"startTime": "2026-01-10T12:00:00Z", "generation": 80, "fuelType": "WIND"},
            {"startTime": "2026-01-10T12:30:00Z", "generation": 120, "fuelType": "WIND"},
            {"startTime": "2026-01-10T13:00:00Z", "generation": 50, "fuelType": "WIND"},
        ]
    )
    sel = select_decision_forecasts(forecasts.frame, grid_of("2026-01-10T12:00:00Z", "2026-01-10T13:00:00Z"), LEAD)
    out = match_intervals(sel, actuals.frame, "hourly_mean")
    assert out.iloc[0]["actual_mw"] == 100
    assert out.iloc[0]["error_mw"] == 0
    assert out.iloc[1]["status"] == "missing_actual"  # 13:30 missing: not estimated from 13:00 alone


def test_output_preserves_chronological_interval_order() -> None:
    raw = [wf(f"2026-01-10T{h:02d}:00:00Z", "2026-01-08T00:00:00Z", h) for h in (5, 1, 3, 2, 4)]
    starts = [f"2026-01-10T{h:02d}:00:00Z" for h in (4, 2, 5, 1, 3)]
    out = select(raw, *starts)
    assert out["start_time"].is_monotonic_increasing
    assert out["forecast_mw"].tolist() == [1, 2, 3, 4, 5]


def test_grid_spans_january_to_february_delivery_boundary() -> None:
    lo, hi = london_date_range_to_utc(date(2026, 1, 31), date(2026, 1, 31))
    grid = build_hourly_grid(lo, hi, LEAD)
    assert len(grid) == 24
    assert grid[0] == pd.Timestamp("2026-02-01T00:00:00Z")
    assert grid[-1] == pd.Timestamp("2026-02-01T23:00:00Z")


def test_full_january_decision_window_reaches_into_february() -> None:
    lo, hi = london_date_range_to_utc(date(2026, 1, 1), date(2026, 1, 31))
    grid = build_hourly_grid(lo, hi, LEAD)
    assert len(grid) == 31 * 24
    assert grid[0] == pd.Timestamp("2026-01-02T00:00:00Z")
    assert grid[-1] == pd.Timestamp("2026-02-01T23:00:00Z")


def test_grid_intersects_delivery_window() -> None:
    lo, hi = london_date_range_to_utc(date(2026, 1, 1), date(2026, 1, 31))
    dlo, dhi = london_date_range_to_utc(date(2026, 1, 10), date(2026, 1, 10))
    grid = build_hourly_grid(lo, hi, LEAD, dlo, dhi)
    assert len(grid) == 24 and grid[0] == pd.Timestamp("2026-01-10T00:00:00Z")
    empty = build_hourly_grid(lo, hi, LEAD, *london_date_range_to_utc(date(2026, 3, 1), date(2026, 3, 2)))
    assert len(empty) == 0


def test_half_hour_lead_rounds_grid_to_whole_hours() -> None:
    lo = datetime(2026, 1, 1, tzinfo=UTC)
    grid = build_hourly_grid(lo, lo + timedelta(hours=3), timedelta(hours=1.5))
    assert [t.strftime("%H:%M") for t in grid] == ["02:00", "03:00", "04:00"]


def test_vintage_history_flags_eligibility_and_selection() -> None:
    raw = [
        wf("2026-01-10T12:00:00Z", "2026-01-09T13:00:00Z", 300),
        wf("2026-01-10T12:00:00Z", "2026-01-08T12:00:00Z", 100),
        wf("2026-01-10T12:00:00Z", "2026-01-09T09:30:00Z", 200),
    ]
    frame = normalize_forecasts(raw).frame
    history = vintage_history(frame, datetime(2026, 1, 10, 12, tzinfo=UTC), datetime(2026, 1, 9, 12, tzinfo=UTC))
    assert [v.forecast_mw for v in history] == [100, 200, 300]
    assert [v.eligible for v in history] == [True, True, False]
    assert [v.selected for v in history] == [False, True, False]
    assert history[1].horizon_hours == 26.5
