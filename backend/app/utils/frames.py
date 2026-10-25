from __future__ import annotations

from typing import Any, cast

import pandas as pd


def frame_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Rows as dicts keyed by column name (NaN/NaT preserved)."""
    return cast(list[dict[str, Any]], frame.to_dict("records"))
