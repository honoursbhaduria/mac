from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.api.deps import SettingsDep
from app.config import APP_NAME, APP_VERSION
from app.schemas.common import ATTRIBUTION
from app.services.analysis_service import DECISION_POLICY
from app.services.container import ensure_services
from app.services.elexon_client import ElexonClient
from app.services.metrics import METRIC_DEFINITIONS
from app.utils.timestamps import to_utc_iso, utc_now

router = APIRouter(tags=["meta"])


@router.get("/health", summary="Application health")
async def health(request: Request) -> dict[str, Any]:
    client: ElexonClient = ensure_services(request.app)
    st = client.status
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "time": to_utc_iso(utc_now()),
        # Upstream health is not probed here; these are observations from real requests.
        "upstream": {
            "checked": False,
            "note": "Elexon availability is not probed by this endpoint; values reflect the most recent real requests.",
            "last_success_at": to_utc_iso(st.last_success_at) if st.last_success_at else None,
            "last_failure_at": to_utc_iso(st.last_failure_at) if st.last_failure_at else None,
            "last_failure_kind": st.last_failure_kind,
        },
        "cache": {"entries": len(client.cache), "hits": client.cache.hits, "misses": client.cache.misses},
    }


@router.get("/metadata", summary="Filters, defaults, metric definitions and data sources")
async def metadata(settings: SettingsDep) -> dict[str, Any]:
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "defaults": {
            "decision_from": settings.default_decision_from,
            "decision_to": settings.default_decision_to,
            "decision_lead_hours": settings.default_decision_lead_hours,
            "actual_alignment": "exact",
        },
        "limits": {
            "max_date_range_days": settings.max_date_range_days,
            "max_decision_lead_hours": settings.max_decision_lead_hours,
            "lead_hours_step": 0.5,
        },
        "filters": {
            "decision_from": "Europe/London date, inclusive",
            "decision_to": "Europe/London date, inclusive",
            "decision_lead_hours": "decision cutoff = delivery start - lead",
            "delivery_from": "optional Europe/London date, inclusive (must be paired with delivery_to)",
            "delivery_to": "optional Europe/London date, inclusive",
            "actual_alignment": ["exact", "hourly_mean"],
        },
        "decision_policy": DECISION_POLICY,
        "metrics": METRIC_DEFINITIONS,
        "display_timezone": "Europe/London",
        "cache_ttl_seconds": settings.cache_ttl_seconds,
        "sources": [
            {
                "dataset": "FUELHH",
                "description": "Half-hourly generation outturn by fuel type (filtered to WIND)",
                "endpoint": f"{settings.elexon_base_url}/datasets/FUELHH/stream",
                "fields": ["startTime", "settlementDate", "settlementPeriod", "fuelType", "generation", "publishTime"],
                "docs": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
            },
            {
                "dataset": "WINDFOR",
                "description": "Wind generation forecast vintages (hourly)",
                "endpoint": f"{settings.elexon_base_url}/datasets/WINDFOR/stream",
                "fields": ["startTime", "publishTime", "generation"],
                "docs": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
            },
        ],
        "api_key_required": False,
        "attribution": ATTRIBUTION,
    }
