# Submission checklist and demo script

## Create the public repository (random, non-descriptive name)

```bash
cd windlens
git add -A && git commit -m "GB Wind Forecast Intelligence"
# Create an EMPTY public repo named e.g. "qx7-larch-41" on github.com (no README), then:
git remote add origin git@github.com:<you>/qx7-larch-41.git
git branch -M main
git push -u origin main
```

Before pushing, confirm no secrets are tracked: `git ls-files | grep -E '\.env$'` should print
nothing.

## Checklist

- [ ] Public repository created with a random name and pushed. Check it opens logged out or in
      an incognito window.
- [ ] GitHub Actions CI green: backend, frontend, e2e and docker jobs.
- [ ] Deployed on Vercel (README §18). `/api/health` OK. Default January analysis loads.
- [ ] Deployed site opened in an **incognito** window: Overview KPIs, chart, vintages and CSV all
      work.
- [ ] README links filled in for the deployed app, the repository and the video, and checked to
      open.
- [ ] `docker compose up --build` works on a clean machine; the frontend at :8080 loads.
- [ ] Tests pass locally:
  - `cd backend && pytest`
  - `cd frontend && npm test && npx playwright test`
- [ ] Demo video (≤ 10 min) uploaded as **Unlisted** on YouTube, link checked while logged out.
- [ ] AI-assistance disclosure present (README).

## Demo script (≤ 10 minutes)

### Part 1 — Customer presentation (≤ 5 min)

1. **Problem (0:00–0:45).** "When the purchasing team buys day-ahead, wind output is uncertain.
   This tool asks: how good was the wind forecast the team could actually see at decision time?"
2. **Overview (0:45–2:00).**
   - Default view: decisions during January 2026, cutoff 24 h before each delivery hour, so
     deliveries run from 2 Jan to 1 Feb.
   - Walk the KPI screen:
     - mean forecast vs mean actual;
     - MAE and RMSE as the typical miss in MW;
     - WAPE as total miss relative to total wind;
     - bias: positive means forecasts ran high;
     - coverage.
   - Point out the retrieval timestamp and the source attribution.
3. **Forecast vs actual (2:00–3:00).**
   - Show the two lines and zoom into a high-error day.
   - Toggle the signed-error chart and point out the runs of over-forecasting.
4. **Vintage explorer (3:00–4:00).**
   - Click a point on the chart.
   - Explain the cutoff line and that only the orange (eligible) vintages could be used.
   - The ringed one is the latest of those and is the one scored.
   - Later vintages (hollow) are excluded even when closer to the actual: this avoids hindsight.
5. **Value (4:00–5:00).**
   - Change the lead time to 6 h and apply; accuracy improves with a shorter horizon.
   - Records page: search, filter missing intervals, export CSV for independent review.
   - Scope: accuracy only. No price or cost claims.

### Part 2 — Technical review (≤ 5 min)

1. **Architecture (0:00–1:00).** React + TanStack Query front end, FastAPI back end; all analytics
   in Python; same-origin `/api`.
2. **Elexon integration (1:00–2:00).**
   - Public stream endpoints, no key.
   - Requests are split into 7-day aligned chunks, with a TTL cache.
   - Bounded retries with backoff that honour `Retry-After`.
   - Stale fallback, clearly labelled; errors are surfaced, never replaced.
3. **Timestamps and selection (2:00–3:00).**
   - UTC normalisation and London display with GMT/BST.
   - `cutoff = T − lead` and the latest `publishTime ≤ cutoff`.
   - Hourly WINDFOR vs half-hourly FUELHH alignment, and the duplicate policy.
4. **Metrics (3:00–3:30).** MAE, RMSE, bias and WAPE on matched intervals only; null rather than
   divide-by-zero.
5. **Testing (3:30–4:30).**
   - Hand-calculated fixtures, including a "perfect but late" forecast that is excluded.
   - Upstream failure tests: 429, 5xx, timeout, malformed data.
   - Vitest component tests.
   - Playwright E2E against a deterministic mock Elexon server.
   - CI workflow.
6. **Docker and deployment (4:30–5:00).** `docker compose up --build`; Vercel single project
   (static build + Python function).
