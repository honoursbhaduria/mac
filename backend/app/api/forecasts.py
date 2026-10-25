from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import InvalidRequest, ServiceDep, SettingsDep
from app.schemas.analysis import AlignmentParam
from app.schemas.forecast import VintagesResponse
from app.utils.timestamps import parse_timestamp

router = APIRouter(tags=["forecasts"])


def _parse(name: str, value: str) -> datetime:
    try:
        parsed, naive = parse_timestamp(value)
    except ValueError:
        raise InvalidRequest(f"{name} must be an ISO-8601 timestamp, e.g. 2026-01-15T12:00:00Z") from None
    if naive:
        raise InvalidRequest(f"{name} must include a UTC offset (e.g. a trailing Z)")
    return parsed


@router.get("/forecast-vintages", response_model=VintagesResponse, summary="Publication history for one interval")
async def forecast_vintages(
    service: ServiceDep,
    settings: SettingsDep,
    start_time: Annotated[str, Query(description="Delivery interval start, ISO-8601 with offset, on the hour")],
    decision_cutoff: Annotated[str | None, Query(description="Explicit cutoff; overrides the lead time")] = None,
    decision_lead_hours: Annotated[float | None, Query(ge=0)] = None,
    actual_alignment: Annotated[AlignmentParam, Query()] = "exact",
) -> VintagesResponse:
    start = _parse("start_time", start_time)
    if start.minute or start.second or start.microsecond:
        raise InvalidRequest("start_time must be on the hour: WINDFOR forecasts are hourly")
    cutoff = _parse("decision_cutoff", decision_cutoff) if decision_cutoff else None
    if decision_lead_hours is not None and decision_lead_hours > settings.max_decision_lead_hours:
        raise InvalidRequest(f"decision_lead_hours may not exceed {settings.max_decision_lead_hours:g}")
    if cutoff is not None and cutoff > start:
        raise InvalidRequest("decision_cutoff must not be after start_time")
    return await service.vintages(start, cutoff, decision_lead_hours, actual_alignment)
