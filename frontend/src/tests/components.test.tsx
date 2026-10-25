import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeriesTooltip } from "../components/charts/ForecastActualChart";
import { FilterPanel } from "../components/filters/FilterPanel";
import { KpiDisplay } from "../components/kpis/KpiDisplay";
import { DEFAULT_FILTERS } from "../types/filters";
import { toSeriesPoints } from "../utils/series";
import { analysisFixture, metadataFixture, nullMetricsFixture, vintagesFixture } from "./fixtures";
import { locationSpy, mockFetch, renderApp } from "./render";

afterEach(() => vi.unstubAllGlobals());

function routeApi(overrides: Partial<Record<string, () => { status?: number; body: unknown }>> = {}) {
  return mockFetch((url) => {
    const key = url.pathname.replace("/api", "");
    const o = overrides[key];
    if (o) return o();
    if (key === "/analysis") return { body: analysisFixture };
    if (key === "/forecast-vintages") return { body: vintagesFixture };
    if (key === "/metadata") return { body: metadataFixture };
    return { status: 404, body: { error: { code: "nf", message: "nf" } } };
  });
}

describe("FilterPanel", () => {
  it("applies an edited lead time and date range as one filter set", async () => {
    const onApply = vi.fn();
    render(<FilterPanel filters={DEFAULT_FILTERS} onApply={onApply} onReset={vi.fn()} />);
    const user = userEvent.setup();
    const lead = screen.getByLabelText(/decision lead time/i);
    await user.clear(lead);
    await user.type(lead, "12");
    fireEvent.change(screen.getByLabelText("Decision to"), { target: { value: "2026-01-15" } });
    expect(screen.getByText(/changes pending/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, leadHours: 12, decisionTo: "2026-01-15" });
  });

  it("uses lead presets", async () => {
    const onApply = vi.fn();
    render(<FilterPanel filters={DEFAULT_FILTERS} onApply={onApply} onReset={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "48h" }));
    await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, leadHours: 48 });
  });

  it("blocks invalid input with an inline error", async () => {
    const onApply = vi.fn();
    render(<FilterPanel filters={DEFAULT_FILTERS} onApply={onApply} onReset={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Decision to"), { target: { value: "2025-12-01" } });
    await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/on or after/);
  });

  it("reset calls onReset", async () => {
    const onReset = vi.fn();
    render(
      <FilterPanel filters={{ ...DEFAULT_FILTERS, leadHours: 6 }} onApply={vi.fn()} onReset={onReset} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe("KpiDisplay", () => {
  it("shows backend values with scope labels", () => {
    render(<KpiDisplay data={analysisFixture} />);
    expect(screen.getByTestId("kpi-mae")).toHaveTextContent("275");
    expect(screen.getByTestId("kpi-wape")).toHaveTextContent("20.4%");
    expect(screen.getByTestId("kpi-coverage")).toHaveTextContent("2 of 4 hourly intervals");
    expect(screen.getByTestId("kpi-bias")).toHaveTextContent("+225");
  });

  it("renders null metrics as undefined rather than zero", () => {
    render(<KpiDisplay data={nullMetricsFixture} />);
    expect(screen.getByTestId("kpi-mae")).toHaveTextContent("—");
    expect(screen.getByTestId("kpi-mae")).not.toHaveTextContent("0 MW");
    expect(screen.getByTestId("kpi-wape")).toHaveTextContent(/Undefined/);
  });
});

describe("chart tooltip", () => {
  it("shows the interval's London time, MW values and error", () => {
    const [point] = toSeriesPoints(analysisFixture.intervals);
    render(<SeriesTooltip point={point} />);
    const tip = screen.getByTestId("chart-tooltip");
    expect(tip).toHaveTextContent("01 Feb 2026");
    expect(tip).toHaveTextContent("1,150 MW");
    expect(tip).toHaveTextContent("1,200 MW");
    expect(tip).toHaveTextContent("−50 MW");
  });

  it("keeps missing values as null so charts show gaps", () => {
    const pts = toSeriesPoints(analysisFixture.intervals);
    expect(pts[2]?.forecast).toBeNull();
    expect(pts[3]?.actual).toBeNull();
  });
});

describe("pages with controlled API responses", () => {
  it("shows a loading state, then KPIs from the backend", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(async (url) => {
      if (url.pathname.endsWith("/analysis")) await gate;
      return { body: analysisFixture };
    });
    renderApp("/");
    expect(screen.getByText(/loading analysis/i)).toBeInTheDocument();
    release();
    expect(await screen.findByTestId("kpi-display")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-mae")).toHaveTextContent("275");
  });

  it("changing the lead time sends a new analysis request", async () => {
    const calls = routeApi();
    renderApp("/");
    await screen.findByTestId("kpi-display");
    const lead = screen.getByLabelText(/decision lead time/i);
    fireEvent.change(lead, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    await waitFor(() =>
      expect(
        calls.some(
          (u) => u.pathname === "/api/analysis" && u.searchParams.get("decision_lead_hours") === "6",
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(locationSpy.search).toContain("lead=6"));
  });

  it("shows a usable error state with retry when the API fails", async () => {
    routeApi({
      "/analysis": () => ({
        status: 503,
        body: { error: { code: "upstream_connection", message: "Could not connect to Elexon" } },
      }),
    });
    renderApp("/");
    const err = await screen.findByTestId("error-state");
    expect(err).toHaveTextContent("Elexon data is unavailable");
    expect(err).toHaveTextContent("Could not connect to Elexon");
    expect(within(err).getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-display")).not.toBeInTheDocument();
  });

  it("shows an empty state when no intervals fall in the window", async () => {
    routeApi({
      "/analysis": () => ({
        body: {
          ...analysisFixture,
          intervals: [],
          coverage: { ...analysisFixture.coverage, evaluation_intervals: 0 },
        },
      }),
    });
    renderApp("/");
    expect(await screen.findByTestId("empty-state")).toHaveTextContent(/no delivery intervals/i);
  });

  it("renders the forecast/actual chart from the response", async () => {
    routeApi();
    const { container } = renderApp("/forecast-vs-actual");
    await screen.findByTestId("forecast-actual-chart");
    await waitFor(() => expect(container.querySelectorAll(".recharts-line").length).toBe(2));
  });

  it("vintage explorer marks the selected eligible publication", async () => {
    routeApi();
    renderApp("/vintages?t=2026-02-01T00:00:00Z");
    expect(await screen.findByTestId("selected-forecast")).toHaveTextContent("1,150 MW");
    const rows = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-eligible"));
    expect(rows.map((r) => r.getAttribute("data-selected"))).toEqual(["false", "true", "false"]);
    expect(rows[2]).toHaveTextContent(/published after cutoff/i);
  });

  it("records table filters, sorts and exposes the CSV export for the same filters", async () => {
    routeApi();
    renderApp("/records?lead=12");
    await screen.findByRole("table", { name: "Interval records" });
    expect(screen.getByTestId("row-count")).toHaveTextContent("4 of 4");
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "matched" } });
    expect(screen.getByTestId("row-count")).toHaveTextContent("2 of 4");
    fireEvent.click(screen.getByRole("button", { name: /\|error\| mw/i }));
    const header = screen.getByRole("columnheader", { name: /\|error\| mw/i });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    const link = screen.getByTestId("csv-export");
    expect(link).toHaveAttribute("download");
    expect(link.getAttribute("href")).toContain("decision_lead_hours=12");
    expect(link.getAttribute("href")).toMatch(/^\/api\/export\.csv\?/);
  });

  it("displays missing observations honestly in the records table", async () => {
    routeApi();
    renderApp("/records");
    const table = await screen.findByRole("table", { name: "Interval records" });
    expect(within(table).getByText("No eligible forecast")).toBeInTheDocument();
    expect(within(table).getByText("No actual")).toBeInTheDocument();
  });
});
