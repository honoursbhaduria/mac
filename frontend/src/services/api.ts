import type { z } from "zod";
import {
  analysisSchema,
  errorBodySchema,
  metadataSchema,
  vintagesSchema,
  type Analysis,
  type Metadata,
  type Vintages,
} from "../types/api";
import type { Filters } from "../types/filters";

/** Empty means same-origin `/api` (dev proxy, nginx, or a single-platform deployment). */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { field: string; message: string }[];

  constructor(status: number, code: string, message: string, details?: { field: string; message: string }[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function analysisQuery(f: Filters): URLSearchParams {
  const p = new URLSearchParams({
    decision_from: f.decisionFrom,
    decision_to: f.decisionTo,
    decision_lead_hours: String(f.leadHours),
    actual_alignment: f.alignment,
  });
  if (f.deliveryFrom && f.deliveryTo) {
    p.set("delivery_from", f.deliveryFrom);
    p.set("delivery_to", f.deliveryTo);
  }
  return p;
}

export function apiUrl(path: string, params?: URLSearchParams): string {
  const qs = params && [...params.keys()].length ? `?${params.toString()}` : "";
  return `${API_BASE}/api${path}${qs}`;
}

async function getJson<S extends z.ZodType>(
  path: string,
  schema: S,
  params?: URLSearchParams,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path, params), { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "network_error",
      "Could not reach the analysis API. Check your connection and retry.",
    );
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(
      res.status,
      "bad_response",
      `The API returned an unreadable response (HTTP ${res.status}).`,
    );
  }
  if (!res.ok) {
    const parsed = errorBodySchema.safeParse(body);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiError(res.status, e.code, e.message, e.details);
    }
    throw new ApiError(res.status, "http_error", `The API request failed (HTTP ${res.status}).`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(res.status, "schema_mismatch", "The API response did not match the expected format.");
  }
  return parsed.data;
}

export const api = {
  analysis: (f: Filters, signal?: AbortSignal): Promise<Analysis> =>
    getJson("/analysis", analysisSchema, analysisQuery(f), signal),
  vintages: (
    startTime: string,
    leadHours: number,
    alignment: Filters["alignment"],
    signal?: AbortSignal,
  ): Promise<Vintages> =>
    getJson(
      "/forecast-vintages",
      vintagesSchema,
      new URLSearchParams({
        start_time: startTime,
        decision_lead_hours: String(leadHours),
        actual_alignment: alignment,
      }),
      signal,
    ),
  metadata: (signal?: AbortSignal): Promise<Metadata> =>
    getJson("/metadata", metadataSchema, undefined, signal),
};
