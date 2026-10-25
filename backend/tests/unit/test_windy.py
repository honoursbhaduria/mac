"""Unit tests for Windy LangGraph agent and API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.agent.nodes import (
    analyze_query_node,
    context_guard_node,
    format_output_node,
    route_after_analysis,
)
from app.agent.state import WindyState
from app.main import app


def test_context_guard_normal():
    """Short history should not be pruned."""
    state: WindyState = {
        "messages": [{"role": "user", "content": "Hello"}],
        "user_query": "What is MAE?",
        "current_filters": {},
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
    res = context_guard_node(state)
    assert res["context_pruned"] is False
    assert len(res["messages"]) == 1


def test_context_guard_prunes_long_history():
    """Long history (> 8 turns) triggers context guard pruning."""
    long_msgs = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"Message turn {i}"} for i in range(14)]
    state: WindyState = {
        "messages": long_msgs,
        "user_query": "Latest question",
        "current_filters": {},
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
    res = context_guard_node(state)
    assert res["context_pruned"] is True
    assert len(res["messages"]) <= 5
    assert res["pruned_summary"] is not None


@pytest.mark.asyncio
async def test_analyze_query_greeting():
    state: WindyState = {
        "messages": [],
        "user_query": "Hello Windy! Who are you?",
        "current_filters": {},
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
    res = await analyze_query_node(state)
    assert res["intent"] == "general_chat"
    assert res["needs_data_fetch"] is False


@pytest.mark.asyncio
async def test_analyze_query_methodology():
    state: WindyState = {
        "messages": [],
        "user_query": "Why do we avoid MAPE and use WAPE instead?",
        "current_filters": {},
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
    res = await analyze_query_node(state)
    assert res["intent"] == "methodology_qa"
    assert res["needs_data_fetch"] is False


@pytest.mark.asyncio
async def test_analyze_query_data():
    state: WindyState = {
        "messages": [],
        "user_query": "What is the MAE with 48 hours lead time in 2026-01-01 to 2026-01-10?",
        "current_filters": {},
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
    res = await analyze_query_node(state)
    assert res["intent"] == "data_analysis"
    assert res["needs_data_fetch"] is True
    assert res["target_params"]["decision_lead_hours"] == 48.0
    assert res["target_params"]["decision_from"] == "2026-01-01"
    assert res["target_params"]["decision_to"] == "2026-01-10"


def test_routing():
    assert route_after_analysis({"needs_data_fetch": False}) == "generate_response"
    assert route_after_analysis({"needs_data_fetch": True, "intent": "vintage_inquiry"}) == "fetch_vintage_data"
    assert route_after_analysis({"needs_data_fetch": True, "intent": "data_analysis"}) == "fetch_analysis_data"


def test_format_output_suggestions():
    res = format_output_node({"intent": "data_analysis"})
    assert len(res["suggested_actions"]) == 3
    assert any("error" in a["query"].lower() or "lead" in a["query"].lower() for a in res["suggested_actions"])


def test_windy_status_endpoint():
    client = TestClient(app)
    res = client.get("/api/windy/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["agent_name"] == "Windy"
    assert data["groq_configured"] is True
