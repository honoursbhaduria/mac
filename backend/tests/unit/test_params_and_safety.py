from datetime import date
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.analysis import AnalysisParams

APP_DIR = Path(__file__).resolve().parents[2] / "app"


def params(**overrides: object) -> AnalysisParams:
    base: dict[str, object] = {
        "decision_from": date(2026, 1, 1),
        "decision_to": date(2026, 1, 31),
        "decision_lead_hours": 24,
    }
    base.update(overrides)
    return AnalysisParams.model_validate(base)


def test_valid_defaults() -> None:
    p = params()
    p.validate_limits(93, 96)
    assert p.actual_alignment == "exact"


@pytest.mark.parametrize(
    "overrides",
    [
        {"decision_to": date(2025, 12, 31)},
        {"decision_lead_hours": -1},
        {"decision_lead_hours": 1.25},
        {"delivery_from": date(2026, 1, 5)},
        {"delivery_from": date(2026, 1, 5), "delivery_to": date(2026, 1, 4)},
        {"actual_alignment": "nearest"},
    ],
)
def test_invalid_combinations_rejected(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        params(**overrides)


def test_range_and_lead_limits() -> None:
    with pytest.raises(ValueError, match="decision date range"):
        params(decision_to=date(2026, 6, 1)).validate_limits(93, 96)
    with pytest.raises(ValueError, match="delivery date range"):
        params(delivery_from=date(2026, 1, 1), delivery_to=date(2026, 6, 1)).validate_limits(93, 96)
    with pytest.raises(ValueError, match="lead"):
        params(decision_lead_hours=100).validate_limits(93, 96)
    params(decision_lead_hours=0.5).validate_limits(93, 96)


def test_application_code_never_imports_test_fixtures() -> None:
    """Synthetic data must not be reachable from production code paths."""
    offenders = []
    for path in APP_DIR.rglob("*.py"):
        text = path.read_text()
        if "from tests" in text or "import tests" in text or "synthetic" in text.lower():
            offenders.append(str(path.relative_to(APP_DIR)))
    assert offenders == []
