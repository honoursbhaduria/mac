"""End-to-end backend pipeline on synthetic fixtures:
Elexon response -> normalisation -> cutoff selection -> matching -> metrics -> JSON."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.fixtures import synthetic
from tests.fixtures.synthetic import EXPECTED

Q = {"decision_from": synthetic.DECISION_DATE, "decision_to": synthetic.DECISION_DATE, "decision_lead_hours": 24}


def by_start(body: dict[str, Any], start: str) -> dict[str, Any]:
    return next(r for r in body["intervals"] if r["start_time"] == start)


def test_full_pipeline_matches_hand_calculated_metrics(client: TestClient) -> None:
    res = client.get("/api/analysis", params=Q)
    assert res.status_code == 200
    body = res.json()
    m, c = body["metrics"], body["coverage"]
    assert m["matched_intervals"] == EXPECTED["matched"]
    assert m["mae_mw"] == pytest.approx(EXPECTED["mae"], abs=1e-3)
    assert m["rmse_mw"] == pytest.approx(EXPECTED["rmse"], abs=1e-3)
    assert m["bias_mw"] == pytest.approx(EXPECTED["bias"], abs=1e-3)
    assert m["wape_pct"] == pytest.approx(EXPECTED["wape"], abs=1e-3)
    assert m["bias_pct"] == pytest.approx(EXPECTED["bias_pct"], abs=1e-3)
    assert c["evaluation_intervals"] == EXPECTED["evaluation_intervals"]
    assert c["missing_forecast"] == EXPECTED["missing_forecast"]
    assert c["missing_actual"] == EXPECTED["missing_actual"]
    assert c["missing_both"] == EXPECTED["missing_both"]
    assert c["actual_records_available"] == EXPECTED["actual_records_available"]
    assert c["intervals_with_actual"] == EXPECTED["intervals_with_actual"]
    assert c["coverage_pct"] == EXPECTED["coverage_pct"]
    assert body["query"]["first_interval"] == "2026-02-01T00:00:00Z"
    assert body["stale"] is False
    assert {s["dataset"] for s in body["sources"]} == {"FUELHH", "WINDFOR"}


def test_post_cutoff_forecast_excluded_even_when_closer_to_actual(client: TestClient) -> None:
    body = client.get("/api/analysis", params=Q).json()
    t0 = by_start(body, "2026-02-01T00:00:00Z")
    # The 06:00 vintage (1200 MW) equals the actual exactly but was published after the cutoff.
    assert t0["forecast_mw"] == 1150
    assert t0["forecast_publish_time"] == "2026-01-31T00:00:00Z"
    assert t0["error_mw"] == -50
    t1 = by_start(body, "2026-02-01T01:00:00Z")
    assert t1["forecast_mw"] == 2000 and t1["error_mw"] == 500
    assert body["metrics"]["mae_mw"] > 0  # hindsight selection would have given 0


def test_missing_rows_are_reported_honestly(client: TestClient) -> None:
    body = client.get("/api/analysis", params=Q).json()
    t2 = by_start(body, "2026-02-01T02:00:00Z")
    assert t2["status"] == "missing_forecast" and t2["forecast_mw"] is None and t2["error_mw"] is None
    assert t2["actual_mw"] == 800 and "no_eligible_forecast" in t2["flags"]
    t3 = by_start(body, "2026-02-01T03:00:00Z")
    assert t3["status"] == "missing_actual" and t3["actual_mw"] is None and "no_actual" in t3["flags"]
    codes = {w["code"] for w in body["data_quality"]}
    assert {"missing_eligible_forecast", "missing_actual"} <= codes


def test_hourly_mean_alignment(client: TestClient) -> None:
    body = client.get("/api/analysis", params={**Q, "actual_alignment": "hourly_mean"}).json()
    t0 = by_start(body, "2026-02-01T00:00:00Z")
    assert t0["actual_mw"] == 1250 and t0["error_mw"] == -100
    assert by_start(body, "2026-02-01T01:00:00Z")["status"] == "missing_actual"
    assert body["metrics"]["matched_intervals"] == 1


def test_lead_time_parameter_changes_selection(client: TestClient) -> None:
    # With a 20 h lead the T1 cutoff is 01-31T05:00, so the 02:00 vintage (1500) becomes eligible.
    body = client.get("/api/analysis", params={**Q, "decision_lead_hours": 20}).json()
    t1 = by_start(body, "2026-02-01T01:00:00Z")
    assert t1["decision_cutoff"] == "2026-01-31T05:00:00Z"
    assert t1["forecast_mw"] == 1500 and t1["error_mw"] == 0


def test_daily_and_hourly_aggregates(client: TestClient) -> None:
    body = client.get("/api/analysis", params=Q).json()
    assert len(body["daily"]) == 1
    day = body["daily"][0]
    assert day["date"] == "2026-02-01" and day["intervals"] == 24 and day["matched"] == 2
    assert day["mae_mw"] == pytest.approx(275)
    assert [h["hour_london"] for h in body["hourly_profile"]] == [0, 1]
    assert sum(b["count"] for b in body["error_histogram"]) == 2


def test_forecast_vintages_identify_selected_publication(client: TestClient) -> None:
    res = client.get("/api/forecast-vintages", params={"start_time": "2026-02-01T00:00:00Z"})
    assert res.status_code == 200
    body = res.json()
    assert body["decision_cutoff"] == "2026-01-31T00:00:00Z"
    assert [v["publish_time"] for v in body["vintages"]] == [
        "2026-01-30T10:00:00Z",
        "2026-01-30T23:30:00Z",
        "2026-01-31T00:00:00Z",
        "2026-01-31T06:00:00Z",
    ]
    assert [v["eligible"] for v in body["vintages"]] == [True, True, True, False]
    assert [v["selected"] for v in body["vintages"]] == [False, False, True, False]
    assert body["selected"]["forecast_mw"] == 1150
    assert body["selected"]["error_mw"] == -50
    assert body["actual_mw"] == 1200


def test_forecast_vintages_with_explicit_cutoff(client: TestClient) -> None:
    body = client.get(
        "/api/forecast-vintages",
        params={"start_time": "2026-02-01T00:00:00Z", "decision_cutoff": "2026-01-30T12:00:00Z"},
    ).json()
    assert body["selected"]["publish_time"] == "2026-01-30T10:00:00Z"
    assert body["decision_lead_hours"] is None


def test_actuals_endpoint(client: TestClient) -> None:
    res = client.get("/api/actuals", params={"delivery_from": "2026-02-01", "delivery_to": "2026-02-01"})
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 4
    assert body["records"][0]["start_time"] == "2026-02-01T00:00:00Z"
    assert body["records"][0]["settlement_period"] == 1
