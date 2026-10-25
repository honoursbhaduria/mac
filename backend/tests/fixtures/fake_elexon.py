"""A filter-aware fake of the two Elexon stream endpoints, for tests and E2E only.

It applies the same inclusive filter semantics observed on the real API:
* FUELHH: settlementDateFrom/To (inclusive) and fuelType.
* WINDFOR: publishDateTimeFrom/To (inclusive).
"""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx

from app.utils.timestamps import parse_timestamp


def filter_fuelhh(records: list[dict[str, Any]], params: dict[str, str]) -> list[dict[str, Any]]:
    lo = date.fromisoformat(params["settlementDateFrom"])
    hi = date.fromisoformat(params["settlementDateTo"])
    fuel = params.get("fuelType")
    out = []
    for r in records:
        sd = r.get("settlementDate")
        if not isinstance(sd, str) or not (lo <= date.fromisoformat(sd) <= hi):
            continue
        if fuel and r.get("fuelType") != fuel:
            continue
        out.append(r)
    return out


def filter_windfor(records: list[dict[str, Any]], params: dict[str, str]) -> list[dict[str, Any]]:
    lo, _ = parse_timestamp(params["publishDateTimeFrom"])
    hi, _ = parse_timestamp(params["publishDateTimeTo"])
    out = []
    for r in records:
        try:
            published, _ = parse_timestamp(r.get("publishTime"))
        except ValueError:
            out.append(r)  # let malformed rows through so normalisation can reject them
            continue
        if lo <= published <= hi:
            out.append(r)
    return out


class FakeElexon:
    """Callable usable as a respx side effect; records every request it receives."""

    def __init__(self, actuals: list[dict[str, Any]], forecasts: list[dict[str, Any]]) -> None:
        self.actuals = actuals
        self.forecasts = forecasts
        self.calls: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        params = dict(request.url.params)
        if request.url.path.endswith("/FUELHH/stream"):
            return httpx.Response(200, json=filter_fuelhh(self.actuals, params))
        if request.url.path.endswith("/WINDFOR/stream"):
            return httpx.Response(200, json=filter_windfor(self.forecasts, params))
        return httpx.Response(404, json={"title": "not found"})
