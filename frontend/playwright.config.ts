import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs the real backend and a production frontend build against a deterministic,
 * test-only mock of the Elexon API (backend/tests/fixtures/mock_elexon_server.py).
 * Live Elexon data is never used here, so results are reproducible.
 */
const PY = process.env.E2E_PYTHON ?? "../backend/.venv/bin/python";
const MOCK_PORT = 8099;
const API_PORT = 8001;
const WEB_PORT = 4174;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    {
      command: `${PY} -m tests.fixtures.mock_elexon_server --port ${MOCK_PORT}`,
      cwd: "../backend",
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      reuseExistingServer: false,
    },
    {
      command: `${PY} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        ELEXON_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/bmrs/api/v1`,
        CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
        LOG_LEVEL: "WARNING",
      },
      reuseExistingServer: false,
    },
    {
      command: `npx vite build && npx vite preview --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { VITE_DEV_API_PROXY: `http://127.0.0.1:${API_PORT}` },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
