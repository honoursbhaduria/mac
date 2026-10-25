from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import Depends, Query, Request
from pydantic import ValidationError

from app.config import Settings
from app.schemas.analysis import AlignmentParam, AnalysisParams
from app.services.analysis_service import AnalysisService
from app.services.container import ensure_services


class InvalidRequest(Exception):
    def __init__(self, message: str, details: list[dict[str, str]] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_service(request: Request) -> AnalysisService:
    ensure_services(request.app)
    service: AnalysisService = request.app.state.analysis_service
    return service


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
ServiceDep = Annotated[AnalysisService, Depends(get_service)]


def analysis_params(
    settings: SettingsDep,
    decision_from: Annotated[date | None, Query(description="First decision date (Europe/London), inclusive")] = None,
    decision_to: Annotated[date | None, Query(description="Last decision date (Europe/London), inclusive")] = None,
    decision_lead_hours: Annotated[
        float | None, Query(description="Hours between decision cutoff and delivery start (multiple of 0.5)")
    ] = None,
    delivery_from: Annotated[date | None, Query(description="Optional first delivery date (Europe/London)")] = None,
    delivery_to: Annotated[date | None, Query(description="Optional last delivery date (Europe/London)")] = None,
    actual_alignment: Annotated[AlignmentParam, Query(description="exact | hourly_mean")] = "exact",
) -> AnalysisParams:
    try:
        params = AnalysisParams(
            decision_from=decision_from or date.fromisoformat(settings.default_decision_from),
            decision_to=decision_to or date.fromisoformat(settings.default_decision_to),
            decision_lead_hours=settings.default_decision_lead_hours
            if decision_lead_hours is None
            else decision_lead_hours,
            delivery_from=delivery_from,
            delivery_to=delivery_to,
            actual_alignment=actual_alignment,
        )
        params.validate_limits(settings.max_date_range_days, settings.max_decision_lead_hours)
    except ValidationError as exc:
        details = [{"field": ".".join(str(p) for p in e["loc"]) or "query", "message": e["msg"]} for e in exc.errors()]
        raise InvalidRequest("Invalid analysis parameters", details) from None
    except ValueError as exc:
        raise InvalidRequest(str(exc)) from None
    return params


AnalysisParamsDep = Annotated[AnalysisParams, Depends(analysis_params)]
