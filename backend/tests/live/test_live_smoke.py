"""Optional smoke test against the real Elexon API.

Skipped unless RUN_LIVE_TESTS=1 so the normal suite never depends on the network:

    RUN_LIVE_TESTS=1 pytest tests/live -v
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(os.environ.get("RUN_LIVE_TESTS") != "1", reason="set RUN_LIVE_TESTS=1 to hit Elexon"),
]


@pytest.fixture(scope="module")
def live() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(_env_file=None))) as tc:
        yield tc


def test_live_analysis_single_day(live: TestClient) -> None:
    res = live.get("/api/analysis", params={"decision_from": "2026-01-15", "decision_to": "2026-01-15"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["coverage"]["evaluation_intervals"] == 24
    assert body["metrics"]["matched_intervals"] > 0
    assert body["metrics"]["mae_mw"] is not None
    for rec in body["intervals"]:
        if rec["forecast_publish_time"]:
            assert rec["forecast_publish_time"] <= rec["decision_cutoff"]


def test_live_vintages(live: TestClient) -> None:
    res = live.get("/api/forecast-vintages", params={"start_time": "2026-01-16T12:00:00Z"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["vintages"], "expected WINDFOR vintages for a historical interval"
    assert body["selected"] is not None and body["selected"]["eligible"]
