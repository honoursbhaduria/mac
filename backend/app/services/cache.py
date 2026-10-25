"""A small bounded TTL cache that can still hand back expired entries.

Expired entries are retained (until evicted by the LRU bound) so that, when the
upstream source is unavailable, the caller may choose to serve them explicitly
labelled as stale. They are never returned by ``get_fresh``.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class CacheEntry[T]:
    value: T
    retrieved_at: datetime  # wall-clock time the value was fetched from the source
    expires_at: float  # monotonic deadline

    def is_fresh(self, now: float) -> bool:
        return now < self.expires_at


class TTLCache[T]:
    def __init__(self, max_entries: int, clock: Callable[[], float] = time.monotonic) -> None:
        self._max = max_entries
        self._clock = clock
        self._data: OrderedDict[str, CacheEntry[T]] = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get_fresh(self, key: str) -> CacheEntry[T] | None:
        entry = self._data.get(key)
        if entry is None or not entry.is_fresh(self._clock()):
            self.misses += 1
            return None
        self._data.move_to_end(key)
        self.hits += 1
        return entry

    def get_any(self, key: str) -> CacheEntry[T] | None:
        """Return the entry even if expired (for explicit stale fallback)."""
        return self._data.get(key)

    def set(self, key: str, value: T, ttl_seconds: float, retrieved_at: datetime) -> None:
        self._data[key] = CacheEntry(value, retrieved_at, self._clock() + ttl_seconds)
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()

    def __len__(self) -> int:
        return len(self._data)
