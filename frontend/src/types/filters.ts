import { z } from "zod";

export type Alignment = "exact" | "hourly_mean";

export interface Filters {
  decisionFrom: string; // YYYY-MM-DD, Europe/London calendar date
  decisionTo: string;
  leadHours: number;
  deliveryFrom: string | null;
  deliveryTo: string | null;
  alignment: Alignment;
}

/** Assignment defaults: purchasing decisions made during January 2026, 24 h lead. */
export const DEFAULT_FILTERS: Filters = {
  decisionFrom: "2026-01-01",
  decisionTo: "2026-01-31",
  leadHours: 24,
  deliveryFrom: null,
  deliveryTo: null,
  alignment: "exact",
};

export const MAX_RANGE_DAYS = 93;
export const MAX_LEAD_HOURS = 96;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

const daysBetween = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

export const filtersSchema = z
  .object({
    decisionFrom: isoDate,
    decisionTo: isoDate,
    leadHours: z
      .number({ error: "Lead time must be a number" })
      .min(0, "Lead time cannot be negative")
      .max(MAX_LEAD_HOURS, `Lead time may not exceed ${MAX_LEAD_HOURS} h`)
      .refine((v) => Number.isInteger(v * 2), "Lead time must be a multiple of 0.5 h"),
    deliveryFrom: isoDate.nullable(),
    deliveryTo: isoDate.nullable(),
    alignment: z.enum(["exact", "hourly_mean"]),
  })
  .superRefine((f, ctx) => {
    if (daysBetween(f.decisionFrom, f.decisionTo) < 0) {
      ctx.addIssue({ code: "custom", path: ["decisionTo"], message: "Must be on or after the start date" });
    } else if (daysBetween(f.decisionFrom, f.decisionTo) + 1 > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["decisionTo"],
        message: `Range may not exceed ${MAX_RANGE_DAYS} days`,
      });
    }
    if ((f.deliveryFrom === null) !== (f.deliveryTo === null)) {
      ctx.addIssue({ code: "custom", path: ["deliveryTo"], message: "Set both delivery dates or neither" });
    } else if (f.deliveryFrom && f.deliveryTo) {
      const span = daysBetween(f.deliveryFrom, f.deliveryTo);
      if (span < 0)
        ctx.addIssue({ code: "custom", path: ["deliveryTo"], message: "Must be on or after the start date" });
      else if (span + 1 > MAX_RANGE_DAYS)
        ctx.addIssue({
          code: "custom",
          path: ["deliveryTo"],
          message: `Range may not exceed ${MAX_RANGE_DAYS} days`,
        });
    }
  });

export type FilterErrors = Partial<Record<keyof Filters, string>>;

export function validateFilters(f: Filters): FilterErrors {
  const result = filtersSchema.safeParse(f);
  if (result.success) return {};
  const errors: FilterErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof Filters | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Filters <-> URL search params, so every view is shareable and reload-safe. */
export function filtersFromParams(params: URLSearchParams): Filters {
  const lead = params.get("lead");
  const align = params.get("align");
  return {
    decisionFrom: params.get("from") ?? DEFAULT_FILTERS.decisionFrom,
    decisionTo: params.get("to") ?? DEFAULT_FILTERS.decisionTo,
    leadHours:
      lead !== null && lead !== "" && !Number.isNaN(Number(lead)) ? Number(lead) : DEFAULT_FILTERS.leadHours,
    deliveryFrom: params.get("dfrom"),
    deliveryTo: params.get("dto"),
    alignment: align === "hourly_mean" ? "hourly_mean" : "exact",
  };
}

export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  p.set("from", f.decisionFrom);
  p.set("to", f.decisionTo);
  p.set("lead", String(f.leadHours));
  if (f.deliveryFrom && f.deliveryTo) {
    p.set("dfrom", f.deliveryFrom);
    p.set("dto", f.deliveryTo);
  } else {
    p.delete("dfrom");
    p.delete("dto");
  }
  if (f.alignment !== "exact") p.set("align", f.alignment);
  else p.delete("align");
  return p;
}
