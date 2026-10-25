import { analysisQuery, ApiError, api } from "../services/api";
import { exportCsvUrl } from "../services/export";
import { DEFAULT_FILTERS, filtersFromParams, filtersToParams, validateFilters } from "../types/filters";
import {
  fmtLondon,
  fmtMw,
  fmtPct,
  fmtSignedMw,
  londonHourToUtcIso,
  utcIsoToLondonParts,
} from "../utils/format";
import { buildKpis } from "../utils/kpis";
import { filterAndSort } from "../utils/records";
import { analysisFixture, nullMetricsFixture } from "./fixtures";
import { mockFetch } from "./render";

describe("filter state", () => {
  it("defaults to January 2026 decisions with a 24 h lead", () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS).toMatchObject({
      decisionFrom: "2026-01-01",
      decisionTo: "2026-01-31",
      leadHours: 24,
    });
  });

  it("round-trips through URL params", () => {
    const f = {
      ...DEFAULT_FILTERS,
      leadHours: 6.5,
      deliveryFrom: "2026-01-10",
      deliveryTo: "2026-01-12",
      alignment: "hourly_mean" as const,
    };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
  });

  it("keeps unrelated params such as the selected vintage", () => {
    const p = filtersToParams(DEFAULT_FILTERS, new URLSearchParams("t=2026-01-15T12:00:00Z"));
    expect(p.get("t")).toBe("2026-01-15T12:00:00Z");
  });

  it("validates ranges and lead time", () => {
    expect(validateFilters(DEFAULT_FILTERS)).toEqual({});
    expect(validateFilters({ ...DEFAULT_FILTERS, decisionTo: "2025-12-01" }).decisionTo).toMatch(
      /on or after/,
    );
    expect(validateFilters({ ...DEFAULT_FILTERS, decisionTo: "2026-06-30" }).decisionTo).toMatch(/93 days/);
    expect(validateFilters({ ...DEFAULT_FILTERS, leadHours: -1 }).leadHours).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, leadHours: 97 }).leadHours).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, leadHours: 1.2 }).leadHours).toMatch(/0\.5/);
    expect(validateFilters({ ...DEFAULT_FILTERS, deliveryFrom: "2026-01-02" }).deliveryTo).toMatch(/both/);
  });
});

describe("api service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps filters to backend query parameters, including lead time", () => {
    const q = analysisQuery({ ...DEFAULT_FILTERS, leadHours: 12 });
    expect(Object.fromEntries(q)).toEqual({
      decision_from: "2026-01-01",
      decision_to: "2026-01-31",
      decision_lead_hours: "12",
      actual_alignment: "exact",
    });
    expect(exportCsvUrl({ ...DEFAULT_FILTERS, deliveryFrom: "2026-01-05", deliveryTo: "2026-01-06" })).toBe(
      "/api/export.csv?decision_from=2026-01-01&decision_to=2026-01-31&decision_lead_hours=24&actual_alignment=exact&delivery_from=2026-01-05&delivery_to=2026-01-06",
    );
  });

  it("parses structured server errors", async () => {
    mockFetch(() => ({
      status: 503,
      body: { error: { code: "upstream_rate_limited", message: "Elexon rate limit" } },
    }));
    const err = await api.analysis(DEFAULT_FILTERS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 503, code: "upstream_rate_limited", message: "Elexon rate limit" });
  });

  it("rejects responses that do not match the schema", async () => {
    mockFetch(() => ({ body: { metrics: "nope" } }));
    await expect(api.analysis(DEFAULT_FILTERS)).rejects.toMatchObject({ code: "schema_mismatch" });
  });

  it("validates a well-formed response", async () => {
    mockFetch(() => ({ body: analysisFixture }));
    await expect(api.analysis(DEFAULT_FILTERS)).resolves.toMatchObject({ metrics: { mae_mw: 275 } });
  });
});

describe("formatting", () => {
  it("shows null metrics as a dash, never zero", () => {
    expect(fmtMw(null)).toBe("—");
    expect(fmtPct(null)).toBe("—");
    expect(fmtSignedMw(-50)).toBe("−50 MW");
    expect(fmtSignedMw(500)).toBe("+500 MW");
  });

  it("presents London time with GMT/BST across the DST change", () => {
    expect(fmtLondon("2026-01-15T12:00:00Z")).toMatch(/15 Jan 2026.*12:00 GMT/);
    expect(fmtLondon("2026-07-15T12:00:00Z")).toMatch(/15 Jul 2026.*13:00 BST/);
    expect(fmtLondon("2026-03-29T01:00:00Z")).toMatch(/02:00 BST/);
  });

  it("converts a London wall-clock hour to UTC", () => {
    expect(londonHourToUtcIso("2026-01-15", 12)).toBe("2026-01-15T12:00:00Z");
    expect(londonHourToUtcIso("2026-07-15", 12)).toBe("2026-07-15T11:00:00Z");
    expect(utcIsoToLondonParts("2026-07-15T23:00:00Z")).toEqual({ date: "2026-07-16", hour: 0 });
  });
});

describe("KPI mapping", () => {
  it("labels scopes and handles undefined metrics", () => {
    const k = Object.fromEntries(buildKpis(analysisFixture).map((x) => [x.id, x]));
    expect(k.mae).toMatchObject({ value: "275", unit: "MW", scope: "Range metric" });
    expect(k.forecast?.scope).toBe("Mean per matched interval");
    expect(k.bias?.sub).toMatch(/Over-forecast/);
    const n = Object.fromEntries(buildKpis(nullMetricsFixture).map((x) => [x.id, x]));
    expect(n.wape).toMatchObject({ value: "—" });
    expect(n.wape?.sub).toMatch(/Undefined/);
    expect(n.bias?.sub).toMatch(/Undefined/);
  });
});

describe("records table logic", () => {
  const base = { query: "", status: "all" as const, sortKey: "start_time" as const, sortDir: "asc" as const };
  const rows = analysisFixture.intervals;

  it("filters by status", () => {
    expect(filterAndSort(rows, { ...base, status: "matched" })).toHaveLength(2);
    expect(filterAndSort(rows, { ...base, status: "unmatched" }).map((r) => r.status)).toEqual([
      "missing_forecast",
      "missing_actual",
    ]);
  });

  it("searches labels and flags", () => {
    expect(filterAndSort(rows, { ...base, query: "no eligible" })).toHaveLength(1);
    expect(filterAndSort(rows, { ...base, query: "02:00" })[0]?.start_time).toBe("2026-02-01T02:00:00Z");
  });

  it("sorts numerically with nulls last in both directions", () => {
    const desc = filterAndSort(rows, { ...base, sortKey: "abs_error_mw", sortDir: "desc" });
    expect(desc.map((r) => r.abs_error_mw)).toEqual([500, 50, null, null]);
    const asc = filterAndSort(rows, { ...base, sortKey: "abs_error_mw", sortDir: "asc" });
    expect(asc.map((r) => r.abs_error_mw)).toEqual([50, 500, null, null]);
  });
});
