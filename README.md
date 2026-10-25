# GB Wind Forecast Intelligence & Windy Assistant

An end-to-end decision intelligence platform and conversational copilot built for UK energy utility trading desks to evaluate day-ahead wind power forecast accuracy at decision time, powered by **FastAPI**, **React 19**, **Elexon BMRS** open data, and the **Windy** conversational assistant built with **LangGraph** and **Groq**.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agentic_Workflow-FF6F00)](https://langchain-ai.github.io/langgraph/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Submission Deliverables & Quick Links

| Required Deliverable | Link & Details |
| :--- | :--- |
| **Link to Vercel / Heroku App** | 🔗 **[[[https://windy-honoursbhaduria.vercel.app](https://windy-kappa.vercel.app/)](https://windy-kappa.vercel.app/)]([https://windy-honoursbhaduria.vercel.app](https://windy-kappa.vercel.app/))** *(Vercel Serverless Production Deployment)*<br>• Local Container Portal: `http://localhost:8080`<br>• Interactive API Swagger Docs: `http://localhost:8000/api/docs` |
| **How to Start the Application** | ⚡ **[Jump to Quickstart](#how-to-start-the-application)**: One-command launch with `docker compose up --build -d` |
| **Details of Files and Directories** | 📁 **[Jump to Project Structure](#details-of-the-files-and-directories-present)**: Full file-by-file directory breakdown |
| **Public GitHub Repository** | 🐙 **[https://github.com/honoursbhaduria/windy.git](https://github.com/honoursbhaduria/windy.git)** |

---

## Table of Contents

1. [Link to the Vercel / Heroku App](#link-to-the-vercel--heroku-app)
2. [How to Start the Application](#how-to-start-the-application)
3. [Details of the Files and Directories Present](#details-of-the-files-and-directories-present)
4. [Business Context & Problem Statement](#business-context--problem-statement)
5. [Verified January 2026 Accuracy Outturns](#verified-january-2026-accuracy-outturns)
6. [Decision-Cutoff & No-Hindsight-Bias Methodology](#decision-cutoff--no-hindsight-bias-methodology)
7. [Windy: LangGraph & Groq Decision Copilot](#windy-langgraph--groq-decision-copilot)
8. [System Architecture](#system-architecture)
9. [Mathematical KPI Formulations](#mathematical-kpi-formulations)
10. [Elexon BMRS Datasets & Ingestion Engine](#elexon-bmrs-datasets--ingestion-engine)
11. [Configuration & Environment Variables](#configuration--environment-variables)
12. [API Reference](#api-reference)
13. [Testing & Quality Verification](#testing--quality-verification)
14. [Author & Attribution](#author--attribution)

---

## Link to the Vercel / Heroku App

### Live Production Deployment
- **Vercel Application URL**: **[https://windy-honoursbhaduria.vercel.app](https://windy-honoursbhaduria.vercel.app)**
- **API Health Endpoint**: **[https://windy-honoursbhaduria.vercel.app/api/health](https://windy-honoursbhaduria.vercel.app/api/health)**
- **API Swagger Documentation**: **[https://windy-honoursbhaduria.vercel.app/api/docs](https://windy-honoursbhaduria.vercel.app/api/docs)**

### Vercel Architecture & Deployment Details
The project is configured for seamless monorepo deployment on **Vercel** via [`vercel.json`](vercel.json) and [`api/index.py`](api/index.py):
1. **Edge Static Frontend**: The React 19 application is compiled with Vite into static assets served globally via Vercel's Edge CDN (`outputDirectory: frontend/dist`).
2. **Serverless Python Backend**: The FastAPI backend is packaged as a serverless Python function running at `api/index.py`.
3. **Transparent Route Rewriting**: `vercel.json` rewrites all `/api/(.*)` requests directly to the Python function, allowing the browser to use same-origin requests (`/api/*`) with zero CORS overhead.

### Alternative Container Hosting (Heroku / Docker)
The application includes a production-ready container stack via [`docker-compose.yml`](docker-compose.yml) and multi-stage [`Dockerfile`](backend/Dockerfile) files:
- Accessible locally or on cloud container hosts at `http://localhost:8080`.
- To deploy on Heroku Container Registry: `heroku container:push web` and `heroku container:release web`.

---

## How to Start the Application

### Option A: One-Command Docker Stack (Recommended)
Runs the entire stack (FastAPI backend, React 19 frontend, Nginx reverse proxy) in isolated, production-like containers:

```bash
# 1. Clone the repository
git clone https://github.com/honoursbhaduria/windy.git
cd windy

# 2. Configure environment variables (optional; safe defaults exist for all values)
cp .env.example .env

# 3. Launch services
docker compose up --build -d
```

#### Access Endpoints
- **Web Portal**: [http://localhost:8080](http://localhost:8080)
- **FastAPI Interactive Docs**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **Health Verification**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

To view logs or stop the stack:
```bash
# View live container logs
docker compose logs -f

# Shut down containers
docker compose down
```

---

### Option B: Local Development (Without Docker)

#### Prerequisites
- **Python 3.12+** (Developed and verified on Python 3.13)
- **Node.js 20.19+** (Developed on Node 22)

#### 1. Start the FastAPI Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate

# Install development dependencies
pip install -r requirements-dev.txt

# Start FastAPI development server with auto-reload
uvicorn app.main:app --reload --port 8000
```
*API docs will be available at [http://localhost:8000/api/docs](http://localhost:8000/api/docs).*

#### 2. Start the React Frontend
In a separate terminal window:
```bash
cd frontend
npm install

# Launch Vite dev server (automatically proxies /api requests to localhost:8000)
npm run dev
```
*Web portal will be available at [http://localhost:5173](http://localhost:5173).*

---

## Details of the Files and Directories Present

Below is a complete file-by-file breakdown of every directory and file in the project:

```
windy/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI workflow (Python lint, mypy, Vitest, Playwright, Docker build)
├── api/
│   └── index.py                 # Vercel serverless entrypoint wrapping FastAPI app
├── backend/
│   ├── app/
│   │   ├── agent/               # Windy Conversational Decision Copilot (LangGraph)
│   │   │   ├── __init__.py
│   │   │   ├── graph.py         # Compiled StateGraph connecting query analysis, data fetch, generation & pruning
│   │   │   ├── nodes.py         # 4 execution nodes: query analysis, service data fetch, Groq LLM inference, context pruning
│   │   │   ├── prompts.py       # Strict system instructions enforcing ground truth and forbidding hallucinations
│   │   │   └── state.py         # TypedDict schema defining conversation state, token estimates, and metadata
│   │   ├── api/                 # FastAPI HTTP route handlers
│   │   │   ├── __init__.py
│   │   │   ├── actuals.py       # GET /api/actuals: returns FUELHH wind outturn records
│   │   │   ├── analysis.py      # GET /api/analysis & GET /api/export.csv: core accuracy metrics and time series
│   │   │   ├── deps.py          # FastAPI dependency injection for AnalysisService
│   │   │   ├── forecasts.py     # GET /api/forecast-vintages: chronological publication history for target hours
│   │   │   ├── health.py        # GET /api/health: service status and upstream BMRS availability
│   │   │   └── windy.py         # POST /api/windy/chat & GET /api/windy/health: agent chat endpoint
│   │   ├── schemas/             # Pydantic v2 data models & validation
│   │   │   ├── __init__.py
│   │   │   ├── analysis.py      # Request/response schemas for metrics, intervals, diurnal profiles, histograms
│   │   │   ├── common.py        # Error schemas, timestamp helpers, pagination models
│   │   │   └── forecast.py      # Vintage publication schemas and eligibility models
│   │   ├── services/            # Domain logic and analytical engines
│   │   │   ├── __init__.py
│   │   │   ├── analysis_service.py # Orchestrator coordinating fetching, cutoff filtering, matching & scoring
│   │   │   ├── cache.py         # Thread-safe in-memory cache with dual TTL (15m recent, 6h historical)
│   │   │   ├── container.py     # Service container and factory helpers
│   │   │   ├── data_normalization.py # Validates schemas, removes duplicates, surfaces quality warnings
│   │   │   ├── elexon_client.py # HTTPX client with retries, jitter backoff, Retry-After handling & chunking
│   │   │   ├── forecast_selection.py # Filters vintages by decision cutoff and selects latest eligible forecast
│   │   │   ├── matching.py      # Aligns WINDFOR forecasts with FUELHH actuals (exact or hourly_mean)
│   │   │   └── metrics.py       # Vectorized NumPy/Pandas calculations for MAE, RMSE, WAPE, Bias
│   │   ├── utils/               # Formatting, timezone & logging utilities
│   │   │   ├── __init__.py
│   │   │   ├── frames.py        # Pandas DataFrame manipulation helpers
│   │   │   ├── logging.py       # Structured JSON logging
│   │   │   └── timestamps.py    # ISO 8601 UTC parsing, London GMT/BST conversions
│   │   ├── config.py            # Pydantic settings loading environment variables with defaults
│   │   └── main.py              # FastAPI application factory, CORS middleware, exception handlers
│   ├── tests/                   # Automated backend test suite (114 passing tests)
│   │   ├── fixtures/            # Mock Elexon servers, synthetic time series, and hand-calculated fixtures
│   │   ├── integration/         # API endpoint tests, pipeline tests, upstream failure handling
│   │   ├── live/                # Opt-in live smoke tests against real Elexon endpoints
│   │   ├── unit/                # Unit tests for metrics, timestamp parsing, selection, normalization & agent
│   │   └── conftest.py          # Pytest shared fixtures and test client configuration
│   ├── .dockerignore
│   ├── Dockerfile               # Multi-stage minimal production container running non-root appuser
│   ├── pyproject.toml           # Tool configuration for Ruff, mypy, pytest
│   ├── requirements-dev.txt     # Test and linting dependencies (pytest, ruff, mypy, respx)
│   └── requirements.txt         # Production runtime dependencies
├── frontend/
│   ├── e2e/                     # Playwright browser end-to-end test suite (11 passing tests)
│   │   └── app.spec.ts          # E2E tests: dashboard load, date filters, lead times, charts, vintages, mobile overflow, Windy chat
│   ├── public/                  # Static assets (favicons, manifest)
│   ├── src/
│   │   ├── app/                 # React application roots
│   │   │   ├── App.tsx          # Router configuration and layout routes
│   │   │   └── queryClient.ts   # TanStack Query client configuration with caching policies
│   │   ├── assets/              # Branding icons (wind.png)
│   │   ├── components/
│   │   │   ├── charts/          # Recharts visualizations (TimeSeries, Diurnal profiles, Histograms, Scatter)
│   │   │   ├── feedback/        # Status strips, error alerts, loading gates
│   │   │   ├── filters/         # FilterPanel with date range, lead time slider, delivery filters
│   │   │   ├── kpis/            # KpiDisplay cards with math formulas and denominators
│   │   │   ├── layout/          # AppShell (responsive navigation), Bay wrappers, PageOpenings
│   │   │   ├── tables/          # RecordsTable with pagination, search, status filtering, CSV export
│   │   │   └── windy/           # Windy Assistant UI
│   │   │       ├── MarkdownView.tsx # react-markdown with remark-gfm and responsive table scrolling
│   │   │       └── WindyWidget.tsx  # Resizable desktop drawer (drag handle) + mobile popup modal with cookie persistence
│   │   ├── hooks/               # Custom React hooks (useAnalysis, useFilters, usePageAnalysis)
│   │   ├── pages/               # Top-level page views
│   │   │   ├── AccuracyPage.tsx # Diurnal profiles, daily MAE, error histogram, scatter plots
│   │   │   ├── ForecastVintagePage.tsx # Single-hour vintage explorer with eligibility cutoff visualization
│   │   │   ├── ForecastVsActualPage.tsx # Dual line time series with brush zoom and signed error chart
│   │   │   ├── NotFoundPage.tsx # 404 page
│   │   │   ├── OverviewPage.tsx # Primary dashboard with KPI cards, summary charts, assumptions
│   │   │   └── RecordsPage.tsx  # Granular interval audit table with instant CSV export
│   │   ├── services/            # Client-side typed API clients (api.ts, windyApi.ts, export.ts)
│   │   ├── styles/              # Tailwind CSS v4 design tokens and custom paper-theme CSS
│   │   ├── tests/               # Vitest component test suite (36 passing tests)
│   │   ├── types/               # TypeScript interfaces for API contracts, filters, and Windy
│   │   ├── utils/               # Formatting, date calculations, and KPI calculations
│   │   └── main.tsx             # React entrypoint
│   ├── .dockerignore
│   ├── Dockerfile               # Multi-stage production container: Node 22 build + Nginx Alpine
│   ├── nginx.conf.template      # Nginx reverse proxy routing static files and proxying /api to FastAPI
│   ├── package.json             # Frontend dependencies and npm scripts
│   ├── playwright.config.ts     # Playwright configuration with webServer launch
│   ├── tsconfig.json            # TypeScript compiler configuration
│   └── vite.config.ts           # Vite build configuration with development proxy
├── .env.example                 # Template for local environment variables
├── .gitignore                   # Git ignore file excluding secrets, caches, and node_modules
├── .python-version              # Python version pin (3.13)
├── .vercelignore                # Vercel deployment exclusions
├── docker-compose.yml           # Production Docker Compose stack (backend + frontend)
├── requirements.txt             # Root dependencies for Vercel Python runtime
├── vercel.json                  # Vercel monorepo routing, build commands, and rewrites
└── README.md                    # This comprehensive technical guide
```

---

## Business Context & Problem Statement

In the UK electricity wholesale market, electricity utilities purchase power one day ahead to supply consumer demand. Wholesale purchasing decisions must be committed in the day-ahead auction 24 hours before the actual delivery day.

Because wind generation is weather-dependent and volatile, energy utilities face financial imbalance risks:
- **Over-forecasting wind (being "long")**: Procuring too little thermal or market generation, forcing the utility to buy expensive imbalance volume from the Balancing Mechanism during wind shortfalls.
- **Under-forecasting wind (being "short")**: Procuring excess thermal generation, incurring unnecessary fuel expense and "spilling" wind power at distressed cashout prices.

### How This Tool Solves the Problem
Off-the-shelf dashboards frequently benchmark outturns against the newest forecast published *today* (committing **hindsight bias**). This platform:
1. Reconstructs the exact forecast state available at the historical moment of purchase for every half-hour interval.
2. Quantifies volumetric risk, systemic bias, and diurnal patterns (MAE, RMSE, WAPE, Mean Bias).
3. Provides an interactive decision assistant (**Windy**) to answer trader queries over actual outturns.

---

## Verified January 2026 Accuracy Outturns

Computed from official Elexon **WINDFOR** and **FUELHH** national datasets under standard day-ahead market conditions (**24-hour decision lead time**, `exact` half-hourly alignment, Europe/London decision dates 2026-01-01 to 2026-01-31):

| Metric | Measured Platform Value | Industry Interpretation |
| :--- | :--- | :--- |
| **Coverage** | **100.0%** (744 / 744 intervals) | Full month coverage with zero missing intervals. |
| **Mean Forecast** | **13,021.7 MW** | Average day-ahead expected wind generation. |
| **Mean Actual Outturn** | **11,285.5 MW** | Average metered actual wind generation. |
| **Mean Absolute Error (MAE)**| **1,932.2 MW** | Expected absolute magnitude of forecast error per hour. |
| **Root Mean Square Error (RMSE)**| **2,399.4 MW** | Heavily penalizes large volumetric misses for risk modeling. |
| **Mean Bias** | **+1,736.2 MW** (+15.4%) | **Systemic Over-forecast:** Forecaster predicted 15.4% more wind than arrived. |
| **Weighted Abs % Error (WAPE)**| **17.1%** | Total absolute error divided by total generated volume. |
| **Peak Over-forecast Miss** | **+7,419.0 MW** (2026-01-25 15:00 UTC) | Largest shortfall risk; wind dropped severely below forecast. |
| **Peak Under-forecast Miss** | **-5,612.0 MW** (2026-01-10 03:00 UTC) | Wind generated significantly exceeded forecast expectation. |

---

## Decision-Cutoff & No-Hindsight-Bias Methodology

### Mathematical Formulation
For any target delivery hour $T$ (expressed in UTC):
$$\text{Cutoff}(T) = T - \Delta t_{\text{lead}}$$

Where $\Delta t_{\text{lead}}$ defaults to **24 hours** (configurable from 0 to 96 hours in 30-minute increments).

```
                      T - 24h (Cutoff)                             T (Delivery)
Timeline: ───────────────┬──────────────────────────────────────────────┬────────►
                         │                                              │
  Vintages:  ●       ●   ●  │     ✕                   ✕                 │
           v1      v2   v3 │    v4                  v5                  │
  Status:  [Eligible]   [SELECTED] [Rejected: Hindsight Bias]           Actual Outturn: A(T)
```

1. **Eligibility Rule**: A WINDFOR forecast vintage $v = (\text{publishTime}, \text{generation})$ is eligible for target hour $T$ if and only if:
   $$\text{publishTime}(v) \le \text{Cutoff}(T)$$
2. **Selection Rule**: The platform selects the eligible vintage with the strictly **latest** publication time:
   $$v^*(T) = \arg\max_{v \in \text{Eligible}(T)} \text{publishTime}(v)$$
3. **Temporal Alignment**:
   - `exact` (Default): Evaluates the selected hourly forecast against the metered FUELHH record at `startTime = T`.
   - `hourly_mean`: Averages the two half-hours `T` and `T + 30m`. If either half-hour is missing, the interval is strictly flagged as missing actuals without fabricated interpolation.

---

## Windy: LangGraph & Groq Decision Copilot

**Windy** is an embedded conversational intelligence assistant built with **LangGraph** and **Groq** high-throughput LPU inference (`openai/gpt-oss-120b` with automated fallback to `openai/gpt-oss-20b`).

```
                ┌────────────────────────────────┐
                │          User Query            │
                └───────────────┬────────────────┘
                                │
                                ▼
               ┌───────────────────────────────────┐
               │    analyze_query_node (Intent)    │
               │  - Extracts Month/Dates via Regex │
               │  - Determines required dimensions │
               └───────────────┬───────────────────┘
                                │
                                ▼
               ┌───────────────────────────────────┐
               │      fetch_data_node (Tools)      │
               │  - Queries AnalysisService directly│
               │  - Computes exact ground truth    │
               └───────────────┬───────────────────┘
                                │
                                ▼
               ┌───────────────────────────────────┐
               │   generate_response_node (Groq)   │
               │  - Strict dataset grounding       │
               │  - Generates Markdown tables      │
               └───────────────┬───────────────────┘
                                │
                                ▼
               ┌───────────────────────────────────┐
               │     prune_context_node (Safety)   │
               │  - Evicts stale turns & tokens    │
               │  - Prevents context window limits │
               └───────────────────────────────────┘
```

### UI Features of Windy
- **User-Adjustable Desktop Drawer**: On desktop, Windy docks to the right side with an interactive **drag-to-resize handle** (280px to 950px width) and preset buttons (`1/5`, `Std`, `Wide`). Operates without background blur so you can interact with the dashboard simultaneously.
- **Mobile Popup Modal**: On mobile devices (`< 640px`), Windy automatically transforms into an intuitive popup modal card with a native grabber pill and dimmed backdrop.
- **Cookie Persistence**: Chat conversations are automatically saved in browser cookies (`windy_chat_history`) with automatic payload size guarding, persisting across page refreshes.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT BROWSER (React 19)                            │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌───────────────────┐ │
│  │ Overview / Analytics  │  │ Recharts Visualizations │  │ Windy UI Drawer   │ │
│  └───────────┬───────────┘  └────────────┬────────────┘  └─────────┬─────────┘ │
│              │                           │                         │           │
│              └───────────────────────────┼─────────────────────────┘           │
│                                          │  same-origin /api/*                 │
└──────────────────────────────────────────┼─────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                              NGINX REVERSE PROXY                               │
│                   Port 8080 · Static Asset Cache · API Routing                  │
└──────────────────────────────────────────┬─────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                            FASTAPI BACKEND SERVICE                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ API Layer: /api/analysis · /api/vintages · /api/actuals · /api/windy     │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      │                                         │
│  ┌───────────────────────────────────▼──────────────────────────────────────┐  │
│  │ Core Engine: AnalysisService · ForecastSelection · Metrics (NumPy/Pandas) │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      │                                         │
│  ┌───────────────────────────────────▼──────────────────────────────────────┐  │
│  │ LangGraph Engine: 4-Node Directed Graph · Groq Client (gpt-oss-120b)     │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      │                                         │
│  ┌───────────────────────────────────▼──────────────────────────────────────┐  │
│  │ Ingestion & Caching: ElexonClient · HTTPX Async · TTL Memory Cache       │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
└──────────────────────────────────────┼─────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL DATA & AI PROVIDERS                          │
│   • Elexon BMRS API (WINDFOR & FUELHH)   • Groq Cloud API (LPU Inference)      │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Mathematical KPI Formulations

Let $t \in \{1, \dots, N\}$ index the matched evaluation intervals.  
Let $F_t$ be the selected decision-time forecast (MW) and $A_t$ be the metered actual generation (MW).  
The forecast error is defined as:
$$e_t = F_t - A_t$$

| Metric | Mathematical Formula | Denominator | Practical Trading Impact |
| :--- | :---: | :---: | :--- |
| **Mean Absolute Error (MAE)** | $\frac{1}{N} \sum_{t=1}^N \|e_t\|$ | Matched intervals $N$ | Measures typical volumetric deviation in MW. Direct benchmark for balancing volume. |
| **Root Mean Square Error (RMSE)** | $\sqrt{\frac{1}{N} \sum_{t=1}^N e_t^2}$ | Matched intervals $N$ | Square-error weighting penalizes large volumetric misses that trigger market stress. |
| **Mean Bias** | $\frac{1}{N} \sum_{t=1}^N e_t$ | Matched intervals $N$ | $+ = \text{Over-forecast (Long)}$, $- = \text{Under-forecast (Short)}$. |
| **Weighted Absolute Percentage Error (WAPE)** | $\frac{\sum_{t=1}^N \|e_t\|}{\sum_{t=1}^N A_t} \times 100\%$ | Total actual generation | Volume-weighted error percentage. Avoids division-by-zero instability of MAPE. |
| **Bias Percentage** | $\frac{\sum_{t=1}^N e_t}{\sum_{t=1}^N A_t} \times 100\%$ | Total actual generation | Normalized directional bias relative to total fleet production. |
| **Evaluation Coverage** | $\frac{N_{\text{matched}}}{N_{\text{expected}}} \times 100\%$ | Total expected intervals | Verifies data completeness and flags missing settlement periods. |

> **Why WAPE instead of MAPE?**  
> In wind power generation, actual production regularly approaches zero MW during calm weather. Mean Absolute Percentage Error ($\text{MAPE} = \frac{1}{N} \sum \frac{|F_t - A_t|}{A_t}$) produces infinite or division-by-zero errors in calm periods and disproportionately inflates small misses. WAPE computes the ratio of total absolute errors over total actual energy, providing a stable, mathematically sound benchmark.

---

## Elexon BMRS Datasets & Ingestion Engine

The application consumes two official Elexon Insights Solution streams:

1. **Actual Outturns (FUELHH)**:
   - Endpoint: `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?fuelType=WIND`
   - Fields: `startTime` (UTC), `settlementDate`, `settlementPeriod`, `generation` (MW), `fuelType`.
   - Resolution: 30 minutes (half-hourly settlement).
2. **Forecast Generation (WINDFOR)**:
   - Endpoint: `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream`
   - Fields: `startTime` (Delivery UTC hour), `publishTime` (Publication timestamp), `generation` (MW).
   - Resolution: 1 hour (published ~8 times daily covering a rolling 72-hour horizon).

*Both datasets are 100% public under the BMRS Data Licence; no API key is required.*

---

## Configuration & Environment Variables

All variables have safe defaults. Custom overrides can be placed in `.env`:

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `ELEXON_BASE_URL` | `https://data.elexon.co.uk/bmrs/api/v1` | Official Elexon BMRS endpoint. |
| `GROQ_API_KEY` | *(Set in `.env`)* | Groq API Key used by the Windy assistant. |
| `WINDY_MODEL` | `openai/gpt-oss-120b` | Primary high-intelligence LLM for Windy. |
| `WINDY_FALLBACK_MODEL` | `openai/gpt-oss-20b` | Automated fallback model if primary hits rate limits. |
| `CACHE_TTL_SECONDS` | `900` (15 mins) | In-memory cache lifetime for recent data. |
| `HISTORICAL_CACHE_TTL_SECONDS` | `21600` (6 hours) | In-memory cache lifetime for settled historic data. |
| `REQUEST_TIMEOUT_SECONDS` | `30` | HTTPX request timeout for Elexon API requests. |
| `MAX_RETRIES` | `3` | Maximum automatic retries for transient HTTP errors. |
| `FRONTEND_PORT` | `8080` | Host port for frontend web portal. |
| `BACKEND_PORT` | `8000` | Host port for backend FastAPI service. |
| `CORS_ORIGINS` | `http://localhost:8080,http://localhost:5173` | Allowed CORS origins for the API. |

---

## API Reference

Interactive Swagger documentation is available at `/api/docs`.

### Primary Endpoints
- `GET /api/analysis`: Calculates decision-time accuracy metrics and time series for a specified decision and delivery window.
- `GET /api/forecast-vintages`: Inspects all WINDFOR forecast publications for a single delivery hour.
- `GET /api/export.csv`: Streams an instant CSV containing every evaluated interval matching the exact active query filters.
- `POST /api/windy/chat`: Conversational intelligence endpoint executing the LangGraph assistant graph.
- `GET /api/health`: Application health check and observed upstream status.

---

## Testing & Quality Verification

```
Total Test Coverage:
├── Backend:  114 Passing Pytest Tests (Unit, Normalization, Integration, Pipeline)
├── Frontend:  36 Passing Vitest Tests (Components, Units, MarkdownView, Assistant, Cookies)
└── E2E:       11 Passing Playwright Tests (Full user journeys, mobile zero-overflow)
```

### Running the Test Suites
```bash
# Backend tests & linters
cd backend
pytest --cov=app -v
ruff check app tests
mypy app tests

# Frontend unit tests & production build
cd ../frontend
npm test
npm run typecheck
npm run build

# Playwright browser end-to-end tests
npm run e2e
```

---

## Author & Attribution

- **Lead Engineer & Author**: `honoursbhaduria` ([honoursbhadauria@gmail.com](mailto:honoursbhadauria@gmail.com))
- **Data Source**: Contains BMRS data from Elexon, used under the [BMRS Data Licence](https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/).
- **License**: Released under the [MIT License](LICENSE).
