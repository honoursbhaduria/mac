import math

import numpy as np
import pytest

from app.services.metrics import bias, compute_metrics, mae, rmse, wape

F = [110.0, 90.0, 130.0, 100.0]
A = [100.0, 100.0, 100.0, 100.0]
# errors: +10, -10, +30, 0


def test_mae() -> None:
    assert mae(F, A) == pytest.approx(12.5)


def test_rmse() -> None:
    assert rmse(F, A) == pytest.approx(math.sqrt((100 + 100 + 900 + 0) / 4))


def test_signed_bias() -> None:
    assert bias(F, A) == pytest.approx(7.5)
    assert bias([90.0, 80.0], [100.0, 100.0]) == pytest.approx(-15.0)  # under-forecast is negative


def test_wape() -> None:
    assert wape(F, A) == pytest.approx(100 * 50 / 400)


def test_compute_metrics_bundle() -> None:
    m = compute_metrics(F, A)
    assert m.n == 4
    assert m.mae_mw == pytest.approx(12.5)
    assert m.bias_pct == pytest.approx(100 * 30 / 400)
    assert m.total_abs_error_mw == pytest.approx(50)
    assert m.mean_forecast_mw == pytest.approx(107.5)
    assert m.rmse_mw is not None and m.mae_mw is not None and m.rmse_mw >= m.mae_mw


def test_zero_total_actual_makes_percentages_undefined() -> None:
    m = compute_metrics([5.0, 10.0], [0.0, 0.0])
    assert m.wape_pct is None and m.bias_pct is None
    assert m.mae_mw == pytest.approx(7.5)
    assert any("undefined" in n for n in m.notes)
    assert wape([5.0], [0.0]) is None


def test_empty_input_returns_nulls() -> None:
    m = compute_metrics([], [])
    assert m.n == 0
    assert m.mae_mw is None and m.rmse_mw is None and m.bias_mw is None and m.wape_pct is None
    assert mae([], []) is None and rmse([], []) is None and bias([], []) is None


def test_non_finite_pairs_are_excluded() -> None:
    m = compute_metrics([100.0, np.nan, 50.0, np.inf], [90.0, 10.0, np.nan, 5.0])
    assert m.n == 1
    assert m.mae_mw == pytest.approx(10)


def test_length_mismatch_raises() -> None:
    with pytest.raises(ValueError):
        compute_metrics([1.0], [1.0, 2.0])
