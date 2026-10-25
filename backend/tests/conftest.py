from __future__ import annotations

from collections.abc import Iterator

import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.fixtures import synthetic
from tests.fixtures.fake_elexon import FakeElexon

BASE_URL = "https://elexon.test/bmrs/api/v1"


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "live: hits the real Elexon API (opt-in with RUN_LIVE_TESTS=1)")


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        elexon_base_url=BASE_URL,
        retry_backoff_seconds=0,
        max_retries=2,
        cache_ttl_seconds=600,
        historical_cache_ttl_seconds=600,
        cors_origins="http://allowed.example",
        log_level="WARNING",
    )


@pytest.fixture
def fake() -> FakeElexon:
    return FakeElexon(list(synthetic.ACTUALS), list(synthetic.FORECASTS))


@pytest.fixture
def mock_api() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        yield router


@pytest.fixture
def client(settings: Settings, mock_api: respx.MockRouter, fake: FakeElexon) -> Iterator[TestClient]:
    mock_api.get("/datasets/FUELHH/stream").mock(side_effect=fake)
    mock_api.get("/datasets/WINDFOR/stream").mock(side_effect=fake)
    with TestClient(create_app(settings), raise_server_exceptions=False) as tc:
        yield tc


def make_client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings), raise_server_exceptions=False)
