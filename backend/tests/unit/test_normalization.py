from typing import Any

import pandas as pd

from app.services.data_normalization import normalize_actuals, normalize_forecasts


def fuel(start: str, gen: Any, publish: str | None = None, **extra: Any) -> dict[str, Any]:
    rec: dict[str, Any] = {"startTime": start, "generation": gen, "fuelType": "WIND"}
    if publish is not None:
        rec["publishTime"] = publish
    rec.update(extra)
    return rec


def wf(start: str, publish: str, gen: Any) -> dict[str, Any]:
    return {"startTime": start, "publishTime": publish, "generation": gen}


def codes(result: Any) -> dict[str, int]:
    return {w.code: w.count for w in result.warnings}


def test_actual_duplicates_keep_latest_publish_time_regardless_of_order() -> None:
    a = fuel("2026-01-01T00:00:00Z", 100, "2026-01-01T00:30:00Z")
    b = fuel("2026-01-01T00:00:00Z", 120, "2026-01-01T02:00:00Z")  # later revision
    for raw in ([a, b], [b, a]):
        result = normalize_actuals(raw)
        assert len(result.frame) == 1
        assert result.frame["actual_mw"].iloc[0] == 120
        assert codes(result)["fuelhh_duplicate_conflict"] == 1


def test_actual_duplicate_tie_keeps_last_in_source_order() -> None:
    raw = [fuel("2026-01-01T00:00:00Z", 100), fuel("2026-01-01T00:00:00Z", 110)]
    result = normalize_actuals(raw)
    assert result.frame["actual_mw"].tolist() == [110]


def test_identical_duplicates_collapse_with_info_warning() -> None:
    raw = [fuel("2026-01-01T00:00:00Z", 100)] * 3
    result = normalize_actuals(raw)
    assert len(result.frame) == 1
    assert codes(result) == {"fuelhh_duplicate_identical": 1}


def test_forecast_duplicates_are_not_averaged() -> None:
    raw = [
        wf("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", 100),
        wf("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", 300),
    ]
    result = normalize_forecasts(raw)
    assert result.frame["forecast_mw"].tolist() == [300]  # last in source order, not 200
    assert codes(result)["windfor_duplicate_conflict"] == 1


def test_offset_timestamps_deduplicate_as_same_instant() -> None:
    raw = [
        wf("2026-07-02T12:00:00Z", "2026-07-01T09:00:00Z", 100),
        wf("2026-07-02T13:00:00+01:00", "2026-07-01T10:00:00+01:00", 100),
    ]
    result = normalize_forecasts(raw)
    assert len(result.frame) == 1


def test_null_malformed_and_nonnumeric_values_are_rejected_not_imputed() -> None:
    raw: list[Any] = [
        fuel("2026-01-01T00:00:00Z", None),
        fuel("2026-01-01T00:30:00Z", "abc"),
        fuel("2026-01-01T01:00:00Z", float("nan")),
        fuel("2026-01-01T01:30:00Z", True),
        fuel("garbage", 10),
        fuel("2026-01-01T02:10:00Z", 10),  # not on a half-hour boundary
        {"startTime": "2026-01-01T02:30:00Z", "generation": 10, "fuelType": "CCGT"},
        "not a dict",
        fuel("2026-01-01T03:00:00Z", "250.5"),  # numeric string is accepted
        fuel("2026-01-01T03:30:00Z", 7),
    ]
    result = normalize_actuals(raw)
    assert result.frame["actual_mw"].tolist() == [250.5, 7.0]
    assert result.rejected == 8
    c = codes(result)
    assert c["fuelhh_bad_generation"] == 4
    assert c["fuelhh_bad_start_time"] == 1
    assert c["fuelhh_misaligned_start"] == 1
    assert c["fuelhh_wrong_fuel_type"] == 1
    assert c["fuelhh_not_an_object"] == 1


def test_forecast_missing_publish_time_rejected() -> None:
    result = normalize_forecasts([{"startTime": "2026-01-02T00:00:00Z", "generation": 1}])
    assert result.frame.empty
    assert codes(result) == {"windfor_bad_publish_time": 1}


def test_naive_timestamps_produce_warning() -> None:
    result = normalize_forecasts([wf("2026-01-02T00:00:00", "2026-01-01T00:00:00Z", 5)])
    assert len(result.frame) == 1
    assert codes(result)["windfor_naive_timestamp"] == 1
    assert result.frame["start_time"].iloc[0] == pd.Timestamp("2026-01-02T00:00:00Z")


def test_negative_generation_kept_with_info_warning() -> None:
    result = normalize_actuals([fuel("2026-01-01T00:00:00Z", -12)])
    assert result.frame["actual_mw"].tolist() == [-12.0]
    assert codes(result) == {"fuelhh_negative_generation": 1}


def test_output_is_sorted_by_start_time() -> None:
    raw = [fuel("2026-01-01T01:00:00Z", 3), fuel("2026-01-01T00:00:00Z", 1), fuel("2026-01-01T00:30:00Z", 2)]
    result = normalize_actuals(raw)
    assert result.frame["actual_mw"].tolist() == [1, 2, 3]
    assert result.frame["start_time"].is_monotonic_increasing


def test_settlement_period_consistency_including_dst_day() -> None:
    ok = [
        fuel("2026-03-29T00:00:00Z", 1, settlementDate="2026-03-29", settlementPeriod=1),
        # After the spring-forward, 22:30Z is still period 46 of the 46-period day.
        fuel("2026-03-29T22:30:00Z", 1, settlementDate="2026-03-29", settlementPeriod=46),
        fuel("2026-07-01T23:00:00Z", 1, settlementDate="2026-07-02", settlementPeriod=1),
    ]
    assert codes(normalize_actuals(ok)) == {}
    bad = [fuel("2026-01-01T00:00:00Z", 1, settlementDate="2026-01-01", settlementPeriod=3)]
    assert codes(normalize_actuals(bad)) == {"fuelhh_settlement_period_mismatch": 1}


def test_empty_input() -> None:
    a = normalize_actuals([])
    f = normalize_forecasts([])
    assert a.frame.empty and f.frame.empty
    assert str(a.frame["start_time"].dtype) == "datetime64[ns, UTC]"
    assert str(f.frame["publish_time"].dtype) == "datetime64[ns, UTC]"
