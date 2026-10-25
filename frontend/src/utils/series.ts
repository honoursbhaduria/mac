import type { IntervalRecord } from "../types/api";

export interface SeriesPoint {
  t: number;
  iso: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  publish: string | null;
  cutoff: string;
  status: IntervalRecord["status"];
}

/** Reshape API intervals for plotting. Missing values stay null so the line shows a gap. */
export function toSeriesPoints(intervals: IntervalRecord[]): SeriesPoint[] {
  return intervals.map((r) => ({
    t: Date.parse(r.start_time),
    iso: r.start_time,
    forecast: r.forecast_mw,
    actual: r.actual_mw,
    error: r.error_mw,
    publish: r.forecast_publish_time,
    cutoff: r.decision_cutoff,
    status: r.status,
  }));
}
