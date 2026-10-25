import { z } from "zod";

const num = z.number();
const nnum = z.number().nullable();

export const qualityWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  count: z.number(),
  severity: z.enum(["info", "warning", "error"]),
});

export const sourceInfoSchema = z.object({
  dataset: z.enum(["FUELHH", "WINDFOR"]),
  endpoint: z.string(),
  window: z.record(z.string(), z.string()),
  retrieved_at: z.string().nullable(),
  retrieved_at_london: z.string().nullable(),
  chunks: num,
  cached_chunks: num,
  stale: z.boolean(),
  duration_ms: num,
  records_received: num,
  records_rejected: num,
});

export const intervalStatusSchema = z.enum(["matched", "missing_forecast", "missing_actual", "missing_both"]);

export const intervalRecordSchema = z.object({
  start_time: z.string(),
  start_time_london: z.string(),
  decision_cutoff: z.string(),
  decision_cutoff_london: z.string(),
  forecast_publish_time: z.string().nullable(),
  forecast_publish_time_london: z.string().nullable(),
  forecast_horizon_hours: nnum,
  forecast_mw: nnum,
  actual_mw: nnum,
  error_mw: nnum,
  abs_error_mw: nnum,
  status: intervalStatusSchema,
  eligible_vintages: num,
  flags: z.array(z.string()),
});

export const metricsSchema = z.object({
  matched_intervals: num,
  mae_mw: nnum,
  rmse_mw: nnum,
  bias_mw: nnum,
  wape_pct: nnum,
  bias_pct: nnum,
  total_abs_error_mw: nnum,
  mean_forecast_mw: nnum,
  mean_actual_mw: nnum,
  min_actual_mw: nnum,
  max_actual_mw: nnum,
  min_forecast_mw: nnum,
  max_forecast_mw: nnum,
  notes: z.array(z.string()),
});

export const coverageSchema = z.object({
  evaluation_intervals: num,
  actual_records_available: num,
  intervals_with_actual: num,
  intervals_with_eligible_forecast: num,
  matched_intervals: num,
  missing_forecast: num,
  missing_actual: num,
  missing_both: num,
  coverage_pct: nnum,
});

export const analysisSchema = z.object({
  query: z.object({
    decision_from: z.string(),
    decision_to: z.string(),
    decision_window_utc: z.tuple([z.string(), z.string()]),
    delivery_from: z.string().nullable(),
    delivery_to: z.string().nullable(),
    delivery_window_utc: z.tuple([z.string(), z.string()]).nullable(),
    first_interval: z.string().nullable(),
    last_interval: z.string().nullable(),
    decision_lead_hours: num,
    actual_alignment: z.enum(["exact", "hourly_mean"]),
  }),
  assumptions: z.array(z.string()),
  metrics: metricsSchema,
  coverage: coverageSchema,
  intervals: z.array(intervalRecordSchema),
  daily: z.array(
    z.object({
      date: z.string(),
      intervals: num,
      matched: num,
      mae_mw: nnum,
      rmse_mw: nnum,
      bias_mw: nnum,
      wape_pct: nnum,
      mean_forecast_mw: nnum,
      mean_actual_mw: nnum,
    }),
  ),
  hourly_profile: z.array(z.object({ hour_london: num, matched: num, mae_mw: nnum, bias_mw: nnum })),
  error_histogram: z.array(z.object({ lower_mw: num, upper_mw: num, count: num })),
  data_quality: z.array(qualityWarningSchema),
  sources: z.array(sourceInfoSchema),
  stale: z.boolean(),
  generated_at: z.string(),
  attribution: z.string(),
});

export const vintageSchema = z.object({
  publish_time: z.string(),
  publish_time_london: z.string(),
  forecast_mw: num,
  horizon_hours: num,
  eligible: z.boolean(),
  selected: z.boolean(),
  error_mw: nnum,
});

export const vintagesSchema = z.object({
  start_time: z.string(),
  start_time_london: z.string(),
  decision_cutoff: z.string(),
  decision_cutoff_london: z.string(),
  decision_lead_hours: nnum,
  actual_alignment: z.string(),
  actual_mw: nnum,
  selected: vintageSchema.nullable(),
  vintages: z.array(vintageSchema),
  publish_window: z.record(z.string(), z.string()),
  data_quality: z.array(qualityWarningSchema),
  sources: z.array(sourceInfoSchema),
  stale: z.boolean(),
  attribution: z.string(),
});

export const metadataSchema = z.object({
  app: z.string(),
  version: z.string(),
  defaults: z.object({
    decision_from: z.string(),
    decision_to: z.string(),
    decision_lead_hours: num,
    actual_alignment: z.string(),
  }),
  limits: z.object({ max_date_range_days: num, max_decision_lead_hours: num, lead_hours_step: num }),
  decision_policy: z.string(),
  metrics: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      formula: z.string(),
      unit: z.string(),
      denominator: z.string(),
      interpretation: z.string(),
    }),
  ),
  sources: z.array(
    z.object({ dataset: z.string(), description: z.string(), endpoint: z.string(), docs: z.string() }),
  ),
  api_key_required: z.boolean(),
  attribution: z.string(),
});

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }),
});

export type QualityWarning = z.infer<typeof qualityWarningSchema>;
export type SourceInfo = z.infer<typeof sourceInfoSchema>;
export type IntervalRecord = z.infer<typeof intervalRecordSchema>;
export type IntervalStatus = z.infer<typeof intervalStatusSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type Coverage = z.infer<typeof coverageSchema>;
export type Vintage = z.infer<typeof vintageSchema>;
export type Vintages = z.infer<typeof vintagesSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
