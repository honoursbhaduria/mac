from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class QualityWarningOut(BaseModel):
    code: str
    message: str
    count: int
    severity: Literal["info", "warning", "error"]


class SourceInfo(BaseModel):
    dataset: Literal["FUELHH", "WINDFOR"]
    endpoint: str
    window: dict[str, str]
    retrieved_at: str | None
    retrieved_at_london: str | None
    chunks: int
    cached_chunks: int
    stale: bool
    duration_ms: float
    records_received: int
    records_rejected: int


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict[str, str]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


ATTRIBUTION = (
    "Contains BMRS data from Elexon (FUELHH and WINDFOR datasets), "
    "used under the BMRS Data Licence. Source: https://bmrs.elexon.co.uk"
)
