from __future__ import annotations

from pydantic import BaseModel

from app.schemas.common import QualityWarningOut, SourceInfo


class VintageOut(BaseModel):
    publish_time: str
    publish_time_london: str
    forecast_mw: float
    horizon_hours: float
    eligible: bool
    selected: bool
    error_mw: float | None  # only populated for the selected vintage when an actual exists


class VintagesResponse(BaseModel):
    start_time: str
    start_time_london: str
    decision_cutoff: str
    decision_cutoff_london: str
    decision_lead_hours: float | None
    actual_alignment: str
    actual_mw: float | None
    selected: VintageOut | None
    vintages: list[VintageOut]
    publish_window: dict[str, str]
    data_quality: list[QualityWarningOut]
    sources: list[SourceInfo]
    stale: bool
    attribution: str


class ActualRecord(BaseModel):
    start_time: str
    start_time_london: str
    settlement_date: str | None
    settlement_period: int | None
    generation_mw: float
    publish_time: str | None


class ActualsResponse(BaseModel):
    delivery_from: str
    delivery_to: str
    count: int
    records: list[ActualRecord]
    data_quality: list[QualityWarningOut]
    sources: list[SourceInfo]
    stale: bool
    attribution: str
