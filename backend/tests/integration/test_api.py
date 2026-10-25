"""Route-level behaviour: schemas, validation, upstream failures, CORS, cache, CSV."""

from __future__ import annotations

import csv
import io

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings
from app.schemas.analysis import AnalysisResponse
from app.schemas.forecast import ActualsResponse, VintagesResponse
from tests.conftest import make_client
from tests.fixtures import synthetic
from tests.fixtures.fake_elexon import FakeElexon

Q = {"decision_from": synthetic.DECISION_DATE, "decision_to": synthetic.DECISION_DATE, "decision_lead_hours": 24}


# ---------------------------------------------------------------- schemas & meta


def test_health(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["version"]
    assert body["upstream"]["checked"] is False  # never claims upstream health it did not check


def test_metadata(client: TestClient) -> None:
    body = client.get("/api/metadata").json()
    assert body["api_key_required"] is False
    assert body["defaults"] == {
        "decision_from": "2026-01-01",
        "decision_to": "2026-01-31",
        "decision_lead_hours": 24.0,
        "actual_alignment": "exact",
    }
    assert {m["key"] for m in body["metrics"]} >= {"mae_mw", "rmse_mw", "bias_mw", "wape_pct"}
    assert {s["dataset"] for s in body["sources"]} == {"FUELHH", "WINDFOR"}


def test_responses_validate_against_schemas(client: TestClient) -> None:
    AnalysisResponse.model_validate(client.get("/api/analysis", params=Q).json())
    VintagesResponse.model_validate(
        client.get("/api/forecast-vintages", params={"start_time": "2026-02-01T00:00:00Z"}).json()
    )
    ActualsResponse.model_validate(
        client.get("/api/actuals", params={"delivery_from": "2026-02-01", "delivery_to": "2026-02-01"}).json()
    )


def test_openapi_docs_available(client: TestClient) -> None:
    assert client.get("/api/openapi.json").status_code == 200
    assert client.get("/api/docs").status_code == 200


# ---------------------------------------------------------------- validation


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/analysis", {"decision_from": "2026-02-01", "decision_to": "2026-01-01"}),
        ("/api/analysis", {"decision_from": "not-a-date"}),
        ("/api/analysis", {"decision_lead_hours": "-3"}),
        ("/api/analysis", {"decision_lead_hours": "500"}),
        ("/api/analysis", {"decision_lead_hours": "1.3"}),
        ("/api/analysis", {"decision_from": "2025-01-01", "decision_to": "2026-01-01"}),
        ("/api/analysis", {"delivery_from": "2026-01-05"}),
        ("/api/analysis", {"actual_alignment": "nearest"}),
        ("/api/export.csv", {"decision_from": "2026-02-01", "decision_to": "2026-01-01"}),
        ("/api/forecast-vintages", {}),
        ("/api/forecast-vintages", {"start_time": "yesterday"}),
        ("/api/forecast-vintages", {"start_time": "2026-02-01T00:30:00Z"}),
        ("/api/forecast-vintages", {"start_time": "2026-02-01T00:00:00"}),
        ("/api/forecast-vintages", {"start_time": "2026-02-01T00:00:00Z", "decision_cutoff": "2026-02-02T00:00:00Z"}),
        ("/api/actuals", {"delivery_from": "2026-02-02", "delivery_to": "2026-02-01"}),
        ("/api/actuals", {"delivery_from": "2026-01-01"}),
    ],
)
def test_invalid_inputs_return_422_with_error_body(client: TestClient, path: str, params: dict[str, str]) -> None:
    res = client.get(path, params=params)
    assert res.status_code == 422, res.text
    body = res.json()
    assert body["error"]["code"] == "invalid_request"
    assert "Traceback" not in res.text


def test_empty_upstream_data_gives_null_metrics_not_fake_values(settings: Settings, mock_api: respx.MockRouter) -> None:
    empty = FakeElexon([], [])
    mock_api.get("/datasets/FUELHH/stream").mock(side_effect=empty)
    mock_api.get("/datasets/WINDFOR/stream").mock(side_effect=empty)
    with make_client(settings) as tc:
        body = tc.get("/api/analysis", params=Q).json()
    assert body["metrics"]["matched_intervals"] == 0
    assert body["metrics"]["mae_mw"] is None and body["metrics"]["wape_pct"] is None
    assert all(r["forecast_mw"] is None and r["actual_mw"] is None for r in body["intervals"])
    assert body["coverage"]["missing_both"] == 24


def test_window_with_no_intervals(client: TestClient) -> None:
    body = client.get("/api/analysis", params={**Q, "delivery_from": "2026-03-01", "delivery_to": "2026-03-02"}).json()
    assert body["intervals"] == []
    assert any(w["code"] == "empty_window" for w in body["data_quality"])


# ---------------------------------------------------------------- upstream failures


def _mock_both(mock_api: respx.MockRouter, **kwargs: object) -> None:
    mock_api.get("/datasets/FUELHH/stream").mock(**kwargs)  # type: ignore[arg-type]
    mock_api.get("/datasets/WINDFOR/stream").mock(**kwargs)  # type: ignore[arg-type]


def test_429_with_retry_after_is_retried_then_succeeds(
    settings: Settings, mock_api: respx.MockRouter, fake: FakeElexon
) -> None:
    state = {"n": 0}

    def flaky(request: httpx.Request) -> httpx.Response:
        state["n"] += 1
        if state["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "0"})
        return fake(request)

    _mock_both(mock_api, side_effect=flaky)
    with make_client(settings) as tc:
        res = tc.get("/api/analysis", params=Q)
    assert res.status_code == 200
    assert res.json()["metrics"]["matched_intervals"] == 2


def test_persistent_429_returns_503(settings: Settings, mock_api: respx.MockRouter) -> None:
    _mock_both(mock_api, return_value=httpx.Response(429, headers={"Retry-After": "0"}))
    with make_client(settings) as tc:
        res = tc.get("/api/analysis", params=Q)
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "upstream_rate_limited"
    # Bounded retries: one WINDFOR chunk + one FUELHH chunk, each tried 1 + max_retries times.
    assert mock_api.calls.call_count == 2 * (settings.max_retries + 1)


def test_upstream_5xx_returns_502_without_crashing(settings: Settings, mock_api: respx.MockRouter) -> None:
    _mock_both(mock_api, return_value=httpx.Response(500, text="boom"))
    with make_client(settings) as tc:
        res = tc.get("/api/analysis", params=Q)
        assert tc.get("/api/health").json()["upstream"]["last_failure_kind"] == "http_error"
    assert res.status_code == 502
    assert res.json()["error"]["code"] == "upstream_http_error"
    assert "boom" not in res.text


def test_upstream_timeout_returns_504(settings: Settings, mock_api: respx.MockRouter) -> None:
    _mock_both(mock_api, side_effect=httpx.ReadTimeout("slow"))
    with make_client(settings) as tc:
        res = tc.get("/api/analysis", params=Q)
    assert res.status_code == 504
    assert res.json()["error"]["code"] == "upstream_timeout"


def test_connection_error_returns_503(settings: Settings, mock_api: respx.MockRouter) -> None:
    _mock_both(mock_api, side_effect=httpx.ConnectError("refused"))
    with make_client(settings) as tc:
        assert tc.get("/api/analysis", params=Q).status_code == 503


def test_malformed_json_returns_502(settings: Settings, mock_api: respx.MockRouter) -> None:
    _mock_both(mock_api, return_value=httpx.Response(200, text="<html>not json"))
    with make_client(settings) as tc:
        res = tc.get("/api/analysis", params=Q)
    assert res.status_code == 502
    assert res.json()["error"]["code"] == "upstream_malformed"


def test_unexpected_shape_returns_502(settings: Settings, mock_api: respx.MockRouter) -> None:
    _mock_both(mock_api, return_value=httpx.Response(200, json={"unexpected": True}))
    with make_client(settings) as tc:
        assert tc.get("/api/analysis", params=Q).status_code == 502


def test_malformed_records_produce_quality_warnings(settings: Settings, mock_api: respx.MockRouter) -> None:
    bad_actuals = [
        *synthetic.ACTUALS,
        {"startTime": "2026-02-01T05:00:00Z", "settlementDate": "2026-02-01", "fuelType": "WIND", "generation": "n/a"},
    ]
    bad_forecasts = [
        *synthetic.FORECASTS,
        {"startTime": "2026-02-01T05:00:00Z", "publishTime": "2026-01-30T00:00:00Z", "generation": None},
    ]
    fake = FakeElexon(bad_actuals, bad_forecasts)
    _mock_both(mock_api, side_effect=fake)
    with make_client(settings) as tc:
        body = tc.get("/api/analysis", params=Q).json()
    codes = {w["code"]: w["count"] for w in body["data_quality"]}
    assert codes["fuelhh_bad_generation"] == 1
    assert codes["windfor_bad_generation"] == 1
    assert body["metrics"]["matched_intervals"] == 2  # bad rows not imputed


# ---------------------------------------------------------------- CORS


def test_cors_allows_configured_origin(client: TestClient) -> None:
    res = client.get("/api/health", headers={"Origin": "http://allowed.example"})
    assert res.headers.get("access-control-allow-origin") == "http://allowed.example"
    pre = client.options(
        "/api/analysis",
        headers={"Origin": "http://allowed.example", "Access-Control-Request-Method": "GET"},
    )
    assert pre.status_code == 200


def test_cors_rejects_unknown_origin(client: TestClient) -> None:
    res = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in res.headers


# ---------------------------------------------------------------- cache


def test_cache_hit_avoids_second_download(client: TestClient, fake: FakeElexon) -> None:
    client.get("/api/analysis", params=Q)
    first = len(fake.calls)
    assert first > 0
    client.get("/api/analysis", params=Q)
    assert len(fake.calls) == first
    stats = client.get("/api/health").json()["cache"]
    assert stats["hits"] >= first


def test_cache_expiry_triggers_refetch(settings: Settings, mock_api: respx.MockRouter, fake: FakeElexon) -> None:
    settings.cache_ttl_seconds = 0
    settings.historical_cache_ttl_seconds = 0
    _mock_both(mock_api, side_effect=fake)
    with make_client(settings) as tc:
        tc.get("/api/analysis", params=Q)
        first = len(fake.calls)
        tc.get("/api/analysis", params=Q)
    assert len(fake.calls) == 2 * first


def test_expired_cache_served_as_stale_when_upstream_fails(
    settings: Settings, mock_api: respx.MockRouter, fake: FakeElexon
) -> None:
    settings.cache_ttl_seconds = 0
    settings.historical_cache_ttl_seconds = 0
    state = {"fail": False}

    def maybe_fail(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503) if state["fail"] else fake(request)

    _mock_both(mock_api, side_effect=maybe_fail)
    with make_client(settings) as tc:
        fresh = tc.get("/api/analysis", params=Q).json()
        state["fail"] = True
        res = tc.get("/api/analysis", params=Q)
    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is True
    assert all(s["stale"] for s in body["sources"])
    assert any(w["code"].endswith("_stale_cache") for w in body["data_quality"])
    assert "stale_source" in body["intervals"][0]["flags"]
    assert body["metrics"] == fresh["metrics"]  # same cached records, not substitutes


# ---------------------------------------------------------------- CSV


def test_csv_export_matches_api_response(client: TestClient) -> None:
    api = client.get("/api/analysis", params=Q).json()
    res = client.get("/api/export.csv", params=Q)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(res.text)))
    assert len(rows) == len(api["intervals"])
    for row, rec in zip(rows, api["intervals"], strict=True):
        assert row["delivery_start_utc"] == rec["start_time"]
        assert row["status"] == rec["status"]
        assert (row["forecast_mw"] or None) == (None if rec["forecast_mw"] is None else str(rec["forecast_mw"]))
        assert (row["error_mw"] or None) == (None if rec["error_mw"] is None else str(rec["error_mw"]))
    matched = [r for r in rows if r["status"] == "matched"]
    mae = sum(abs(float(r["error_mw"])) for r in matched) / len(matched)
    assert mae == pytest.approx(api["metrics"]["mae_mw"])
    assert res.headers["x-matched-intervals"] == str(api["metrics"]["matched_intervals"])


def test_csv_export_respects_filters(client: TestClient) -> None:
    res = client.get("/api/export.csv", params={**Q, "decision_lead_hours": 20})
    rows = list(csv.DictReader(io.StringIO(res.text)))
    t1 = next(r for r in rows if r["delivery_start_utc"] == "2026-02-01T01:00:00Z")
    assert t1["forecast_mw"] == "1500.0" and t1["decision_lead_hours"] == "20.0"


def test_services_initialise_lazily_without_lifespan(
    settings: Settings, mock_api: respx.MockRouter, fake: FakeElexon
) -> None:
    """Serverless hosts may not send ASGI lifespan events; requests must still work."""
    _mock_both(mock_api, side_effect=fake)
    tc = make_client(settings)  # not used as a context manager => lifespan never runs
    assert tc.get("/api/health").status_code == 200
    assert tc.get("/api/analysis", params=Q).json()["metrics"]["matched_intervals"] == 2
