from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import InvalidRequest, ServiceDep, SettingsDep
from app.schemas.forecast import ActualsResponse

router = APIRouter(tags=["actuals"])


@router.get("/actuals", response_model=ActualsResponse, summary="Actual half-hourly wind generation (FUELHH)")
async def get_actuals(
    service: ServiceDep,
    settings: SettingsDep,
    delivery_from: Annotated[date, Query(description="First delivery date (Europe/London), inclusive")],
    delivery_to: Annotated[date, Query(description="Last delivery date (Europe/London), inclusive")],
) -> ActualsResponse:
    if delivery_to < delivery_from:
        raise InvalidRequest("delivery_to must be on or after delivery_from")
    if (delivery_to - delivery_from).days + 1 > settings.max_date_range_days:
        raise InvalidRequest(f"date range may not exceed {settings.max_date_range_days} days")
    return await service.actuals(delivery_from, delivery_to)
