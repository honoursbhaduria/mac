"""Timestamp parsing, normalisation and presentation helpers.

All internal comparisons use timezone-aware UTC values. Europe/London is used only
for presentation and for interpreting user-facing calendar dates.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

LONDON = ZoneInfo("Europe/London")


def parse_timestamp(value: object) -> tuple[datetime, bool]:
    """Parse an ISO-8601 timestamp into an aware UTC datetime.

    Returns ``(utc_datetime, was_naive)``. Elexon documents its timestamps as UTC and
    currently emits a ``Z`` suffix; a value without an offset is interpreted as UTC and
    reported back as naive so the caller can raise a data-quality warning.

    Raises ``ValueError`` for anything that is not a parseable string.
    """
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"timestamp must be a non-empty string, got {value!r}")
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC), True
    return parsed.astimezone(UTC), False


def to_utc_iso(value: datetime | pd.Timestamp) -> str:
    """Format an aware datetime as ``YYYY-MM-DDTHH:MM:SSZ``."""
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        raise ValueError("naive datetime cannot be formatted as UTC")
    return ts.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")


def to_london_iso(value: datetime | pd.Timestamp) -> str:
    """Format an aware datetime in Europe/London with its offset (GMT or BST)."""
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        raise ValueError("naive datetime cannot be converted to Europe/London")
    # Floor in UTC: flooring local time is ambiguous during the autumn clock change.
    return ts.tz_convert("UTC").floor("s").tz_convert(LONDON).isoformat()


def london_date_range_to_utc(start: date, end_inclusive: date) -> tuple[datetime, datetime]:
    """Convert inclusive London calendar dates into a half-open UTC interval
    ``[start 00:00 London, (end + 1 day) 00:00 London)``. Handles GMT/BST changes."""
    lo = datetime.combine(start, time.min, tzinfo=LONDON).astimezone(UTC)
    hi = datetime.combine(end_inclusive + timedelta(days=1), time.min, tzinfo=LONDON).astimezone(UTC)
    return lo, hi


def london_date(value: datetime | pd.Timestamp) -> date:
    return pd.Timestamp(value).tz_convert(LONDON).date()


def utc_series(values: pd.Series) -> pd.Series:
    """Return a datetime64[ns, UTC] series. Every frame in the pipeline uses this so
    joins never compare different resolutions or zones."""
    return pd.to_datetime(values, utc=True).dt.as_unit("ns")


def utc_now() -> datetime:
    return datetime.now(UTC)
