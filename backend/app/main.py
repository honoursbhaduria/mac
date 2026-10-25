from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import actuals, analysis, forecasts, health, windy
from app.api.deps import InvalidRequest
from app.config import APP_NAME, APP_VERSION, Settings, get_settings
from app.services.container import ensure_services
from app.services.elexon_client import ElexonClient, UpstreamError
from app.utils.logging import configure_logging

logger = logging.getLogger(__name__)

_UPSTREAM_STATUS = {"timeout": 504, "connection": 503, "rate_limited": 503, "http_error": 502, "malformed": 502}


def _error(status: int, code: str, message: str, details: list[dict[str, str]] | None = None) -> JSONResponse:
    body: dict[str, object] = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details  # type: ignore[index]
    return JSONResponse(status_code=status, content=body)


def create_app(settings: Settings | None = None, client: ElexonClient | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        elexon = ensure_services(app)
        yield
        await elexon.aclose()

    app = FastAPI(
        title=APP_NAME,
        version=APP_VERSION,
        description="Decision-time evaluation of Elexon WINDFOR wind forecasts against FUELHH outturn.",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.client_override = client
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "X-Matched-Intervals", "X-Data-Stale"],
    )

    @app.exception_handler(InvalidRequest)
    async def _invalid(_: Request, exc: InvalidRequest) -> JSONResponse:
        return _error(422, "invalid_request", exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "query"), "message": str(e["msg"])}
            for e in exc.errors()
        ]
        return _error(422, "invalid_request", "Invalid request parameters", details)

    @app.exception_handler(UpstreamError)
    async def _upstream(_: Request, exc: UpstreamError) -> JSONResponse:
        logger.warning("upstream failure", extra={"kind": exc.kind, "status": exc.status_code})
        return _error(
            _UPSTREAM_STATUS.get(exc.kind, 502),
            f"upstream_{exc.kind}",
            f"{exc.message}. No cached copy was available, so no data is shown. Please retry shortly.",
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error", exc_info=exc)
        return _error(500, "internal_error", "An unexpected error occurred.")

    for module in (health, analysis, actuals, forecasts, windy):
        app.include_router(module.router, prefix="/api")
    return app


app = create_app()
