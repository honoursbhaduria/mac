"""Vercel Python function entrypoint: serves the FastAPI backend under /api/*.

The frontend is built as static files (frontend/dist) and served by Vercel's CDN; vercel.json
rewrites /api/* to this function so the browser uses same-origin requests (no CORS needed).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
