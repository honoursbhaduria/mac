"""Orchestrates fetch -> normalise -> select -> match -> metrics for the API layer."""

from __future__ import annotations

import asyncio
import math
from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from app.config import Settings
from app.schemas.analysis import (
    AnalysisParams,
    AnalysisResponse,
    CoverageOut,
    DailyStat,
    HistogramBin,
    HourStat,
    IntervalRecord,
    MetricsOut,
    ResolvedWindow,
)
from app.schemas.common import ATTRIBUTION, QualityWarningOut, SourceInfo
from app.schemas.forecast import ActualRecord, ActualsResponse, VintageOut, VintagesResponse
from app.services.data_normalization import Normalized, QualityWarning, normalize_actuals, normalize_forecasts
from app.services.elexon_client import DatasetFetch, ElexonClient
from app.services.forecast_selection import build_hourly_grid, select_decision_forecasts, vintage_history
from app.services.matching import (
    STATUS_MATCHED,
    STATUS_MISSING_ACTUAL,
    STATUS_MISSING_BOTH,
    STATUS_MISSING_FORECAST,
    Alignment,
    align_actuals,
    match_intervals,
)
from app.services.metrics import compute_metrics
from app.utils.frames import frame_records
from app.utils.timestamps import LONDON, london_date, london_date_range_to_utc, to_london_iso, to_utc_iso, utc_now

DECISION_POLICY = (
    "For each hourly delivery interval starting at T, the decision cutoff is T minus the configured "
    "decision lead time (default 24 h). The forecast used is the latest WINDFOR vintage for T with "
    "publishTime <= cutoff. This is a pilot modelling assumption, not the official market gate closure."
)


def _r(value: float | None, ndigits: int = 3) -> float | None:
    if value is None or (isinstance(value, float) and not math.isfinite(value)):
        return None
    return round(float(value), ndigits)


def _opt_ts(value: Any) -> pd.Timestamp | None:
    return None if value is None or pd.isna(value) else pd.Timestamp(value)


def _source(fetch: DatasetFetch, norm: Normalized) -> SourceInfo:
    return SourceInfo(
        dataset=fetch.dataset,
        endpoint=fetch.endpoint,
        window=fetch.window,
        retrieved_at=to_utc_iso(fetch.retrieved_at) if fetch.retrieved_at else None,
        retrieved_at_london=to_london_iso(fetch.retrieved_at) if fetch.retrieved_at else None,
        chunks=fetch.chunks,
        cached_chunks=fetch.cached_chunks,
        stale=fetch.stale,
        duration_ms=fetch.duration_ms,
        records_received=norm.received,
        records_rejected=norm.rejected,
    )


def _warn_out(warnings: list[QualityWarning]) -> list[QualityWarningOut]:
    return [QualityWarningOut(code=w.code, message=w.message, count=w.count, severity=w.severity) for w in warnings]


def _stale_warnings(fetches: list[DatasetFetch]) -> list[QualityWarning]:
    out = []
    for f in fetches:
        if f.stale:
            when = to_utc_iso(f.retrieved_at) if f.retrieved_at else "an earlier time"
            out.append(
                QualityWarning(
                    f"{f.dataset.lower()}_stale_cache",
                    f"{f.dataset}: Elexon could not be reached; serving cached data retrieved at {when}. "
                    "It may be out of date.",
                    f.stale_chunks,
                    "warning",
                )
            )
    return out


def _histogram(errors: np.ndarray) -> list[HistogramBin]:
    if errors.size < 2:
        return []
    lo, hi = float(errors.min()), float(errors.max())
    if lo == hi:
        return [HistogramBin(lower_mw=lo, upper_mw=hi, count=int(errors.size))]
    # Freedman-Diaconis width rounded up to a "nice" value, capped at ~40 bins.
    q75, q25 = np.percentile(errors, [75, 25])
    raw = 2 * (q75 - q25) / np.cbrt(errors.size) if q75 > q25 else (hi - lo) / 10
    raw = max(raw, (hi - lo) / 40)
    magnitude = 10 ** math.floor(math.log10(raw))
    width = next(m * magnitude for m in (1, 2, 2.5, 5, 10) if m * magnitude >= raw)
    start = math.floor(lo / width) * width
    stop = math.ceil(hi / width) * width
    if stop <= hi:
        stop += width
    edges = np.arange(start, stop + width / 2, width)
    counts, edges = np.histogram(errors, bins=edges)
    return [
        HistogramBin(lower_mw=_r(edges[i], 1) or 0.0, upper_mw=_r(edges[i + 1], 1) or 0.0, count=int(c))
        for i, c in enumerate(counts)
    ]


def stats_subset(stats: dict[str, float | None]) -> dict[str, float | None]:
    return {"mae_mw": stats["mae_mw"], "bias_mw": stats["bias_mw"]}


def _group_stats(frame: pd.DataFrame) -> dict[str, float | None]:
    m = compute_metrics(frame["forecast_mw"].to_numpy(), frame["actual_mw"].to_numpy())
    return {
        "mae_mw": _r(m.mae_mw),
        "rmse_mw": _r(m.rmse_mw),
        "bias_mw": _r(m.bias_mw),
        "wape_pct": _r(m.wape_pct),
        "mean_forecast_mw": _r(m.mean_forecast_mw),
        "mean_actual_mw": _r(m.mean_actual_mw),
    }


class AnalysisService:
    def __init__(self, client: ElexonClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings

    # ----------------------------------------------------------------- analysis

    async def analyse(self, params: AnalysisParams) -> AnalysisResponse:
        s = self._settings
        lead = timedelta(hours=params.decision_lead_hours)
        decision_lo, decision_hi = london_date_range_to_utc(params.decision_from, params.decision_to)
        delivery_lo = delivery_hi = None
        if params.delivery_from and params.delivery_to:
            delivery_lo, delivery_hi = london_date_range_to_utc(params.delivery_from, params.delivery_to)
        grid = build_hourly_grid(decision_lo, decision_hi, lead, delivery_lo, delivery_hi)

        warnings: list[QualityWarning] = []
        sources: list[SourceInfo] = []
        stale = False
        if len(grid) == 0:
            warnings.append(
                QualityWarning(
                    "empty_window",
                    "No delivery intervals satisfy both the decision window and the delivery window.",
                    0,
                    "warning",
                )
            )
            actuals = normalize_actuals([])
            forecasts = normalize_forecasts([])
        else:
            first, last = grid[0], grid[-1]
            publish_from = (first - lead - pd.Timedelta(hours=s.windfor_lookback_hours)).to_pydatetime()
            publish_to = (last - lead).to_pydatetime()
            # Settlement dates are London dates; hourly_mean also needs the half-hour after `last`.
            sd_from = london_date(first)
            sd_to = london_date(last + pd.Timedelta(minutes=30))
            f_fetch, a_fetch = await asyncio.gather(
                self._client.fetch_forecasts(publish_from, publish_to),
                self._client.fetch_actuals(sd_from, sd_to),
            )
            forecasts = normalize_forecasts(f_fetch.records)
            actuals = normalize_actuals(a_fetch.records)
            warnings += forecasts.warnings + actuals.warnings + _stale_warnings([f_fetch, a_fetch])
            sources = [_source(f_fetch, forecasts), _source(a_fetch, actuals)]
            stale = f_fetch.stale or a_fetch.stale

        selected = select_decision_forecasts(forecasts.frame, grid, lead)
        table = match_intervals(selected, actuals.frame, params.actual_alignment)
        matched = table[table["status"] == STATUS_MATCHED]

        # Actual records inside the evaluated delivery span (all half-hours).
        if len(grid):
            span_lo, span_hi = grid[0], grid[-1] + pd.Timedelta(hours=1)
            a = actuals.frame
            actual_available = int(((a["start_time"] >= span_lo) & (a["start_time"] < span_hi)).sum())
        else:
            actual_available = 0

        counts = table["status"].value_counts()
        n_eval = len(table)
        n_matched = int(counts.get(STATUS_MATCHED, 0))
        coverage = CoverageOut(
            evaluation_intervals=n_eval,
            actual_records_available=actual_available,
            intervals_with_actual=int(table["actual_mw"].notna().sum()),
            intervals_with_eligible_forecast=int(table["forecast_mw"].notna().sum()),
            matched_intervals=n_matched,
            missing_forecast=int(counts.get(STATUS_MISSING_FORECAST, 0)),
            missing_actual=int(counts.get(STATUS_MISSING_ACTUAL, 0)),
            missing_both=int(counts.get(STATUS_MISSING_BOTH, 0)),
            coverage_pct=_r(100 * n_matched / n_eval, 2) if n_eval else None,
        )
        warnings += self._coverage_warnings(coverage, params.actual_alignment)

        m = compute_metrics(matched["forecast_mw"].to_numpy(), matched["actual_mw"].to_numpy())
        notes = list(m.notes)
        metrics = MetricsOut(
            matched_intervals=m.n,
            mae_mw=_r(m.mae_mw),
            rmse_mw=_r(m.rmse_mw),
            bias_mw=_r(m.bias_mw),
            wape_pct=_r(m.wape_pct),
            bias_pct=_r(m.bias_pct),
            total_abs_error_mw=_r(m.total_abs_error_mw),
            mean_forecast_mw=_r(m.mean_forecast_mw),
            mean_actual_mw=_r(m.mean_actual_mw),
            min_actual_mw=_r(matched["actual_mw"].min()) if m.n else None,
            max_actual_mw=_r(matched["actual_mw"].max()) if m.n else None,
            min_forecast_mw=_r(matched["forecast_mw"].min()) if m.n else None,
            max_forecast_mw=_r(matched["forecast_mw"].max()) if m.n else None,
            notes=notes,
        )

        return AnalysisResponse(
            query=ResolvedWindow(
                decision_from=params.decision_from.isoformat(),
                decision_to=params.decision_to.isoformat(),
                decision_window_utc=(to_utc_iso(decision_lo), to_utc_iso(decision_hi)),
                delivery_from=params.delivery_from.isoformat() if params.delivery_from else None,
                delivery_to=params.delivery_to.isoformat() if params.delivery_to else None,
                delivery_window_utc=(to_utc_iso(delivery_lo), to_utc_iso(delivery_hi))
                if delivery_lo and delivery_hi
                else None,
                first_interval=to_utc_iso(grid[0]) if len(grid) else None,
                last_interval=to_utc_iso(grid[-1]) if len(grid) else None,
                decision_lead_hours=params.decision_lead_hours,
                actual_alignment=params.actual_alignment,
            ),
            assumptions=self.assumptions(params.decision_lead_hours, params.actual_alignment),
            metrics=metrics,
            coverage=coverage,
            intervals=self._interval_records(table, stale),
            daily=self._daily(table),
            hourly_profile=self._hourly(matched),
            error_histogram=_histogram(matched["error_mw"].to_numpy(dtype=np.float64)),
            data_quality=_warn_out(warnings),
            sources=sources,
            stale=stale,
            generated_at=to_utc_iso(utc_now()),
            attribution=ATTRIBUTION,
        )

    @staticmethod
    def assumptions(lead_hours: float, alignment: Alignment) -> list[str]:
        align_text = (
            "Actual = FUELHH settlement period starting at the same UTC time as the hourly forecast (exact match)."
            if alignment == "exact"
            else "Actual = mean of the two FUELHH settlement periods within the forecast hour; "
            "if either is missing the interval counts as missing an actual."
        )
        return [
            DECISION_POLICY.replace("(default 24 h)", f"(currently {lead_hours:g} h)"),
            "Decision dates and delivery dates are Europe/London calendar days; all comparisons use UTC.",
            "WINDFOR is published at hourly resolution, so the evaluation grid is every UTC hour start.",
            align_text,
            "Forecasts published after the decision cutoff are never used, even if they were more accurate.",
            "Errors are forecast minus actual (MW); metrics use matched intervals only.",
            "No price or demand data is used: results describe forecast accuracy, not procurement cost.",
        ]

    @staticmethod
    def _coverage_warnings(c: CoverageOut, alignment: Alignment) -> list[QualityWarning]:
        out: list[QualityWarning] = []
        if c.missing_forecast + c.missing_both:
            out.append(
                QualityWarning(
                    "missing_eligible_forecast",
                    "Some intervals had no WINDFOR vintage published by their decision cutoff; they are excluded "
                    "from metrics.",
                    c.missing_forecast + c.missing_both,
                    "warning",
                )
            )
        if c.missing_actual + c.missing_both:
            out.append(
                QualityWarning(
                    "missing_actual",
                    "Some intervals have no FUELHH actual (not yet published or not reported); they are excluded "
                    "from metrics.",
                    c.missing_actual + c.missing_both,
                    "warning",
                )
            )
        if alignment == "exact" and c.actual_records_available > c.intervals_with_actual:
            out.append(
                QualityWarning(
                    "half_hours_not_scored",
                    "FUELHH half-hours starting at :30 have no hourly WINDFOR counterpart and are not scored "
                    "under exact alignment.",
                    c.actual_records_available - c.intervals_with_actual,
                    "info",
                )
            )
        return out

    @staticmethod
    def _interval_records(table: pd.DataFrame, stale: bool) -> list[IntervalRecord]:
        records = []
        rows = frame_records(table)
        for row in rows:
            publish = _opt_ts(row["forecast_publish_time"])
            flags: list[str] = []
            if row["status"] in (STATUS_MISSING_FORECAST, STATUS_MISSING_BOTH):
                flags.append("no_eligible_forecast")
            if row["status"] in (STATUS_MISSING_ACTUAL, STATUS_MISSING_BOTH):
                flags.append("no_actual")
            if not pd.isna(row["actual_mw"]) and row["actual_mw"] < 0:
                flags.append("negative_actual")
            if stale:
                flags.append("stale_source")
            records.append(
                IntervalRecord(
                    start_time=to_utc_iso(row["start_time"]),
                    start_time_london=to_london_iso(row["start_time"]),
                    decision_cutoff=to_utc_iso(row["decision_cutoff"]),
                    decision_cutoff_london=to_london_iso(row["decision_cutoff"]),
                    forecast_publish_time=to_utc_iso(publish) if publish is not None else None,
                    forecast_publish_time_london=to_london_iso(publish) if publish is not None else None,
                    forecast_horizon_hours=_r(row["forecast_horizon_hours"], 2),
                    forecast_mw=_r(row["forecast_mw"]),
                    actual_mw=_r(row["actual_mw"]),
                    error_mw=_r(row["error_mw"]),
                    abs_error_mw=_r(row["abs_error_mw"]),
                    status=row["status"],
                    eligible_vintages=int(row["vintages_eligible"]),
                    flags=flags,
                )
            )
        return records

    @staticmethod
    def _daily(table: pd.DataFrame) -> list[DailyStat]:
        if table.empty:
            return []
        frame = table.assign(day=table["start_time"].dt.tz_convert(LONDON).dt.date)
        out = []
        for day, group in frame.groupby("day", sort=True):
            matched = group[group["status"] == STATUS_MATCHED]
            out.append(
                DailyStat(
                    date=str(day),
                    intervals=len(group),
                    matched=len(matched),
                    **_group_stats(matched),
                )
            )
        return out

    @staticmethod
    def _hourly(matched: pd.DataFrame) -> list[HourStat]:
        if matched.empty:
            return []
        frame = matched.assign(hour=matched["start_time"].dt.tz_convert(LONDON).dt.hour)
        out = []
        for hour, group in frame.groupby("hour", sort=True):
            stats = _group_stats(group)
            out.append(HourStat(hour_london=int(str(hour)), matched=len(group), **stats_subset(stats)))
        return out

    # ----------------------------------------------------------------- vintages

    async def vintages(
        self,
        start_time: datetime,
        decision_cutoff: datetime | None,
        lead_hours: float | None,
        alignment: Alignment,
    ) -> VintagesResponse:
        s = self._settings
        start = pd.Timestamp(start_time).tz_convert("UTC")
        if decision_cutoff is not None:
            cutoff = pd.Timestamp(decision_cutoff).tz_convert("UTC")
            lead_used: float | None = None
        else:
            lead_used = s.default_decision_lead_hours if lead_hours is None else lead_hours
            cutoff = start - pd.Timedelta(hours=lead_used)
        publish_from = start - pd.Timedelta(hours=s.windfor_lookback_hours)
        # Include vintages after the cutoff (shown as ineligible) up to 12 h after delivery start.
        publish_to = max(cutoff, start) + pd.Timedelta(hours=12)
        f_fetch, a_fetch = await asyncio.gather(
            self._client.fetch_forecasts(publish_from.to_pydatetime(), publish_to.to_pydatetime()),
            self._client.fetch_actuals(london_date(start), london_date(start + pd.Timedelta(minutes=30))),
        )
        forecasts = normalize_forecasts(f_fetch.records)
        actuals = normalize_actuals(a_fetch.records)
        history = vintage_history(forecasts.frame, start.to_pydatetime(), cutoff.to_pydatetime())
        actual_series = align_actuals(pd.DataFrame({"start_time": [start]}), actuals.frame, alignment)
        actual = actual_series.iloc[0]
        actual_mw = None if pd.isna(actual) else float(actual)

        vintages = [
            VintageOut(
                publish_time=to_utc_iso(v.publish_time),
                publish_time_london=to_london_iso(v.publish_time),
                forecast_mw=v.forecast_mw,
                horizon_hours=v.horizon_hours,
                eligible=v.eligible,
                selected=v.selected,
                error_mw=_r(v.forecast_mw - actual_mw) if v.selected and actual_mw is not None else None,
            )
            for v in history
        ]
        warnings = forecasts.warnings + actuals.warnings + _stale_warnings([f_fetch, a_fetch])
        if not vintages:
            warnings.append(QualityWarning("no_vintages", "No WINDFOR vintages were found for this interval.", 0))
        elif not any(v.eligible for v in vintages):
            warnings.append(
                QualityWarning("no_eligible_vintage", "No vintage was published by the decision cutoff.", 0)
            )
        if actual_mw is None:
            warnings.append(QualityWarning("no_actual", "No FUELHH actual is available for this interval.", 0, "info"))
        return VintagesResponse(
            start_time=to_utc_iso(start),
            start_time_london=to_london_iso(start),
            decision_cutoff=to_utc_iso(cutoff),
            decision_cutoff_london=to_london_iso(cutoff),
            decision_lead_hours=lead_used,
            actual_alignment=alignment,
            actual_mw=_r(actual_mw),
            selected=next((v for v in vintages if v.selected), None),
            vintages=vintages,
            publish_window={"from": to_utc_iso(publish_from), "to": to_utc_iso(publish_to)},
            data_quality=_warn_out(warnings),
            sources=[_source(f_fetch, forecasts), _source(a_fetch, actuals)],
            stale=f_fetch.stale or a_fetch.stale,
            attribution=ATTRIBUTION,
        )

    # ----------------------------------------------------------------- actuals

    async def actuals(self, delivery_from: date, delivery_to: date) -> ActualsResponse:
        lo, hi = london_date_range_to_utc(delivery_from, delivery_to)
        fetch = await self._client.fetch_actuals(delivery_from, delivery_to)
        norm = normalize_actuals(fetch.records)
        frame = norm.frame[(norm.frame["start_time"] >= lo) & (norm.frame["start_time"] < hi)]
        records = []
        rows = frame_records(frame)
        for row in rows:
            publish = _opt_ts(row["actual_publish_time"])
            period = row["settlement_period"]
            records.append(
                ActualRecord(
                    start_time=to_utc_iso(row["start_time"]),
                    start_time_london=to_london_iso(row["start_time"]),
                    settlement_date=None if row["settlement_date"] is None else str(row["settlement_date"]),
                    settlement_period=None if period is None or pd.isna(period) else int(period),
                    generation_mw=float(row["actual_mw"]),
                    publish_time=to_utc_iso(publish) if publish is not None else None,
                )
            )
        return ActualsResponse(
            delivery_from=delivery_from.isoformat(),
            delivery_to=delivery_to.isoformat(),
            count=len(records),
            records=records,
            data_quality=_warn_out(norm.warnings + _stale_warnings([fetch])),
            sources=[_source(fetch, norm)],
            stale=fetch.stale,
            attribution=ATTRIBUTION,
        )
