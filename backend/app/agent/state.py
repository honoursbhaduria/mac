"""State definition for Windy LangGraph agent."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from pydantic import BaseModel


class MessageItem(BaseModel):
    """Single message in chat history."""

    role: Literal["user", "assistant", "system"]
    content: str


class ActionItem(BaseModel):
    """Suggested quick action / follow-up button."""

    label: str
    query: str


class FilterContext(BaseModel):
    """Active UI filter context sent by frontend."""

    decision_from: str | None = None
    decision_to: str | None = None
    decision_lead_hours: float | None = None
    actual_alignment: Literal["exact", "hourly_mean"] | None = "exact"
    delivery_from: str | None = None
    delivery_to: str | None = None


class WindyState(TypedDict):
    """TypedDict state passed through the LangGraph nodes."""

    # Chat conversation history
    messages: list[dict[str, str]]
    user_query: str

    # Context / Filter state from the frontend
    current_filters: dict[str, Any]

    # Context overload management
    token_estimate: int
    context_pruned: bool
    pruned_summary: str | None

    # Intent classification & routing
    intent: Literal["data_analysis", "vintage_inquiry", "methodology_qa", "general_chat"]
    needs_data_fetch: bool
    target_params: dict[str, Any]

    # Retrieved & distilled data
    data_summary: str | None
    data_records_count: int
    data_error: str | None

    # Final output
    response: str
    suggested_actions: list[dict[str, str]]
