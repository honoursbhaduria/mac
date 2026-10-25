"""LangGraph node implementations for the Windy agent."""

from __future__ import annotations

import logging
import re
from datetime import UTC, date, datetime
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.agent.prompts import WINDY_SYSTEM_PROMPT
from app.agent.state import WindyState
from app.config import get_settings
from app.schemas.analysis import AlignmentParam, AnalysisParams
from app.services.analysis_service import AnalysisService

logger = logging.getLogger(__name__)


def _estimate_tokens(text: str) -> int:
    """Rough estimation of token count (~4 chars per token)."""
    return max(1, len(text) // 4)


# -----------------------------------------------------------------------------
# Node 1: Context Guard Node (prevents context overload)
# -----------------------------------------------------------------------------
def context_guard_node(state: WindyState) -> dict[str, Any]:
    """Inspects conversation history and enforces strict context boundaries.

    Ensures the context window is never overloaded by pruning older turns
    and maintaining a compact memory summary.
    """
    settings = get_settings()
    max_turns = settings.windy_max_history_turns
    messages = list(state.get("messages") or [])
    user_query = state.get("user_query") or ""

    total_chars = sum(len(m.get("content", "")) for m in messages) + len(user_query)
    context_pruned = False
    pruned_summary = state.get("pruned_summary")

    # If message turns exceed limit or character count is too large (> 12,000 chars ~ 3,000 tokens)
    if len(messages) > max_turns or total_chars > 12000:
        logger.info(
            "Context guard triggered: pruning conversation history (turns: %d, chars: %d)",
            len(messages),
            total_chars,
        )
        context_pruned = True

        # Keep initial user turn (for persistent intent) and the most recent turns (last 4)
        kept_messages: list[dict[str, str]] = []
        if messages:
            kept_messages.append(messages[0])
            if len(messages) > 4:
                # Summarize the omitted middle turns
                middle_turns = messages[1:-3]
                topics = [m.get("content", "")[:60] for m in middle_turns if m.get("role") == "user"]
                pruned_summary = (
                    f"Earlier conversation briefly touched on: {'; '.join(topics[:3])}. "
                    "Past details compressed to preserve model context."
                )
                kept_messages.extend(messages[-3:])
            else:
                kept_messages = messages[-max_turns:]
        messages = kept_messages

    # Truncate any single unusually large message (e.g. pasted huge table)
    for m in messages:
        if len(m.get("content", "")) > 3000:
            m["content"] = m["content"][:3000] + "... [truncated for context safety]"

    new_chars = sum(len(m.get("content", "")) for m in messages) + len(user_query)
    token_est = _estimate_tokens(str(new_chars))

    return {
        "messages": messages,
        "context_pruned": context_pruned,
        "pruned_summary": pruned_summary,
        "token_estimate": token_est,
    }


# -----------------------------------------------------------------------------
# Node 2: Analyze Query Node (Intent classification & parameter extraction)
# -----------------------------------------------------------------------------
async def analyze_query_node(state: WindyState) -> dict[str, Any]:
    """Analyzes the user's latest query to classify intent and extract filters."""
    query = (state.get("user_query") or "").strip()
    query_lower = query.lower()
    current_filters = state.get("current_filters") or {}

    # Defaults from current UI filters
    default_from = current_filters.get("decision_from") or "2026-01-01"
    default_to = current_filters.get("decision_to") or "2026-01-31"
    default_lead = float(current_filters.get("decision_lead_hours") or 24.0)
    default_align = current_filters.get("actual_alignment") or "exact"

    target_params: dict[str, Any] = {
        "decision_from": default_from,
        "decision_to": default_to,
        "decision_lead_hours": default_lead,
        "actual_alignment": default_align,
    }

    # Fast heuristics for common intent types
    is_greeting = bool(re.match(r"^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))\b", query_lower))
    is_identity = bool(re.search(r"\b(who are you|your name|what can you do|help me)\b", query_lower))

    if is_greeting or is_identity:
        return {
            "intent": "general_chat",
            "needs_data_fetch": False,
            "target_params": target_params,
        }

    # Check for vintage inquiries
    is_vintage = bool(re.search(r"\b(vintage|vintages|publication history|re-forecast)\b", query_lower))
    if is_vintage:
        return {
            "intent": "vintage_inquiry",
            "needs_data_fetch": True,
            "target_params": target_params,
        }

    # Check for pure methodology/definition questions
    methodology_patterns = [
        r"\b(what is|explain|define)\s+(wape|mape|mae|rmse|bias|curtailment)\b",
        r"\bwhy\s+(?:do\s+we\s+)?(?:not|avoid)\s+mape\b",
        r"\bwhy\s+(?:do\s+we\s+)?prefer\s+wape\b",
        r"\bwhy\s+(?:24|twenty[- ]four|\d+)\s*(?:h|hr|hour|hours)?\s*lead\b",
        r"\bhindsight\s+bias\b",
        r"\bhow\s+(?:does|is)\s+the\s+cutoff\b",
        r"\bwhat\s+is\s+(windfor|fuelhh)\b",
        r"\bhow\s+are\s+duplicates\s+(?:handled|treated)\b",
        r"\bwhere\s+does\s+the\s+data\s+come\s+from\b",
        r"\bhow\s+does\s+matching\s+work\b",
    ]
    if any(re.search(p, query_lower) for p in methodology_patterns) and not re.search(
        r"\b(current|january|yesterday|what was the mae|calculate)\b", query_lower
    ):
        return {
            "intent": "methodology_qa",
            "needs_data_fetch": False,
            "target_params": target_params,
        }

    # Parameter extraction from natural language
    # Lead time check: e.g. "48h", "48 hours lead", "12 hour lead", "0h lead"
    lead_match = re.search(r"\b(\d+(\.\d+)?)\s*(?:h|hr|hour|hours)?\s*lead\b", query_lower)
    if lead_match:
        try:
            lead_val = float(lead_match.group(1))
            if 0.0 <= lead_val <= 96.0:
                target_params["decision_lead_hours"] = lead_val
        except ValueError:
            pass

    # Alignment check
    if "hourly mean" in query_lower or "hourly_mean" in query_lower:
        target_params["actual_alignment"] = "hourly_mean"
    elif "exact" in query_lower:
        target_params["actual_alignment"] = "exact"

    # Month name extraction: e.g. "January 2026", "Jan 2026", "January"
    month_map: dict[str, tuple[str, str]] = {
        "january": ("01", "31"),
        "jan": ("01", "31"),
        "february": ("02", "28"),
        "feb": ("02", "28"),
        "march": ("03", "31"),
        "mar": ("03", "31"),
        "april": ("04", "30"),
        "apr": ("04", "30"),
        "may": ("05", "31"),
        "june": ("06", "30"),
        "jun": ("06", "30"),
        "july": ("07", "31"),
        "jul": ("07", "31"),
        "august": ("08", "31"),
        "aug": ("08", "31"),
        "september": ("09", "30"),
        "sep": ("09", "30"),
        "sept": ("09", "30"),
        "october": ("10", "31"),
        "oct": ("10", "31"),
        "november": ("11", "30"),
        "nov": ("11", "30"),
        "december": ("12", "31"),
        "dec": ("12", "31"),
    }
    month_match = re.search(
        r"\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|"
        r"august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?\b",
        query_lower,
    )
    if month_match:
        m_name = month_match.group(1)
        m_year = month_match.group(2) or "2026"
        if m_name in month_map:
            m_num, m_last = month_map[m_name]
            target_params["decision_from"] = f"{m_year}-{m_num}-01"
            target_params["decision_to"] = f"{m_year}-{m_num}-{m_last}"

    # ISO date range extraction: e.g. "Jan 1 to Jan 15", "2026-01-05 to 2026-01-10"
    iso_dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", query)
    if len(iso_dates) >= 2:
        target_params["decision_from"] = iso_dates[0]
        target_params["decision_to"] = iso_dates[1]
    elif len(iso_dates) == 1:
        target_params["decision_from"] = iso_dates[0]
        target_params["decision_to"] = iso_dates[0]

    return {
        "intent": "data_analysis",
        "needs_data_fetch": True,
        "target_params": target_params,
    }


# -----------------------------------------------------------------------------
# Conditional Router Function
# -----------------------------------------------------------------------------
def route_after_analysis(
    state: WindyState,
) -> Literal["fetch_analysis_data", "fetch_vintage_data", "generate_response"]:
    """Routes to the appropriate data fetch node or directly to response generation."""
    if not state.get("needs_data_fetch"):
        return "generate_response"
    if state.get("intent") == "vintage_inquiry":
        return "fetch_vintage_data"
    return "fetch_analysis_data"


# -----------------------------------------------------------------------------
# Node 3: Fetch Analysis Data Node (Retrieves & distills data safely)
# -----------------------------------------------------------------------------
async def fetch_analysis_data_node(state: WindyState, service: AnalysisService) -> dict[str, Any]:
    """Fetches wind analysis dataset and compiles a compact, high-signal summary.

    This prevents raw interval flooding into the LLM context while providing
    all required statistical metrics and extremes.
    """
    params_dict = state.get("target_params") or {}
    try:
        p_from = date.fromisoformat(params_dict.get("decision_from", "2026-01-01"))
        p_to = date.fromisoformat(params_dict.get("decision_to", "2026-01-31"))
        p_lead = float(params_dict.get("decision_lead_hours", 24.0))
        p_align: AlignmentParam = params_dict.get("actual_alignment", "exact")

        params = AnalysisParams(
            decision_from=p_from,
            decision_to=p_to,
            decision_lead_hours=p_lead,
            actual_alignment=p_align,
        )
        res = await service.analyse(params)

        m = res.metrics
        cov = res.coverage

        # Find extreme intervals
        matched_intervals = [i for i in res.intervals if i.status == "matched" and i.error_mw is not None]
        worst_over = max(matched_intervals, key=lambda x: x.error_mw or 0, default=None)
        worst_under = min(matched_intervals, key=lambda x: x.error_mw or 0, default=None)

        # Find best and worst daily MAE
        valid_daily = sorted([d for d in res.daily if d.mae_mw is not None], key=lambda d: d.mae_mw or 0)
        best_days = valid_daily[:3]
        worst_days = valid_daily[-3:][::-1]

        # Diurnal pattern
        valid_hourly = [h for h in res.hourly_profile if h.mae_mw is not None]
        peak_error_hour = max(valid_hourly, key=lambda h: h.mae_mw or 0, default=None)
        low_error_hour = min(valid_hourly, key=lambda h: h.mae_mw or 999999, default=None)

        bias_desc = (
            "Over-forecast (Forecast > Actual)" if (m.bias_mw or 0) > 0 else "Under-forecast (Forecast < Actual)"
        )

        summary_lines = [
            "### Active Data Analysis Summary",
            f"- **Decision Dates**: {res.query.decision_from} to {res.query.decision_to}",
            f"- **Decision Lead Time**: {res.query.decision_lead_hours:g} hours",
            f"- **Actual Alignment**: {res.query.actual_alignment}",
            f"- **Matched Intervals**: {m.matched_intervals} of {cov.evaluation_intervals} ({cov.coverage_pct:.1f}%)",
            f"- **Mean Absolute Error (MAE)**: {m.mae_mw:.1f} MW" if m.mae_mw is not None else "- **MAE**: N/A",
            f"- **Root Mean Square Error (RMSE)**: {m.rmse_mw:.1f} MW" if m.rmse_mw is not None else "- **RMSE**: N/A",
            f"- **Mean Bias**: {m.bias_mw:+.1f} MW ({bias_desc})" if m.bias_mw is not None else "- **Mean Bias**: N/A",
            f"- **WAPE**: {m.wape_pct:.1f}%" if m.wape_pct is not None else "- **WAPE**: N/A",
            f"- **Bias %**: {m.bias_pct:+.1f}%" if m.bias_pct is not None else "- **Bias %**: N/A",
            f"- **Mean Forecast**: {m.mean_forecast_mw:.1f} MW" if m.mean_forecast_mw is not None else "",
            f"- **Mean Actual**: {m.mean_actual_mw:.1f} MW" if m.mean_actual_mw is not None else "",
        ]

        if worst_over and worst_over.error_mw:
            summary_lines.append(
                f"- **Peak Over-forecast Miss**: {worst_over.start_time_london} "
                f"(Forecast: {worst_over.forecast_mw:.0f} MW, Actual: {worst_over.actual_mw:.0f} MW, "
                f"Error: {worst_over.error_mw:+.0f} MW)"
            )
        if worst_under and worst_under.error_mw:
            summary_lines.append(
                f"- **Peak Under-forecast Miss**: {worst_under.start_time_london} "
                f"(Forecast: {worst_under.forecast_mw:.0f} MW, Actual: {worst_under.actual_mw:.0f} MW, "
                f"Error: {worst_under.error_mw:+.0f} MW)"
            )
        if best_days:
            best_str = ", ".join(f"{d.date} ({d.mae_mw:.1f} MW)" for d in best_days)
            summary_lines.append(f"- **Top Best Days (Lowest MAE)**: {best_str}")
        if worst_days:
            worst_str = ", ".join(f"{d.date} ({d.mae_mw:.1f} MW)" for d in worst_days)
            summary_lines.append(f"- **Top Worst Days (Highest MAE)**: {worst_str}")
        if peak_error_hour:
            summary_lines.append(
                f"- **Highest Error Hour (Diurnal)**: {peak_error_hour.hour_london:02d}:00 London time "
                f"(MAE: {peak_error_hour.mae_mw:.1f} MW)"
            )
        if low_error_hour:
            summary_lines.append(
                f"- **Lowest Error Hour (Diurnal)**: {low_error_hour.hour_london:02d}:00 London time "
                f"(MAE: {low_error_hour.mae_mw:.1f} MW)"
            )

        summary_text = "\n".join(line for line in summary_lines if line)
        return {
            "data_summary": summary_text,
            "data_records_count": m.matched_intervals,
            "data_error": None,
        }
    except Exception as exc:
        logger.warning("Error fetching analysis data in Windy: %s", exc, exc_info=True)
        return {
            "data_summary": None,
            "data_records_count": 0,
            "data_error": str(exc),
        }


# -----------------------------------------------------------------------------
# Node 4: Fetch Vintage Data Node
# -----------------------------------------------------------------------------
async def fetch_vintage_data_node(state: WindyState, service: AnalysisService) -> dict[str, Any]:
    """Fetches publication vintages for a specific interval or date."""
    params_dict = state.get("target_params") or {}
    try:
        # Default to 2026-01-02 12:00:00 UTC or parsed date
        start_dt = datetime(2026, 1, 2, 12, 0, 0, tzinfo=UTC)
        p_lead = float(params_dict.get("decision_lead_hours", 24.0))
        p_align: AlignmentParam = params_dict.get("actual_alignment", "exact")

        vintages_res = await service.vintages(
            start_time=start_dt,
            decision_cutoff=None,
            lead_hours=p_lead,
            alignment=p_align,
        )

        selected = vintages_res.selected
        actual_val = vintages_res.actual_mw

        summary_lines = [
            f"### Forecast Vintage History for Delivery Hour: {vintages_res.start_time_london}",
            (
                f"- **Decision Cutoff**: {vintages_res.decision_cutoff_london} "
                f"({vintages_res.decision_lead_hours:g}h lead)"
            ),
            f"- **Total Vintages Published**: {len(vintages_res.vintages)}",
            (
                f"- **Actual Outturn (FUELHH)**: {actual_val:.1f} MW"
                if actual_val is not None
                else "- **Actual Outturn**: Missing"
            ),
        ]

        if selected:
            summary_lines.extend(
                [
                    (
                        f"- **Selected Vintage**: Published at {selected.publish_time_london} "
                        f"(Horizon: {selected.horizon_hours:.1f}h)"
                    ),
                    f"- **Forecasted Generation**: {selected.forecast_mw:.1f} MW",
                    f"- **Forecast Error**: {selected.error_mw:+.1f} MW" if selected.error_mw is not None else "",
                ]
            )

        summary_text = "\n".join(line for line in summary_lines if line)
        return {
            "data_summary": summary_text,
            "data_records_count": len(vintages_res.vintages),
            "data_error": None,
        }
    except Exception as exc:
        logger.warning("Error fetching vintage data in Windy: %s", exc, exc_info=True)
        return {
            "data_summary": None,
            "data_records_count": 0,
            "data_error": str(exc),
        }


# -----------------------------------------------------------------------------
# Node 5: Validate Data Node
# -----------------------------------------------------------------------------
def validate_data_node(state: WindyState) -> dict[str, Any]:
    """Validates the retrieved data and appends safety fallback notes if required."""
    err = state.get("data_error")
    if err:
        fallback_msg = (
            f"\n\n*Note: Could not retrieve live data for the requested range ({err}). "
            "Please check date parameters (within 93 days) or retry shortly.*"
        )
        return {"data_summary": fallback_msg}
    return {}


# -----------------------------------------------------------------------------
# Node 6: Generate Response Node (Groq LLM)
# -----------------------------------------------------------------------------
async def generate_response_node(state: WindyState) -> dict[str, Any]:
    """Calls Groq LLM with Windy system instructions, context, and data summary."""
    settings = get_settings()

    system_content = WINDY_SYSTEM_PROMPT
    if state.get("pruned_summary"):
        system_content += f"\n\n[Conversation Memory]: {state['pruned_summary']}"

    if state.get("data_summary"):
        system_content += f"\n\n[Live Dataset Context]:\n{state['data_summary']}"

    messages: list[Any] = [SystemMessage(content=system_content)]

    # Add conversation history
    for m in state.get("messages") or []:
        role = m.get("role")
        content = m.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    # Add the current user query
    user_query = state.get("user_query") or ""
    messages.append(HumanMessage(content=user_query))

    response_text = ""
    # Try primary model, fallback if needed
    models_to_try = [settings.windy_model, settings.windy_fallback_model, "qwen/qwen3.8-27b"]

    for model_name in models_to_try:
        try:
            llm = ChatGroq(
                model_name=model_name,
                api_key=settings.groq_api_key,
                temperature=0.3,
                max_tokens=settings.windy_max_tokens,
            )
            ai_res = await llm.ainvoke(messages)
            response_text = str(ai_res.content)
            if response_text.strip():
                break
        except Exception as exc:
            logger.warning("Groq model %s failed: %s. Trying next fallback.", model_name, exc)

    if not response_text:
        response_text = (
            "I experienced a temporary connection difficulty reaching the Groq inference service. "
            "Please try your question again in a moment!"
        )

    return {"response": response_text}


# -----------------------------------------------------------------------------
# Node 7: Format Output Node (Contextual suggestions)
# -----------------------------------------------------------------------------
def format_output_node(state: WindyState) -> dict[str, Any]:
    """Generates 3 contextual action chips to help the user explore further."""
    intent = state.get("intent") or "general_chat"
    actions: list[dict[str, str]] = []

    if intent == "data_analysis":
        actions = [
            {"label": "Peak error hours", "query": "Which hours had the largest forecast errors?"},
            {"label": "Compare 48h lead", "query": "How does forecast accuracy compare with a 48 hour lead time?"},
            {"label": "Best and worst days", "query": "Tell me more about the best and worst forecast days."},
        ]
    elif intent == "vintage_inquiry":
        actions = [
            {"label": "Vintage selection rule", "query": "How exactly does the decision cutoff select the vintage?"},
            {"label": "January 2026 overview", "query": "Summarize the overall January 2026 wind forecast accuracy."},
            {"label": "Why not latest vintage?", "query": "Why don't we use the latest available vintage instead?"},
        ]
    elif intent == "methodology_qa":
        actions = [
            {"label": "Why avoid MAPE?", "query": "Why is WAPE preferred over MAPE for wind forecasts?"},
            {"label": "January 2026 KPIs", "query": "What are the key accuracy metrics for January 2026?"},
            {"label": "Data sources explained", "query": "Explain the difference between WINDFOR and FUELHH."},
        ]
    else:
        actions = [
            {"label": "January 2026 KPIs", "query": "What was the wind forecast accuracy in January 2026?"},
            {"label": "Highest miss intervals", "query": "Show me the intervals with the largest forecast errors."},
            {"label": "How decision cutoff works", "query": "Explain how the 24 hour decision cutoff works."},
        ]

    return {"suggested_actions": actions}
