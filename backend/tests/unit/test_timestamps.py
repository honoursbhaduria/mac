from datetime import UTC, date, datetime

import pandas as pd
import pytest

from app.utils.timestamps import (
    london_date,
    london_date_range_to_utc,
    parse_timestamp,
    to_london_iso,
    to_utc_iso,
)


def test_parses_z_suffix_as_utc() -> None:
    value, naive = parse_timestamp("2026-01-15T12:00:00Z")
    assert value == datetime(2026, 1, 15, 12, tzinfo=UTC)
    assert value.tzinfo is UTC
    assert naive is False


def test_offset_and_utc_forms_normalise_to_same_instant() -> None:
    a, _ = parse_timestamp("2026-06-15T13:00:00+01:00")
    b, _ = parse_timestamp("2026-06-15T12:00:00Z")
    c, _ = parse_timestamp("2026-06-15T07:00:00-05:00")
    assert a == b == c
    assert to_utc_iso(a) == "2026-06-15T12:00:00Z"


def test_naive_timestamp_is_interpreted_as_utc_and_flagged() -> None:
    value, naive = parse_timestamp("2026-01-15T12:00:00")
    assert naive is True
    assert value == datetime(2026, 1, 15, 12, tzinfo=UTC)


@pytest.mark.parametrize("bad", [None, "", "   ", "not-a-date", 1700000000, "2026-13-01T00:00:00Z"])
def test_malformed_timestamps_raise(bad: object) -> None:
    with pytest.raises(ValueError):
        parse_timestamp(bad)


def test_london_presentation_handles_bst_spring_forward() -> None:
    # 2026-03-29: clocks go forward at 01:00 GMT -> 02:00 BST.
    assert to_london_iso(pd.Timestamp("2026-03-29T00:30:00Z")) == "2026-03-29T00:30:00+00:00"
    assert to_london_iso(pd.Timestamp("2026-03-29T01:00:00Z")) == "2026-03-29T02:00:00+01:00"


def test_london_presentation_handles_autumn_fall_back_ambiguity() -> None:
    # 2026-10-25: 01:00-02:00 London occurs twice.
    assert to_london_iso(pd.Timestamp("2026-10-25T00:30:00.123Z")) == "2026-10-25T01:30:00+01:00"
    assert to_london_iso(pd.Timestamp("2026-10-25T01:30:00Z")) == "2026-10-25T01:30:00+00:00"


def test_london_day_bounds_cover_23_and_25_hour_days() -> None:
    lo, hi = london_date_range_to_utc(date(2026, 3, 29), date(2026, 3, 29))
    assert (hi - lo).total_seconds() == 23 * 3600
    lo, hi = london_date_range_to_utc(date(2026, 10, 25), date(2026, 10, 25))
    assert (hi - lo).total_seconds() == 25 * 3600
    lo, hi = london_date_range_to_utc(date(2026, 7, 1), date(2026, 7, 1))
    assert to_utc_iso(lo) == "2026-06-30T23:00:00Z"


def test_london_date_of_late_evening_bst_interval() -> None:
    assert london_date(pd.Timestamp("2026-07-01T23:30:00Z")) == date(2026, 7, 2)


def test_naive_values_are_rejected_for_formatting() -> None:
    with pytest.raises(ValueError):
        to_utc_iso(datetime(2026, 1, 1))
