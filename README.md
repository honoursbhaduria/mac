# GB Wind Forecast Intelligence & Windy Assistant

An end-to-end analytics platform and intelligent copilot built for UK energy utility trading desks to evaluate day-ahead wind power forecast accuracy at decision time, powered by **FastAPI**, **React 19**, **Elexon BMRS** open data, and the **Windy** conversational intelligence assistant built with **LangGraph** and **Groq**.

[![CI Quality Gate](https://github.com/honoursbhaduria/windy/actions/workflows/ci.yml/badge.svg)](https://github.com/honoursbhaduria/windy/actions)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agentic_Workflow-FF6F00)](https://langchain-ai.github.io/langgraph/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**GitHub Repository:** [https://github.com/honoursbhaduria/windy.git](https://github.com/honoursbhaduria/windy.git)  
**Live Docker Endpoint:** Frontend on `http://localhost:8080` | Backend API on `http://localhost:8000`

---

## Table of Contents

1. [Executive Summary & Business Context](#1-executive-summary--business-context)
2. [Key Platform Capabilities](#2-key-platform-capabilities)
3. [Verified January 2026 Accuracy Outturns](#3-verified-january-2026-accuracy-outturns)
4. [Decision-Cutoff & No-Hindsight-Bias Methodology](#4-decision-cutoff--no-hindsight-bias-methodology)
5. [Windy: LangGraph & Groq Decision Copilot](#5-windy-langgraph--groq-decision-copilot)
6. [System Architecture](#6-system-architecture)
7. [Mathematical KPI Formulations](#7-mathematical-kpi-formulations)
8. [Elexon BMRS Datasets & Ingestion Engine](#8-elexon-bmrs-datasets--ingestion-engine)
9. [Project Directory Structure](#9-project-directory-structure)
10. [Local Quickstart & Docker Setup](#10-local-quickstart--docker-setup)
11. [Configuration & Environment Variables](#11-configuration--environment-variables)
12. [API Reference](#12-api-reference)
13. [Testing & Quality Verification](#13-testing--quality-verification)
14. [Deployment Strategy](#14-deployment-strategy)
15. [Author & Attribution](#15-author--attribution)

---

## 1. Executive Summary & Business Context

In the UK wholesale electricity market (governed by the Balancing and Settlement Code / Elexon), commercial energy utilities must buy power ahead of delivery to reliably supply consumer demand. Wholesale purchasing decisions in the **day-ahead auction** must be finalized 24 hours prior to delivery. 

Because wind generation is weather-dependent and volatile, power traders face substantial imbalance risks:
- **Over-forecasting wind (being "long")**: Procuring too little thermal or market generation, forcing the utility to buy expensive imbalance volume from the Balancing Mechanism during wind shortfalls.
- **Under-forecasting wind (being "short")**: Procuring excess thermal volume, incurring unnecessary procurement expense and "spilling" wind power at distressed cashout prices.

### The Problem This Software Solves
Off-the-shelf dashboards frequently commit **hindsight bias** by benchmarking actual outturn against the newest forecast published *today*. In reality, an energy trader on 14 January making decisions for 15 January only had access to forecasts published **on or before the decision cutoff** (e.g., 24 hours ahead).

**GB Wind Forecast Intelligence** solves this problem by:
1. Reconstructing the exact forecast state available at the historical moment of purchase for every half-hour interval.
2. Quantifying systemic bias, spread, and volumetric risk (MAE, RMSE, WAPE, Mean Bias).
3. Providing an embedded conversational agent (**Windy**) that parses outturns, pinpoints extreme error days, and explains statistical metrics interactively.

---

## 2. Key Platform Capabilities

| View / Feature | Functionality & Value Delivered |
| :--- | :--- |
| **Overview Dashboard** | Real-time calculation of MAE, RMSE, WAPE, Mean Bias, and Total Volume across the selected decision window. Displays data quality flags, observation counts, and cache freshness indicators. |
| **Forecast vs Actual** | High-density hourly interactive time series (Recharts) with synchronized brush zoom, signed error bands, point-in-time tooltips, and click-through to vintage inspection. |
| **Accuracy Deep-Dive** | Diurnal hourly error profiles (identifying time-of-day forecasting vulnerabilities), daily MAE/Bias distributions, error histograms, and scatter plots comparing predicted vs. metered generation. |
| **Vintage Explorer** | Visual audit trail of every WINDFOR forecast published for a chosen delivery hour. Displays eligibility status against the cutoff timestamp, highlighting the chosen vintage. |
| **Records & CSV Parity** | Granular, sortable, paginated audit table for all evaluated intervals. Features a one-click server-side CSV export strictly preserving active URL filters. |
| **Windy Assistant** | Full-stack conversational copilot powered by LangGraph and Groq. Allows natural-language exploration of outturn data with zero hallucination. |

---

## 3. Verified January 2026 Accuracy Outturns

Using official Elexon **WINDFOR** and **FUELHH** national datasets under standard day-ahead market conditions (**24-hour decision lead time**, `exact` half-hourly alignment, Europe/London decision dates 2026-01-01 to 2026-01-31):

| Metric | Measured Platform Value | Industry Interpretation |
| :--- | :--- | :--- |
| **Coverage** | **100.0%** (744 / 744 intervals) | Zero missing intervals across the full month. |
| **Mean Forecast** | **13,021.7 MW** | Average day-ahead expected wind generation. |
| **Mean Actual Outturn** | **11,285.5 MW** | Average metered actual wind generation. |
| **Mean Absolute Error (MAE)**| **1,932.2 MW** | Expected absolute magnitude of forecast error per hour. |
| **Root Mean Square Error (RMSE)**| **2,399.4 MW** | Heavily penalizes large volumetric misses for risk modeling. |
| **Mean Bias** | **+1,736.2 MW** (+15.4%) | **Systemic Over-forecast:** Forecaster predicted 15.4% more wind than arrived. |
| **Weighted Abs % Error (WAPE)**| **17.1%** | Total absolute error divided by total generated volume. |
| **Peak Over-forecast Miss** | **+7,419.0 MW** (2026-01-25 15:00 UTC) | Largest shortfall risk; wind dropped severely below forecast. |
| **Peak Under-forecast Miss** | **-5,612.0 MW** (2026-01-10 03:00 UTC) | Wind generated significantly exceeded forecast expectation. |

---

## 4. Decision-Cutoff & No-Hindsight-Bias Methodology

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

## 5. Windy: LangGraph & Groq Decision Copilot

**Windy** is an embedded conversational intelligence assistant designed specifically for energy analysts. Rather than acting as a generic LLM wrapper, Windy is engineered around a deterministic **LangGraph** state machine backed by **Groq** high-throughput inference (`openai/gpt-oss-120b` with automated fallback to `openai/gpt-oss-20b`).

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

### Key Engineering Features of Windy
- **Strict Ground Truth Verification**: The agent prompt strictly forbids illustrative, sample, or fabricated numbers. If data is queried, it is fetched directly from the backend analytical engine and cited verbatim.
- **Natural Language Temporal Parser**: Handles queries like *"What were the KPIs for January 2026?"* or *"Compare 48h lead time"* by translating natural language into ISO evaluation windows.
- **Context Pruning**: Enforces a rolling FIFO context window to ensure chat exchanges remain fast and never overload memory.
- **Dual-Mode Adaptive UI**:
  - **Desktop (Website View)**: Docks to the right side with **draggable drag-to-resize handle** (customizable between 280px and 900px, with 1/5th, Standard, and Wide presets). Operates without background blurring so the user can interact with the live dashboard side-by-side.
  - **Mobile View**: Converts automatically into an intuitive **modal popup card** with a dimmed backdrop and native sheet grabber.
  - **Visual Design**: Follows the platform's warm paper-and-ink aesthetic with clean typography and zero technical jargon.

---

## 6. System Architecture

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

## 7. Mathematical KPI Formulations

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

## 8. Elexon BMRS Datasets & Ingestion Engine

The application consumes two core Elexon Insights Solution streams:

1. **Actual Outturns (FUELHH)**:
   - Endpoint: `GET /datasets/FUELHH/stream?fuelType=WIND`
   - Fields: `startTime` (UTC), `settlementDate`, `settlementPeriod`, `generation` (MW), `fuelType`.
   - Resolution: 30 minutes (half-hourly settlement).
2. **Forecast Generation (WINDFOR)**:
   - Endpoint: `GET /datasets/WINDFOR/stream?publishDateTimeFrom=...&publishDateTimeTo=...`
   - Fields: `startTime` (Delivery UTC hour), `publishTime` (Publication timestamp), `generation` (MW).
   - Resolution: 1 hour (published ~8 times daily covering a rolling 72-hour horizon).

### Data Ingestion Robustness
- **Chunked Pagination**: Automatically splits multi-week date ranges into clean 7-day windows to prevent upstream gateway timeouts.
- **Deterministic Deduplication**: Deduplicates FUELHH records by `startTime` (retaining latest `publishTime`) and WINDFOR records by `(startTime, publishTime)`.
- **In-Memory TTL Caching**: Employs cache tiering: 15-minute TTL for active decision windows and 6-hour TTL for historical settled outturns.
- **Resilience**: Backoff retries with jitter handling HTTP 429 (`Retry-After`) and transient 5xx errors.

---

## 9. Project Directory Structure

```
├── .github/workflows/ci.yml       # GitHub Actions CI (lint, types, unit tests, e2e)
├── api/index.py                   # Vercel serverless gateway for FastAPI backend
├── backend/
│   ├── app/
│   │   ├── agent/                 # Windy LangGraph assistant implementation
│   │   │   ├── graph.py           # Compiled StateGraph workflow
│   │   │   ├── nodes.py           # Analysis, fetching, generation & pruning nodes
│   │   │   ├── prompts.py         # System instructions & anti-hallucination rules
│   │   │   └── state.py           # TypedDict schema for conversation state
│   │   ├── api/                   # FastAPI route endpoints
│   │   │   ├── actuals.py         # /api/actuals endpoints
│   │   │   ├── analysis.py        # /api/analysis & /api/export.csv
│   │   │   ├── forecasts.py       # /api/forecast-vintages
│   │   │   ├── health.py          # /api/health with upstream monitoring
│   │   │   └── windy.py           # /api/windy/chat & /api/windy/health
│   │   ├── schemas/               # Pydantic v2 validation models
│   │   ├── services/              # Domain logic & computation
│   │   │   ├── analysis_service.py # Core orchestration service
│   │   │   ├── elexon_client.py   # Resilient HTTPX client for BMRS API
│   │   │   ├── forecast_selection.py # Decision-time cutoff filtering
│   │   │   ├── matching.py        # Forecast-to-actual alignment
│   │   │   └── metrics.py         # Vectorized NumPy/Pandas KPI calculations
│   │   ├── utils/                 # Timezone, frame & logging helpers
│   │   ├── config.py              # Application settings & environment parsing
│   │   └── main.py                # FastAPI factory & CORS configuration
│   ├── tests/                     # 114 backend Pytest tests (unit, integration, live)
│   ├── Dockerfile                 # Multi-stage production container for Python
│   └── requirements.txt           # Production dependencies
├── frontend/
│   ├── e2e/                       # Playwright browser end-to-end tests
│   ├── src/
│   │   ├── app/                   # App shell, routing & React Query setup
│   │   ├── assets/                # Icons & static media (wind.png)
│   │   ├── components/
│   │   │   ├── charts/            # Recharts (TimeSeries, Diurnal, Histograms)
│   │   │   ├── filters/           # Lead time & decision date controls
│   │   │   ├── kpis/              # Metric display cards with math definitions
│   │   │   ├── layout/            # AppShell, Bay & page wrappers
│   │   │   ├── tables/            # Paginated interval audit table
│   │   │   └── windy/             # WindyWidget & MarkdownView components
│   │   ├── hooks/                 # Custom React query hooks
│   │   ├── pages/                 # Overview, Accuracy, Vintages, Records pages
│   │   ├── services/              # Typed fetch API clients
│   │   └── styles/                # Tailwind CSS v4 design tokens
│   ├── Dockerfile                 # Multi-stage build + Nginx alpine container
│   ├── nginx.conf.template        # Nginx reverse proxy configuration
│   └── package.json               # Node 22+ dependencies & scripts
├── docker-compose.yml             # Single-command local container stack
├── requirements.txt               # Root Python dependencies for Vercel
├── vercel.json                    # Vercel serverless deployment configuration
└── README.md                      # Comprehensive project documentation
```

---

## 10. Local Quickstart & Docker Setup

### Option A: One-Command Docker Compose (Recommended)

Run the full stack (backend, frontend, Nginx proxy) in isolated containers:

```bash
# 1. Clone the repository
git clone https://github.com/honoursbhaduria/windy.git
cd windy

# 2. Configure environment variables (optional; defaults work out of the box)
cp .env.example .env

# 3. Build and launch services
docker compose up --build -d
```

- **Frontend Portal**: Open [http://localhost:8080](http://localhost:8080)
- **Backend API Docs**: Open [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **Health Verification**: Open [http://localhost:8000/api/health](http://localhost:8000/api/health)

To stop the containers:
```bash
docker compose down
```

---

### Option B: Local Development (Without Docker)

#### Prerequisites
- **Python 3.12+** (Developed and verified on Python 3.13)
- **Node.js 20.19+** (Developed on Node 22)

#### 1. Start the Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements-dev.txt

# Launch FastAPI development server
uvicorn app.main:app --reload --port 8000
```

#### 2. Start the Frontend
In a new terminal:
```bash
cd frontend
npm install

# Start Vite dev server (proxies /api to localhost:8000)
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

---

## 11. Configuration & Environment Variables

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

## 12. API Reference

Interactive Swagger documentation is available at `/api/docs`.

### Primary Endpoints

#### 1. `GET /api/analysis`
Calculates decision-time accuracy metrics and time series for a specified decision and delivery window.
- **Parameters**:
  - `decision_from` (ISO date, e.g. `2026-01-01`): Start of decision cutoff range.
  - `decision_to` (ISO date, e.g. `2026-01-31`): End of decision cutoff range.
  - `decision_lead_hours` (float, default `24.0`): Hours before delivery for cutoff.
  - `actual_alignment` (`exact` or `hourly_mean`, default `exact`).
- **Response**: Summary metrics (MAE, RMSE, WAPE, Bias), hourly series, diurnal profiles, data warnings, and cache provenance.

#### 2. `GET /api/forecast-vintages`
Inspects all WINDFOR forecast publications for a single delivery hour.
- **Parameters**: `start_time` (ISO timestamp, e.g. `2026-01-15T12:00:00Z`), `decision_lead_hours` (default `24.0`).
- **Response**: List of chronological vintages with `is_eligible` and `is_selected` booleans.

#### 3. `GET /api/export.csv`
Streams an instant CSV containing every evaluated interval matching the exact active query filters.

#### 4. `POST /api/windy/chat`
Conversational intelligence endpoint executing the LangGraph assistant graph.
- **Request Body**:
  ```json
  {
    "message": "What was the highest error day in January 2026 and why?",
    "history": [],
    "filters": {
      "decision_from": "2026-01-01",
      "decision_to": "2026-01-31",
      "decision_lead_hours": 24.0,
      "actual_alignment": "exact"
    }
  }
  ```
- **Response**: Markdown answer, suggested follow-up chips, data citation metadata, and pruned history flag.

---

## 13. Testing & Quality Verification

The repository includes a comprehensive 3-tier testing suite verifying domain logic, HTTP boundaries, and end-to-end browser workflows:

```
Total Test Coverage:
├── Backend:  114 Passing Pytest Tests (Unit, Normalization, Integration, Pipeline)
├── Frontend:  34 Passing Vitest Tests (Components, Units, MarkdownView, Assistant)
└── E2E:       11 Passing Playwright Tests (Full user journeys, mobile zero-overflow)
```

### Running the Test Suites

```bash
# 1. Run backend unit & integration tests
cd backend
pytest --cov=app -v

# 2. Run backend code style & typecheck
ruff check app tests
mypy app tests

# 3. Run frontend unit tests
cd ../frontend
npm test

# 4. Run frontend typecheck & production build
npm run typecheck
npm run build

# 5. Run Playwright end-to-end browser tests
npm run e2e
```

---

## 14. Deployment Strategy

### Vercel Serverless (Ready)
The repository includes a root `vercel.json` and `api/index.py` allowing instant deployment to Vercel:
1. Connect the GitHub repository to Vercel.
2. Vercel automatically builds the React frontend via Vite into the edge CDN.
3. API requests under `/api/*` are rewritten to the Python serverless function at `api/index.py`.

### Containerized Production (Docker / Kubernetes / Cloud Run)
The provided `Dockerfile` files utilize multi-stage builds:
- `backend/Dockerfile`: Minimal non-root `appuser` image running Uvicorn.
- `frontend/Dockerfile`: Node alpine build step producing a static bundle served by an unprivileged Nginx alpine server.

---

## 15. Author & Attribution

- **Lead Engineer & Author**: `honoursbhaduria` ([honoursbhadauria@gmail.com](mailto:honoursbhadauria@gmail.com))
- **Data Source**: Contains BMRS data from Elexon, used under the [BMRS Data Licence](https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/).
- **License**: Released under the [MIT License](LICENSE).
