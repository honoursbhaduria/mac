"""API router for Windy LangGraph agent."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent.graph import create_windy_graph
from app.agent.state import ActionItem, FilterContext, MessageItem, WindyState
from app.api.deps import ServiceDep, SettingsDep

logger = logging.getLogger(__name__)

router = APIRouter(tags=["windy"])


class WindyChatRequest(BaseModel):
    """Payload sent by the frontend for a chat turn with Windy."""

    message: str = Field(min_length=1, max_length=2500, description="User's query")
    history: list[MessageItem] = Field(default_factory=list, description="Prior conversation messages")
    filters: FilterContext | None = Field(default=None, description="Active UI filters")


class WindyChatResponse(BaseModel):
    """Response returned by Windy agent."""

    response: str
    suggested_actions: list[ActionItem]
    intent: str
    data_used: bool
    context_pruned: bool
    token_estimate: int


class WindyStatusResponse(BaseModel):
    """Agent health and capability status."""

    status: str
    agent_name: str
    model: str
    fallback_model: str
    max_history_turns: int
    groq_configured: bool


@router.post("/windy/chat", response_model=WindyChatResponse, summary="Chat with Windy AI Agent")
async def chat_with_windy(
    req: WindyChatRequest,
    service: ServiceDep,
    settings: SettingsDep,
) -> WindyChatResponse:
    """Invokes the LangGraph Windy agent with the provided user message and filters."""
    # Convert filters to dict
    active_filters: dict[str, Any] = {}
    if req.filters:
        active_filters = {k: v for k, v in req.filters.model_dump().items() if v is not None}
    else:
        active_filters = {
            "decision_from": settings.default_decision_from,
            "decision_to": settings.default_decision_to,
            "decision_lead_hours": settings.default_decision_lead_hours,
            "actual_alignment": "exact",
        }

    # Prepare initial state for the LangGraph pipeline
    initial_state: WindyState = {
        "messages": [m.model_dump() for m in req.history],
        "user_query": req.message,
        "current_filters": active_filters,
        "token_estimate": 0,
        "context_pruned": False,
        "pruned_summary": None,
        "intent": "general_chat",
        "needs_data_fetch": False,
        "target_params": {},
        "data_summary": None,
        "data_records_count": 0,
        "data_error": None,
        "response": "",
        "suggested_actions": [],
    }

    graph = create_windy_graph(service)
    final_state = await graph.ainvoke(initial_state)

    suggested = [ActionItem(**a) for a in (final_state.get("suggested_actions") or [])]

    return WindyChatResponse(
        response=final_state.get("response") or "",
        suggested_actions=suggested,
        intent=final_state.get("intent") or "general_chat",
        data_used=bool(final_state.get("data_summary")),
        context_pruned=bool(final_state.get("context_pruned")),
        token_estimate=final_state.get("token_estimate", 0),
    )


@router.get("/windy/status", response_model=WindyStatusResponse, summary="Windy Agent Status")
async def windy_status(settings: SettingsDep) -> WindyStatusResponse:
    """Returns Windy agent configuration and operational status."""
    return WindyStatusResponse(
        status="ok",
        agent_name="Windy",
        model=settings.windy_model,
        fallback_model=settings.windy_fallback_model,
        max_history_turns=settings.windy_max_history_turns,
        groq_configured=bool(settings.groq_api_key),
    )
