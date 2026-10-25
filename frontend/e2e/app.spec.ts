import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("dashboard loads KPIs from the backend", async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("GB Wind Forecast Intelligence");
  const kpis = page.getByTestId("kpi-display");
  await expect(kpis).toBeVisible();
  await expect(page.getByTestId("kpi-mae")).toContainText("MW");
  await expect(page.getByTestId("kpi-mae")).not.toContainText("—");
  await expect(page.getByTestId("status-strip")).toContainText("Data retrieved");
  expect(errors).toEqual([]);
});

test("applying a date filter updates the URL and the analysis request", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("kpi-display")).toBeVisible();
  const req = page.waitForRequest(
    (r) => r.url().includes("/api/analysis") && r.url().includes("decision_to=2026-01-10"),
  );
  await page.getByLabel("Decision to").fill("2026-01-10");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await req;
  await expect(page).toHaveURL(/to=2026-01-10/);
  await expect(page.getByTestId("kpi-coverage")).toContainText("of 240 hourly intervals");
});

test("changing the lead time updates the analysis request", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("kpi-display")).toBeVisible();
  const req = page.waitForRequest(
    (r) => r.url().includes("/api/analysis") && r.url().includes("decision_lead_hours=6"),
  );
  await page.getByRole("button", { name: "6h" }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await req;
  await expect(page).toHaveURL(/lead=6/);
  await expect(page.getByLabel("Decision policy")).toContainText("delivery_start − 6 h");
});

test("forecast and actual charts render from backend data", async ({ page }) => {
  await page.goto("/forecast-vs-actual");
  const chart = page.getByTestId("forecast-actual-chart");
  await expect(chart.locator(".recharts-line")).toHaveCount(2);
  await expect(chart.locator(".recharts-line path").first()).toHaveAttribute("d", /M/);
  await expect(page.getByTestId("error-chart").locator(".recharts-bar-rectangle").first()).toBeVisible();
  await page.goto("/accuracy");
  await expect(page.getByTestId("histogram-chart").locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(page.getByTestId("bias-explainer")).toContainText("higher");
});

test("vintage explorer shows the selected eligible forecast", async ({ page }) => {
  await page.goto("/vintages?t=2026-01-15T12:00:00Z");
  const selected = page.locator('tr[data-selected="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute("data-eligible", "true");
  await expect(selected).toContainText("Selected");
  // Cutoff 14 Jan 12:00; publications are at hh:30, so the latest eligible is 14 Jan 10:30.
  await expect(selected).toContainText("14 Jan 2026, 10:30 GMT");
  await expect(page.locator('tr[data-eligible="false"]').first()).toContainText("published after cutoff");
  await expect(page.getByTestId("vintage-chart").locator("svg").first()).toBeVisible();
});

test("missing observations are displayed honestly", async ({ page }) => {
  await page.goto("/records?from=2026-01-19&to=2026-01-23");
  await expect(page.getByRole("table", { name: "Interval records" })).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("unmatched");
  const rows = page.locator("tbody tr[data-status]");
  // The mock omits FUELHH actuals for 20 Jan 10:00-13:30Z: four hourly intervals decided on 19 Jan.
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('tr[data-status="missing_actual"]')).toHaveCount(4);
  await expect(page.locator('tr[data-status="missing_actual"]').first()).toContainText(
    "FUELHH actual missing",
  );
  await page.goto("/?from=2026-01-19&to=2026-01-23");
  await expect(page.getByTestId("kpi-coverage")).not.toContainText("100.0%");
});

test("CSV export downloads the same filtered dataset", async ({ page, request }) => {
  await page.goto("/records?from=2026-01-10&to=2026-01-11&lead=12");
  await expect(page.getByRole("table", { name: "Interval records" })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("csv-export").click(),
  ]);
  expect(download.suggestedFilename()).toBe("wind-forecast-2026-01-10_2026-01-11-lead12h-exact.csv");
  const text = await readFile(await download.path(), "utf8");
  const lines = text.trim().split("\n");
  expect(lines[0]).toContain("delivery_start_utc,delivery_start_london,decision_cutoff_utc");
  expect(lines.length - 1).toBe(48);
  const api = await request.get(
    "/api/analysis?decision_from=2026-01-10&decision_to=2026-01-11&decision_lead_hours=12",
  );
  const body = await api.json();
  expect(lines[1]).toContain(body.intervals[0].start_time);
  expect(lines.slice(1).every((l) => l.includes(",12.0,exact,"))).toBe(true);
});

test("an API failure produces a usable error state", async ({ page }) => {
  await page.route("**/api/analysis**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "upstream_connection", message: "Could not connect to Elexon (ConnectError)" },
      }),
    }),
  );
  await page.goto("/");
  const err = page.getByTestId("error-state");
  await expect(err).toBeVisible();
  await expect(err).toContainText("Elexon data is unavailable");
  await expect(page.getByTestId("kpi-display")).toHaveCount(0);
  await page.unroute("**/api/analysis**");
  await err.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("kpi-display")).toBeVisible();
});

test("main workflow has no uncaught console errors", async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto("/");
  await expect(page.getByTestId("kpi-display")).toBeVisible();
  for (const name of ["Forecast vs actual", "Accuracy", "Vintages", "Records"]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  await page.getByRole("link", { name: /02 Jan 2026, 00:00/ }).click();
  await expect(page.getByTestId("selected-forecast")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile layout has no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("kpi-display")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("windy assistant opens and displays intelligence interface", async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto("/");
  const launcher = page.getByLabel("Open Windy");
  await expect(launcher).toBeVisible();

  // Click to open Windy
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Windy" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Windy");
  await expect(dialog.getByPlaceholder(/Ask Windy about/i)).toBeVisible();

  // Verify close
  await dialog.getByLabel("Close Windy drawer").click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});
