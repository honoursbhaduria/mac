"""TEST-ONLY mock of the Elexon stream endpoints, used by the Playwright E2E suite.

Serves deterministic SYNTHETIC FUELHH/WINDFOR data (no randomness) with the same inclusive
filter semantics as the real API. Run from ``backend/``::

    python -m tests.fixtures.mock_elexon_server --port 8099

Then point the backend at it with ``ELEXON_BASE_URL=http://127.0.0.1:8099/bmrs/api/v1``.
Deliberate gaps make missing-data handling visible in the UI:
* no FUELHH actuals for 2026-01-20 10:00-13:30Z
* WINDFOR skips publications on 2026-01-24 entirely
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from tests.fixtures.fake_elexon import filter_fuelhh, filter_windfor

START = datetime(2025, 12, 25, tzinfo=UTC)
END = datetime(2026, 2, 5, tzinfo=UTC)
PUBLISH_HOURS = (1, 4, 7, 10, 13, 16, 19, 22)  # :30 past each hour


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def actual_mw(t: datetime) -> float:
    h = (t - START).total_seconds() / 3600
    return round(9000 + 6000 * math.sin(h / 37) + 1500 * math.sin(h / 5.3), 0)


def build_actuals() -> list[dict[str, Any]]:
    out = []
    t = START
    gap_lo, gap_hi = datetime(2026, 1, 20, 10, tzinfo=UTC), datetime(2026, 1, 20, 14, tzinfo=UTC)
    while t < END:
        if not (gap_lo <= t < gap_hi):
            # GMT throughout this window, so the London settlement date equals the UTC date.
            period = t.hour * 2 + t.minute // 30 + 1
            out.append(
                {
                    "dataset": "FUELHH",
                    "publishTime": _iso(t + timedelta(minutes=30)),
                    "startTime": _iso(t),
                    "settlementDate": t.date().isoformat(),
                    "settlementPeriod": period,
                    "fuelType": "WIND",
                    "generation": actual_mw(t),
                }
            )
        t += timedelta(minutes=30)
    return out


def build_forecasts() -> list[dict[str, Any]]:
    out = []
    day = START - timedelta(days=4)
    while day < END:
        if day.date().isoformat() != "2026-01-24":
            for hour in PUBLISH_HOURS:
                published = day + timedelta(hours=hour, minutes=30)
                first = published.replace(minute=0) - timedelta(hours=3)
                for k in range(72):
                    target = first + timedelta(hours=k)
                    horizon = (target - published).total_seconds() / 3600
                    # Error grows with horizon and has a deterministic positive bias.
                    error = 400 + 25 * max(horizon, 0) * math.sin(target.timestamp() / 50000)
                    out.append(
                        {
                            "dataset": "WINDFOR",
                            "publishTime": _iso(published),
                            "startTime": _iso(target),
                            "generation": round(actual_mw(target) + error, 0),
                        }
                    )
        day += timedelta(days=1)
    return out


ACTUALS = build_actuals()
FORECASTS = build_forecasts()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        url = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path.endswith("/datasets/FUELHH/stream"):
            body: Any = filter_fuelhh(ACTUALS, params)
        elif url.path.endswith("/datasets/WINDFOR/stream"):
            body = filter_windfor(FORECASTS, params)
        elif url.path == "/health":
            body = {"ok": True}
        else:
            self.send_response(404)
            self.end_headers()
            return
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_: Any) -> None:
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8099)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
