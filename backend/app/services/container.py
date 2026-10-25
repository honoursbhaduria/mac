"""Per-app service wiring (Elexon client + analysis service)."""

from __future__ import annotations

from fastapi import FastAPI

from app.config import Settings
from app.services.analysis_service import AnalysisService
from app.services.elexon_client import ElexonClient


def ensure_services(app: FastAPI) -> ElexonClient:
    """Create the Elexon client and analysis service once per app instance.

    Called from the lifespan handler and, lazily, on first request: some serverless ASGI
    hosts do not deliver lifespan events.
    """
    if not hasattr(app.state, "elexon_client"):
        settings: Settings = app.state.settings
        elexon = app.state.client_override or ElexonClient(settings)
        app.state.elexon_client = elexon
        app.state.analysis_service = AnalysisService(elexon, settings)
    client: ElexonClient = app.state.elexon_client
    return client
