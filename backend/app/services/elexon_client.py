"""HTTP client for Elexon's public Insights API (FUELHH and WINDFOR stream endpoints).

Design notes
------------
* Both endpoints are public and need no API key.
* Requested windows are split into chunks aligned to a fixed calendar grid so that
  overlapping user queries hit the same cache keys instead of re-downloading.
* Retryable failures (timeouts, connection errors, HTTP 429 and 5xx) are retried a
  bounded number of times with exponential backoff; ``Retry-After`` is honoured.
* If a chunk cannot be refreshed but an expired copy exists, that copy is returned and
  flagged as stale. Nothing is ever substituted for data that was never retrieved.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any, Literal

import httpx

from app.config import Settings
from app.services.cache import TTLCache
from app.utils.timestamps import utc_now

logger = logging.getLogger(__name__)

FUELHH_PATH = "/datasets/FUELHH/stream"
WINDFOR_PATH = "/datasets/WINDFOR/stream"
# Arbitrary fixed anchor (a Monday) for chunk alignment.
_CHUNK_ANCHOR = date(2020, 1, 6)

ErrorKind = Literal["timeout", "connection", "rate_limited", "http_error", "malformed"]


class UpstreamError(Exception):
    """The Elexon API could not provide a usable response."""

    def __init__(self, kind: ErrorKind, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class ChunkResult:
    records: list[Any]
    retrieved_at: datetime
    from_cache: bool
    stale: bool


@dataclass
class DatasetFetch:
    """Records for one dataset plus provenance metadata."""

    dataset: str
    endpoint: str
    records: list[Any]
    window: dict[str, str]
    chunks: int = 0
    cached_chunks: int = 0
    stale_chunks: int = 0
    # Oldest retrieval time across chunks: the conservative "data as of" time.
    retrieved_at: datetime | None = None
    duration_ms: float = 0.0
    errors: list[str] = field(default_factory=list)

    @property
    def stale(self) -> bool:
        return self.stale_chunks > 0


@dataclass
class UpstreamStatus:
    last_success_at: datetime | None = None
    last_failure_at: datetime | None = None
    last_failure_kind: str | None = None


def _aligned_chunks(start: date, end_inclusive: date, chunk_days: int) -> list[tuple[date, date]]:
    """Inclusive date chunks of ``chunk_days`` aligned to ``_CHUNK_ANCHOR``."""
    offset = (start - _CHUNK_ANCHOR).days // chunk_days
    cursor = _CHUNK_ANCHOR + timedelta(days=offset * chunk_days)
    chunks: list[tuple[date, date]] = []
    while cursor <= end_inclusive:
        chunk_end = cursor + timedelta(days=chunk_days - 1)
        chunks.append((cursor, chunk_end))
        cursor = chunk_end + timedelta(days=1)
    return chunks


def _retry_after_seconds(response: httpx.Response) -> float | None:
    header = response.headers.get("Retry-After")
    if not header:
        return None
    try:
        return max(0.0, float(header))
    except ValueError:
        try:
            when = parsedate_to_datetime(header)
        except (TypeError, ValueError):
            return None
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        return max(0.0, (when - utc_now()).total_seconds())


class ElexonClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._http = http or httpx.AsyncClient(
            base_url=settings.elexon_base_url.rstrip("/"),
            timeout=httpx.Timeout(settings.request_timeout_seconds, connect=settings.connect_timeout_seconds),
            headers={"Accept": "application/json", "User-Agent": "gb-wind-forecast-intelligence"},
        )
        self._cache: TTLCache[list[Any]] = TTLCache(settings.cache_max_entries)
        self._locks: dict[str, asyncio.Lock] = {}
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_requests)
        self.status = UpstreamStatus()

    @property
    def cache(self) -> TTLCache[list[Any]]:
        return self._cache

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------ public API

    async def fetch_actuals(self, settlement_from: date, settlement_to: date) -> DatasetFetch:
        """FUELHH wind outturn for an inclusive range of settlement dates."""
        params_list = [
            {
                "settlementDateFrom": lo.isoformat(),
                "settlementDateTo": hi.isoformat(),
                "fuelType": "WIND",
            }
            for lo, hi in _aligned_chunks(settlement_from, settlement_to, self._settings.fetch_chunk_days)
        ]
        window = {"settlementDateFrom": settlement_from.isoformat(), "settlementDateTo": settlement_to.isoformat()}
        return await self._fetch_dataset("FUELHH", FUELHH_PATH, params_list, window)

    async def fetch_forecasts(self, publish_from: datetime, publish_to: datetime) -> DatasetFetch:
        """WINDFOR forecast vintages published in ``[publish_from, publish_to]``."""
        pf, pt = publish_from.astimezone(UTC), publish_to.astimezone(UTC)
        params_list = [
            {
                "publishDateTimeFrom": f"{lo.isoformat()}T00:00:00Z",
                "publishDateTimeTo": f"{hi.isoformat()}T23:59:59Z",
            }
            for lo, hi in _aligned_chunks(pf.date(), pt.date(), self._settings.fetch_chunk_days)
        ]
        window = {
            "publishDateTimeFrom": pf.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": pt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        return await self._fetch_dataset("WINDFOR", WINDFOR_PATH, params_list, window)

    # ------------------------------------------------------------------ internals

    async def _fetch_dataset(
        self, dataset: str, path: str, params_list: list[dict[str, str]], window: dict[str, str]
    ) -> DatasetFetch:
        started = time.perf_counter()
        results = await asyncio.gather(*(self._fetch_chunk(path, p) for p in params_list))
        out = DatasetFetch(dataset=dataset, endpoint=path, records=[], window=window, chunks=len(results))
        for res in results:
            out.records.extend(res.records)
            out.cached_chunks += int(res.from_cache)
            out.stale_chunks += int(res.stale)
            if out.retrieved_at is None or res.retrieved_at < out.retrieved_at:
                out.retrieved_at = res.retrieved_at
        out.duration_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.info(
            "dataset fetched",
            extra={
                "dataset": dataset,
                "chunks": out.chunks,
                "cached_chunks": out.cached_chunks,
                "stale_chunks": out.stale_chunks,
                "records": len(out.records),
                "duration_ms": out.duration_ms,
            },
        )
        return out

    def _ttl_for(self, params: dict[str, str]) -> float:
        end_text = params.get("settlementDateTo") or params.get("publishDateTimeTo", "")[:10]
        try:
            chunk_end = date.fromisoformat(end_text)
        except ValueError:
            return self._settings.cache_ttl_seconds
        # Data for recent days can still be revised or published; keep the short TTL.
        if chunk_end < utc_now().date() - timedelta(days=4):
            return max(self._settings.cache_ttl_seconds, self._settings.historical_cache_ttl_seconds)
        return self._settings.cache_ttl_seconds

    async def _fetch_chunk(self, path: str, params: dict[str, str]) -> ChunkResult:
        key = path + "?" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            entry = self._cache.get_fresh(key)
            if entry is not None:
                return ChunkResult(entry.value, entry.retrieved_at, from_cache=True, stale=False)
            try:
                async with self._semaphore:
                    records = await self._get_json_list(path, params)
            except UpstreamError as exc:
                self.status.last_failure_at = utc_now()
                self.status.last_failure_kind = exc.kind
                stale = self._cache.get_any(key)
                if stale is not None:
                    logger.warning("serving stale cache after upstream failure", extra={"key": key, "kind": exc.kind})
                    return ChunkResult(stale.value, stale.retrieved_at, from_cache=True, stale=True)
                raise
            now = utc_now()
            self.status.last_success_at = now
            self._cache.set(key, records, self._ttl_for(params), now)
            return ChunkResult(records, now, from_cache=False, stale=False)

    async def _get_json_list(self, path: str, params: dict[str, str]) -> list[Any]:
        settings = self._settings
        attempt = 0
        while True:
            delay: float | None = None
            try:
                response = await self._http.get(path, params=params)
            except httpx.TimeoutException as exc:
                error = UpstreamError("timeout", f"Elexon request timed out ({type(exc).__name__})")
            except httpx.TransportError as exc:
                error = UpstreamError("connection", f"Could not connect to Elexon ({type(exc).__name__})")
            else:
                if response.status_code == 200:
                    return self._decode(response)
                if response.status_code == 429:
                    error = UpstreamError("rate_limited", "Elexon rate limit reached (HTTP 429)", 429)
                    delay = _retry_after_seconds(response)
                elif response.status_code >= 500:
                    error = UpstreamError(
                        "http_error", f"Elexon returned HTTP {response.status_code}", response.status_code
                    )
                    delay = _retry_after_seconds(response)
                else:
                    # 4xx other than 429 is a request problem; retrying will not help.
                    raise UpstreamError(
                        "http_error", f"Elexon rejected the request (HTTP {response.status_code})", response.status_code
                    )
            if attempt >= settings.max_retries:
                raise error
            if delay is None:
                delay = settings.retry_backoff_seconds * (2**attempt)
            delay = min(delay, settings.max_retry_after_seconds)
            logger.warning(
                "retrying Elexon request",
                extra={"path": path, "attempt": attempt + 1, "kind": error.kind, "delay_s": delay},
            )
            attempt += 1
            await asyncio.sleep(delay)

    @staticmethod
    def _decode(response: httpx.Response) -> list[Any]:
        try:
            body = response.json()
        except ValueError as exc:
            raise UpstreamError("malformed", "Elexon returned a response that is not valid JSON") from exc
        if isinstance(body, dict) and isinstance(body.get("data"), list):
            body = body["data"]
        if not isinstance(body, list):
            raise UpstreamError("malformed", "Elexon response was not a list of records")
        return body
