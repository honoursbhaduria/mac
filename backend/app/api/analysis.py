from __future__ import annotations

import csv
import io

from fastapi import APIRouter
from fastapi.responses import Response

from app.api.deps import AnalysisParamsDep, ServiceDep
from app.schemas.analysis import AnalysisResponse

router = APIRouter(tags=["analysis"])

CSV_COLUMNS = [
    "delivery_start_utc",
    "delivery_start_london",
    "decision_cutoff_utc",
    "decision_cutoff_london",
    "forecast_publish_time_utc",
    "forecast_publish_time_london",
    "forecast_horizon_hours",
    "forecast_mw",
    "actual_mw",
    "error_mw",
    "abs_error_mw",
    "status",
    "eligible_vintages",
    "flags",
    "decision_lead_hours",
    "actual_alignment",
    "forecast_retrieved_at_utc",
    "actual_retrieved_at_utc",
]


def _blank(value: object) -> object:
    return "" if value is None else value


def analysis_to_csv(result: AnalysisResponse) -> str:
    retrieved = {s.dataset: s.retrieved_at for s in result.sources}
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for r in result.intervals:
        writer.writerow(
            [
                r.start_time,
                r.start_time_london,
                r.decision_cutoff,
                r.decision_cutoff_london,
                _blank(r.forecast_publish_time),
                _blank(r.forecast_publish_time_london),
                _blank(r.forecast_horizon_hours),
                _blank(r.forecast_mw),
                _blank(r.actual_mw),
                _blank(r.error_mw),
                _blank(r.abs_error_mw),
                r.status,
                r.eligible_vintages,
                ";".join(r.flags),
                result.query.decision_lead_hours,
                result.query.actual_alignment,
                _blank(retrieved.get("WINDFOR")),
                _blank(retrieved.get("FUELHH")),
            ]
        )
    return buffer.getvalue()


@router.get("/analysis", response_model=AnalysisResponse, summary="Decision-time forecast accuracy analysis")
async def get_analysis(params: AnalysisParamsDep, service: ServiceDep) -> AnalysisResponse:
    return await service.analyse(params)


@router.get(
    "/export.csv",
    summary="CSV export of the same interval table returned by /api/analysis",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}},
)
async def export_csv(params: AnalysisParamsDep, service: ServiceDep) -> Response:
    result = await service.analyse(params)
    name = (
        f"wind-forecast-{params.decision_from}_{params.decision_to}"
        f"-lead{params.decision_lead_hours:g}h-{params.actual_alignment}.csv"
    )
    return Response(
        content=analysis_to_csv(result),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "X-Matched-Intervals": str(result.metrics.matched_intervals),
            "X-Data-Stale": str(result.stale).lower(),
        },
    )
