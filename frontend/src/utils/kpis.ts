import type { Analysis } from "../types/api";
import { fmtMw, fmtNum, fmtPct, fmtSignedMw, fmtSignedPct } from "./format";

export interface Kpi {
  id: string;
  label: string;
  scope: string;
  value: string;
  unit?: string;
  sub: string;
}

function biasWords(bias: number | null): string {
  if (bias === null) return "Undefined: no matched intervals";
  if (bias > 0) return "Over-forecast on average (forecast above actual)";
  if (bias < 0) return "Under-forecast on average (forecast below actual)";
  return "No net bias";
}

export function buildKpis(a: Analysis): Kpi[] {
  const m = a.metrics;
  const c = a.coverage;
  const split = (s: string) => {
    const [value, unit] = s.split(" ");
    return { value: value ?? s, unit };
  };
  return [
    {
      id: "forecast",
      label: "Forecast generation",
      scope: "Mean per matched interval",
      ...split(fmtMw(m.mean_forecast_mw)),
      sub:
        m.min_forecast_mw === null
          ? "No matched intervals"
          : `Range ${fmtNum(m.min_forecast_mw)}–${fmtMw(m.max_forecast_mw)}`,
    },
    {
      id: "actual",
      label: "Actual generation",
      scope: "Mean per matched interval",
      ...split(fmtMw(m.mean_actual_mw)),
      sub:
        m.min_actual_mw === null
          ? "No matched intervals"
          : `Range ${fmtNum(m.min_actual_mw)}–${fmtMw(m.max_actual_mw)}`,
    },
    {
      id: "mae",
      label: "MAE",
      scope: "Range metric",
      ...split(fmtMw(m.mae_mw)),
      sub: "Mean absolute error per interval",
    },
    {
      id: "rmse",
      label: "RMSE",
      scope: "Range metric",
      ...split(fmtMw(m.rmse_mw)),
      sub: "Penalises large misses",
    },
    {
      id: "wape",
      label: "WAPE",
      scope: "Range metric",
      value: fmtPct(m.wape_pct),
      sub: m.wape_pct === null ? "Undefined: total actual is zero or no matches" : "Σ|error| ÷ Σ actual",
    },
    {
      id: "bias",
      label: "Mean bias",
      scope: "Range metric",
      ...split(fmtSignedMw(m.bias_mw)),
      sub: `${biasWords(m.bias_mw)}${m.bias_pct !== null ? ` · ${fmtSignedPct(m.bias_pct)} of actual` : ""}`,
    },
    {
      id: "coverage",
      label: "Matched coverage",
      scope: "Share of evaluated intervals",
      value: fmtPct(c.coverage_pct),
      sub: `${c.matched_intervals.toLocaleString("en-GB")} of ${c.evaluation_intervals.toLocaleString("en-GB")} hourly intervals`,
    },
  ];
}
