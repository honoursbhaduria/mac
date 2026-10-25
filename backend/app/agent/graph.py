"""Graph assembly for Windy LangGraph agent."""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from app.agent.nodes import (
    analyze_query_node,
    context_guard_node,
    fetch_analysis_data_node,
    fetch_vintage_data_node,
    format_output_node,
    generate_response_node,
    route_after_analysis,
    validate_data_node,
)
from app.agent.state import WindyState
from app.services.analysis_service import AnalysisService


def create_windy_graph(service: AnalysisService) -> Any:
    """Builds and compiles the LangGraph StateGraph for the Windy agent."""

    async def _fetch_analysis(state: WindyState) -> dict[str, Any]:
        return await fetch_analysis_data_node(state, service)

    async def _fetch_vintage(state: WindyState) -> dict[str, Any]:
        return await fetch_vintage_data_node(state, service)

    builder = StateGraph(WindyState)

    # Register all nodes
    builder.add_node("context_guard", context_guard_node)
    builder.add_node("analyze_query", analyze_query_node)
    builder.add_node("fetch_analysis_data", _fetch_analysis)
    builder.add_node("fetch_vintage_data", _fetch_vintage)
    builder.add_node("validate_data", validate_data_node)
    builder.add_node("generate_response", generate_response_node)
    builder.add_node("format_output", format_output_node)

    # Define edges and conditional routing
    builder.add_edge(START, "context_guard")
    builder.add_edge("context_guard", "analyze_query")

    builder.add_conditional_edges(
        "analyze_query",
        route_after_analysis,
        {
            "fetch_analysis_data": "fetch_analysis_data",
            "fetch_vintage_data": "fetch_vintage_data",
            "generate_response": "generate_response",
        },
    )

    builder.add_edge("fetch_analysis_data", "validate_data")
    builder.add_edge("fetch_vintage_data", "validate_data")
    builder.add_edge("validate_data", "generate_response")

    builder.add_edge("generate_response", "format_output")
    builder.add_edge("format_output", END)

    return builder.compile()
