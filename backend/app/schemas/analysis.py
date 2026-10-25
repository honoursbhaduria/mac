from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import QualityWarningOut, SourceInfo

AlignmentParam = Literal["exact", "hourly_mean"]
IntervalStatus = Literal["matched", "missing_forecast", "missing_actual", "missing_both"]


class AnalysisParams(BaseModel):
    """Validated analysis filters. Dates are Europe/London calendar dates, inclusive."""

    decision_from: date
    decision_to: date
    decision_lead_hours: float = Field(ge=0)
    delivery_from: date | None = None
    delivery_to: date | None = None
    actual_alignment: AlignmentParam = "exact"

    # Limits are injected by the API layer from settings via ``validate_limits``.
    @model_validator(mode="after")
    def _ordering(self) -> AnalysisParams:
        if self.decision_to < self.decision_from:
            raise ValueError("decision_to must be on or after decision_from")
        if (self.delivery_from is None) != (self.delivery_to is None):
            raise ValueError("delivery_from and delivery_to must be supplied together")
        if self.delivery_from and self.delivery_to and self.delivery_to < self.delivery_from:
            raise ValueError("delivery_to must be on or after delivery_from")
        if (self.decision_lead_hours * 2) % 1:
            raise ValueError("decision_lead_hours must be a multiple of 0.5")
        return self

    def validate_limits(self, max_days: int, max_lead_hours: float) -> None:
        if (self.decision_to - self.decision_from).days + 1 > max_days:
            raise ValueError(f"decision date range may not exceed {max_days} days")
        if self.delivery_from and self.delivery_to and (self.delivery_to - self.delivery_from).days + 1 > max_days:
            raise ValueError(f"delivery date range may not exceed {max_days} days")
        if self.decision_lead_hours > max_lead_hours:
            raise ValueError(f"decision_lead_hours may not exceed {max_lead_hours:g}")


class IntervalRecord(BaseModel):
    start_time: str
    start_time_london: str
    decision_cutoff: str
    decision_cutoff_london: str
    forecast_publish_time: str | None
    forecast_publish_time_london: str | None
    forecast_horizon_hours: float | None
    forecast_mw: float | None
    actual_mw: float | None
    error_mw: float | None
    abs_error_mw: float | None
    status: IntervalStatus
    eligible_vintages: int
    flags: list[str]


class MetricsOut(BaseModel):
    matched_intervals: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    wape_pct: float | None
    bias_pct: float | None
    total_abs_error_mw: float | None
    mean_forecast_mw: float | None
    mean_actual_mw: float | None
    min_actual_mw: float | None
    max_actual_mw: float | None
    min_forecast_mw: float | None
    max_forecast_mw: float | None
    notes: list[str]


class CoverageOut(BaseModel):
    evaluation_intervals: int
    actual_records_available: int
    intervals_with_actual: int
    intervals_with_eligible_forecast: int
    matched_intervals: int
    missing_forecast: int
    missing_actual: int
    missing_both: int
    coverage_pct: float | None


class DailyStat(BaseModel):
    date: str
    intervals: int
    matched: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    wape_pct: float | None
    mean_forecast_mw: float | None
    mean_actual_mw: float | None


class HourStat(BaseModel):
    hour_london: int
    matched: int
    mae_mw: float | None
    bias_mw: float | None


class HistogramBin(BaseModel):
    lower_mw: float
    upper_mw: float
    count: int


class ResolvedWindow(BaseModel):
    decision_from: str
    decision_to: str
    decision_window_utc: tuple[str, str]
    delivery_from: str | None
    delivery_to: str | None
    delivery_window_utc: tuple[str, str] | None
    first_interval: str | None
    last_interval: str | None
    decision_lead_hours: float
    actual_alignment: AlignmentParam


class AnalysisResponse(BaseModel):
    query: ResolvedWindow
    assumptions: list[str]
    metrics: MetricsOut
    coverage: CoverageOut
    intervals: list[IntervalRecord]
    daily: list[DailyStat]
    hourly_profile: list[HourStat]
    error_histogram: list[HistogramBin]
    data_quality: list[QualityWarningOut]
    sources: list[SourceInfo]
    stale: bool
    generated_at: str
    attribution: str
