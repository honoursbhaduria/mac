# GB Wind Forecast Intelligence

A full-stack web application that evaluates how accurate GB wind-generation forecasts were **at
the moment a purchasing decision had to be made**, using only Elexon's official **WINDFOR**
(forecast) and **FUELHH** (actual outturn) datasets.

> **Deployment status:** not yet publicly deployed. The Vercel configuration is included and its
> entrypoint is tested locally, but no deployment was made (see [Deployment](#18-deployment)).
> **Repository URL:** not yet created. **Demo video:** not yet recorded.

---

## 1. Business problem

A UK electricity utility buys power in the wholesale day-ahead market. How much wind generation
will arrive on the delivery day is uncertain, so the purchasing team relies on forecasts published
*before* delivery. The team needs to know:

- which wind forecast was actually available when it had to decide;
- how that forecast compared with what was generated;
- how large and how biased the errors were over a period;
- how the forecast changed between publications.

Using the newest forecast available *today* would flatter the forecast (hindsight bias). This
tool scores only the forecast that existed at each decision cutoff.

## 2. Key functionality

| Page | What it shows |
|---|---|
| **Overview** | KPIs: mean forecast and actual generation, MAE, RMSE, WAPE, mean bias and matched coverage. Also shows data retrieval time, cache/stale status, assumptions and data-quality notes. |
| **Forecast vs actual** | Hourly time series of the decision-time forecast against actual generation, with zoom (brush), tooltips and an optional signed-error chart. Click a point to open its vintages. |
| **Accuracy** | Metric table with formulas and denominators, a plain-language explanation of bias, daily MAE and bias, MAE by hour of day, forecast-vs-actual scatter, error histogram and a coverage breakdown. |
| **Vintages** | Every WINDFOR publication for a chosen hour: which were eligible at the cutoff, which one was selected, the actual outturn and the error. |
| **Records** | A searchable, sortable, paged table of every interval, including missing ones, and a **CSV export** generated server-side with the same filters. |

Filters (decision dates, optional delivery dates, lead time, actual-alignment policy) live in the
URL, so every view can be shared and survives a reload. The default view is decisions made during
**January 2026** with a **24 h** lead.

## 3. Architecture

```
 Browser (React + TanStack Query + Zod-validated responses)
   │  same-origin /api/*  (nginx proxy in Docker · Vite proxy in dev · rewrite on Vercel)
   ▼
 FastAPI  ─ api/         HTTP routing, validation, error mapping, CORS
   │      ─ services/
   │          analysis_service    orchestration
   │          forecast_selection  cutoff = T − lead · latest eligible vintage
   │          matching            forecast ⟷ actual by normalised UTC startTime
   │          metrics             MAE · RMSE · bias · WAPE (NumPy)
   │          data_normalization  validation, duplicates, data-quality warnings (pandas)
   │          elexon_client       HTTPX, retries/backoff, Retry-After, chunking, TTL cache
   │      ─ utils/timestamps      UTC parsing, Europe/London presentation
   ▼
 Elexon Insights API (public, no key)
   GET /datasets/WINDFOR/stream   GET /datasets/FUELHH/stream?fuelType=WIND
```

All business logic is in Python. The frontend only formats values and draws charts.

## 4. Technology stack

- **Frontend:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Recharts 3, React Router 7,
  TanStack Query 5, Zod 4, Lucide icons, and self-hosted Albert Sans, Alumni Sans and JetBrains Mono fonts.
- **Backend:** Python 3.13, FastAPI, Pydantic 2 / pydantic-settings, HTTPX, pandas 3, NumPy 2.
- **Quality:** Pytest (+ respx, pytest-asyncio, pytest-cov), Ruff, mypy (strict), ESLint,
  Prettier, Vitest + Testing Library, Playwright.
- **Delivery:** Docker, Docker Compose, nginx, GitHub Actions, Vercel configuration.

Dependencies are pinned in `backend/requirements*.txt` and `frontend/package.json`.

## 5. Data sources and attribution

| Dataset | Endpoint | Documentation |
|---|---|---|
| FUELHH | `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream` | <https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream> |
| WINDFOR | `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream` | <https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream> |

*Contains BMRS data from Elexon, used under the BMRS Data Licence.* No other dataset (prices,
demand, weather) is used.

## 6. No API key required

Both endpoints are public. Every request made during development was anonymous. The app has no
key setting and needs no account.

## 7. Dataset fields used

Verified against live responses and the official OpenAPI spec
(`https://data.elexon.co.uk/swagger/v1/swagger.json`) on 25 Oct 2026:

- **FUELHH** (bare JSON array): `startTime` (UTC, `Z`), `settlementDate` (London date),
  `settlementPeriod`, `fuelType` (filtered to `WIND`), `generation` (MW, half-hour average) and
  `publishTime`. Filters used: `settlementDateFrom` / `settlementDateTo` (inclusive, `yyyy-MM-dd`)
  and `fuelType=WIND`. Settlement filters cannot be combined with publish filters.
- **WINDFOR** (bare JSON array): `startTime` (delivery hour, UTC), `publishTime` (vintage, UTC)
  and `generation` (MW). Filters used: `publishDateTimeFrom` / `publishDateTimeTo` (inclusive,
  ISO-8601). Without filters, only the latest vintage is returned.

Observed source characteristics:

- WINDFOR is **hourly**, while FUELHH is **half-hourly**.
- WINDFOR publishes about 8 times a day at irregular minutes (`:25`, `:30`, `:58`). Each
  publication covers about 73 hourly start times (21:00 the previous day to +2 days 21:00).
- The DST day 2026-03-29 has 46 settlement periods.
- No duplicates or nulls appeared in the Dec 2025 – Feb 2026 samples.
- A 3-month request succeeded, but the app still fetches in 7-day aligned chunks.

## 8. Date window and forecast-selection policy

- **Decision dates** and **delivery dates** are separate Europe/London calendar dates.
- **Evaluation grid:** every UTC hour start `T`, matching WINDFOR resolution.
- **Decision cutoff:** `cutoff = T − decision_lead_hours` (default **24 h**, configurable from
  0 to 96 h in 0.5 h steps from the UI or API).
- An interval is in scope when its **cutoff** falls inside the decision dates and, if delivery
  dates are given, `T` falls inside them too. With the default January decisions and a 24 h lead,
  deliveries run from **2 Jan 00:00 to 1 Feb 23:00** (the window crosses into February).
- **Selection:** among WINDFOR vintages for `T` with `publishTime ≤ cutoff`, take the one with the
  **latest** `publishTime`. A vintage published exactly at the cutoff is eligible. Later vintages
  are **never** used, even if they were more accurate.
- **Matching** is by normalised UTC `startTime`:
  - `exact` (default): the FUELHH half-hour starting at `T`.
  - `hourly_mean` (optional): the mean of the half-hours at `T` and `T+30m`. If either is
    missing, the interval counts as missing an actual; nothing is estimated from one half.
- **Duplicate policy (deterministic, never averaged):**
  - FUELHH duplicates per `startTime` keep the latest `publishTime`; ties keep the last record in
    source order.
  - WINDFOR duplicates per (`startTime`, `publishTime`) keep the last record in source order.
  - Conflicting duplicates raise a data-quality warning.
- **Timestamps:**
  - All comparisons are in UTC.
  - A timestamp without an offset is treated as UTC (Elexon's documented convention) and flagged.
  - Display is Europe/London, with GMT/BST derived from the actual offset.

## 9. Assumptions and limitations

- The 24 h lead time is a **pilot modelling assumption**, not the market's gate-closure rule.
- Only `:00` FUELHH half-hours are scored under `exact` alignment, because WINDFOR is hourly.
  The `:30` half-hours are reported, not hidden.
- FUELHH is metered output, and so may reflect curtailment or constraint actions. If WINDFOR does
  not anticipate those actions, part of a positive bias could come from them rather than from the
  weather forecast. The two datasets alone cannot separate these causes, so the app does not claim
  either.
- Results describe **forecast accuracy only**. No price or demand data is used, so no cost or
  savings claims are made.
- The cache is in-memory and per process. On serverless hosts each instance has its own cache.

## 10. Metrics

`F_t` is the selected forecast (MW), `A_t` the actual (MW), `e_t = F_t − A_t`. Metrics use matched
intervals only.

| Metric | Formula | Denominator | Notes |
|---|---|---|---|
| MAE | `mean(|e_t|)` | number of matched intervals | MW |
| RMSE | `sqrt(mean(e_t²))` | number of matched intervals | MW; penalises large misses |
| Mean bias | `mean(e_t)` | number of matched intervals | **+** = over-forecast, **−** = under-forecast |
| WAPE | `100·Σ|e_t| / ΣA_t` | Σ actual over matched intervals | `null` (with explanation) if ΣA ≤ 0 |
| Bias % | `100·Σe_t / ΣA_t` | Σ actual over matched intervals | `null` if ΣA ≤ 0 |
| Total absolute error | `Σ|e_t|` | none | a sum of MW values, not energy |
| Coverage | `100·matched / evaluation intervals` | hourly grid size | |

The app also reports counts of evaluation intervals, FUELHH records available, intervals with an
actual, intervals with an eligible forecast, matched intervals, and each kind of missing interval.

MAPE is deliberately not used: it is undefined at zero actuals and unstable when actuals are
small. WAPE is never presented as "accuracy = 100 − WAPE".

## 11. Project structure

```
backend/
  app/
    main.py  config.py
    api/        health.py analysis.py actuals.py forecasts.py deps.py
    schemas/    common.py analysis.py forecast.py
    services/   elexon_client.py cache.py data_normalization.py forecast_selection.py
                matching.py metrics.py analysis_service.py container.py
    utils/      timestamps.py logging.py frames.py
  tests/
    unit/ integration/ live/
    fixtures/   synthetic.py  fake_elexon.py  mock_elexon_server.py   (TEST-ONLY)
  requirements.txt  requirements-dev.txt  pyproject.toml  Dockerfile
frontend/
  src/
    app/ components/{layout,filters,charts,kpis,tables,feedback}/ pages/ services/ hooks/
    types/ utils/ styles/ tests/
  e2e/  playwright.config.ts  nginx.conf.template  Dockerfile  package.json
api/index.py  vercel.json  requirements.txt  .python-version     (Vercel deployment)
docker-compose.yml  .env.example  .github/workflows/ci.yml  SUBMISSION.md
```

## 12. Local setup (without Docker)

Requires Python 3.12+ and Node 20.19+ (developed on Python 3.13 and Node 22).

```bash
# backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000        # API docs: http://localhost:8000/api/docs

# frontend (new terminal)
cd frontend
npm ci
npm run dev                                       # http://localhost:5173 (proxies /api -> :8000)
```

## 13. Docker

```bash
cp .env.example .env        # optional
docker compose up --build
```

- Frontend: <http://localhost:8080> (nginx serves the build and proxies `/api` to the backend)
- API docs: <http://localhost:8000/api/docs>, or <http://localhost:8080/api/docs> through the proxy

Both containers have health checks, and the frontend waits for a healthy backend.

## 14. Environment variables

**Backend** (all optional; safe defaults):

| Variable | Default | Purpose |
|---|---|---|
| `ELEXON_BASE_URL` | `https://data.elexon.co.uk/bmrs/api/v1` | Elexon API base |
| `CACHE_TTL_SECONDS` | `900` | TTL for recent source chunks |
| `HISTORICAL_CACHE_TTL_SECONDS` | `21600` | TTL for chunks ending > 4 days ago |
| `REQUEST_TIMEOUT_SECONDS` | `30` | read timeout (connect timeout: `CONNECT_TIMEOUT_SECONDS`=10) |
| `MAX_RETRIES` | `3` | bounded retries for timeouts, connection errors, 429 and 5xx |
| `MAX_DATE_RANGE_DAYS` | `93` | maximum decision/delivery range |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8080,…` | comma-separated allowed origins |
| `LOG_LEVEL` | `INFO` | JSON-lines logs |

Also available: `FETCH_CHUNK_DAYS`, `MAX_CONCURRENT_REQUESTS`, `WINDFOR_LOOKBACK_HOURS`,
`DEFAULT_DECISION_LEAD_HOURS`, `MAX_DECISION_LEAD_HOURS`, `RETRY_BACKOFF_SECONDS` and
`MAX_RETRY_AFTER_SECONDS`.

**Frontend** (build time): `VITE_API_BASE_URL`. Leave it empty for same-origin `/api`, which is
recommended. Set it to the API origin only when the API is hosted separately. No secrets are ever
put in the bundle.

## 15. API

Interactive docs are at `/api/docs`.

| Route | Description |
|---|---|
| `GET /api/health` | App status and version. Upstream status is **observed from real requests**, not probed (`upstream.checked=false`). |
| `GET /api/metadata` | Defaults, limits, filters, decision policy, metric definitions, sources. |
| `GET /api/analysis` | `decision_from`, `decision_to`, `decision_lead_hours`, `delivery_from`, `delivery_to`, `actual_alignment`. Returns intervals, metrics, coverage, daily/hourly aggregates, error histogram, data-quality warnings, source provenance and stale flag. |
| `GET /api/actuals` | `delivery_from`, `delivery_to`. FUELHH wind half-hours. |
| `GET /api/forecast-vintages` | `start_time` (on the hour, with offset), optional `decision_cutoff` or `decision_lead_hours`. Returns the chronological vintage history with eligibility and the selected vintage. |
| `GET /api/export.csv` | Same parameters and computation as `/api/analysis`. |

```bash
curl "http://localhost:8000/api/analysis?decision_from=2026-01-01&decision_to=2026-01-31&decision_lead_hours=24"
curl "http://localhost:8000/api/forecast-vintages?start_time=2026-01-15T12:00:00Z"
curl -OJ "http://localhost:8000/api/export.csv?decision_from=2026-01-01&decision_to=2026-01-31"
```

**Errors** use the shape `{"error": {"code", "message", "details?"}}`:

| Situation | Status |
|---|---|
| Invalid input | `422` |
| Elexon timeout | `504` |
| Elexon connection failure or rate limit | `503` |
| Elexon HTTP error or malformed data | `502` |

Stack traces are never returned. If a refresh fails but an earlier copy is cached, the response
is served with `stale: true`, the retrieval time and a warning. Nothing is ever substituted for
missing data.

## 16. Tests

```bash
# backend: unit + API + integration (network-free; the live tests skip themselves)
cd backend && pytest --cov=app
ruff check . && ruff format --check . && mypy app tests

# frontend
cd frontend
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build

# end-to-end: starts a mock Elexon server, the real backend and a production frontend build
cd frontend && npx playwright install chromium && npx playwright test
```

What the suites cover:

- **Backend unit tests:**
  - Timestamp parsing and DST presentation.
  - Normalisation and the duplicate policy.
  - Cutoff selection, including "published exactly at cutoff" and "one second late".
  - Matching, metrics, input validation, and a guard that application code never imports test
    fixtures.
- **Backend API/integration tests:**
  - The full pipeline against hand-calculated fixtures, including a forecast that is perfect but
    published after the cutoff and is excluded.
  - 429 with `Retry-After`, persistent 429, 5xx, timeouts, connection errors, malformed JSON and
    malformed records.
  - CORS, cache hit and expiry, stale fallback, CSV parity, vintages, and lazy startup without
    lifespan.
- **Frontend:**
  - Filter state and validation, lead-time requests, loading, empty and error states.
  - KPIs with null metrics, chart rendering and tooltips, vintage selection, table filter/sort,
    and the CSV link.
- **E2E (Playwright):** the nine required scenarios plus a mobile check for horizontal overflow.

## 17. Live API smoke test (opt-in)

```bash
cd backend && RUN_LIVE_TESTS=1 pytest tests/live -v
```

## 18. Deployment

**Recommended: one Vercel project.** The Vite build is served from the CDN and the FastAPI app
runs as a Python function at `api/index.py`. `vercel.json` rewrites `/api/*` to the function, so
the browser uses same-origin requests and no CORS or `VITE_API_BASE_URL` is needed.

1. Push the repository to GitHub (see `SUBMISSION.md`).
2. In Vercel, choose **New Project → Import** the repository with **Root Directory** set to the
   repository root. `vercel.json` supplies the install and build commands, the output directory and
   the function settings.
3. Environment variables are optional because the defaults work. Optionally set `LOG_LEVEL`,
   `CACHE_TTL_SECONDS` and `MAX_RETRIES`.
4. Deploy, then verify:
   - `https://<app>/api/health` returns `{"status":"ok"}`.
   - `https://<app>/api/analysis` returns 744 matched intervals for the default window.
   - The site loads in an incognito window.

Alternatively: `npm i -g vercel && vercel login && vercel --prod` from the repository root.

**Deployment checklist:**

- [ ] `/api/health` OK
- [ ] Default analysis loads in the UI
- [ ] Vintage explorer loads
- [ ] CSV downloads
- [ ] `CORS_ORIGINS` includes the frontend origin (split hosting only)
- [ ] `VITE_API_BASE_URL` set (split hosting only)
- [ ] Incognito check passed

**Split hosting alternative:** host the backend Docker image on any container host and set
`CORS_ORIGINS=https://<frontend-origin>`. Build the frontend with
`VITE_API_BASE_URL=https://<api-origin>`.

**Status:** not deployed. The Vercel connector in the development environment was not
authenticated, and no Vercel CLI login was available. The Vercel entrypoint was tested locally
by importing `api/index.py` and serving `/api/health` and a live `/api/analysis` request.
`vercel build` itself was not run.

## 19–21. Links

- Deployed application: *not yet deployed.*
- Public GitHub repository: *not yet created.*
- Demo video: *not yet recorded.*

## 22. Known limitations and future improvements

- Persistent cache (e.g. SQLite) to survive restarts and share across serverless instances.
- Horizon-segmented accuracy (error vs forecast lead time) and rolling-window comparisons.
- An optional 30-minute evaluation that treats the hourly forecast as constant across both
  half-hours, clearly labelled.
- A virtualised table for very long ranges (currently paged at 48 rows).

## AI assistance disclosure

This project was implemented with **Claude Code** (Anthropic's agentic coding CLI, model Claude
Opus 5.5) working from the assignment brief. The visual style follows a reference supplied by the
author: the look of https://impeccable.style (light paper surfaces, condensed light display type,
gold highlight chips). Only the style was adopted; no branding, logo or copy from that site is used.
Claude Code:

- inspected the live Elexon endpoints and OpenAPI spec;
- wrote the backend, frontend, tests, Docker, CI and documentation;
- ran the test suites, linters, type checkers, Docker Compose and browser screenshots in a local
  Linux environment, and fixed the failures they exposed.

No external code review or audit was performed. The GitHub Actions workflow has not yet run on
GitHub, because no remote repository exists yet.
