/** Presentation-only formatting. No business calculations live in the frontend. */

const LONDON = "Europe/London";

const mwFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtMw = (v: number | null | undefined): string => (v == null ? "—" : `${mwFmt.format(v)} MW`);
export const fmtNum = (v: number | null | undefined): string => (v == null ? "—" : mwFmt.format(v));
export const fmtSignedMw = (v: number | null | undefined): string =>
  v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${mwFmt.format(Math.abs(v))} MW`;
export const fmtPct = (v: number | null | undefined): string => (v == null ? "—" : `${pctFmt.format(v)}%`);
export const fmtSignedPct = (v: number | null | undefined): string =>
  v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${pctFmt.format(Math.abs(v))}%`;

const dtFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const shortFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, day: "2-digit", month: "short" });
const dateOnlyFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** e.g. "15 Jan 2026, 12:00 GMT" — always Europe/London. The GMT/BST label is derived from
 * the actual offset because browsers disagree on short zone names ("GMT+1" vs "BST"). */
export const fmtLondon = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return `${dtFmt.format(new Date(ms))} ${londonOffsetMinutes(ms) === 60 ? "BST" : "GMT"}`;
};
export const fmtLondonShort = (iso: string | number): string => shortFmt.format(new Date(iso));
export const fmtLondonDay = (iso: string | number): string => dayFmt.format(new Date(iso));
/** A calendar date string (YYYY-MM-DD) without timezone shifting. */
export const fmtDate = (d: string): string => dateOnlyFmt.format(new Date(`${d}T00:00:00Z`));

/** Offset of Europe/London from UTC at a given instant, in minutes (0 or 60). */
export function londonOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Convert a London wall-clock date + hour to a UTC ISO string ("…Z"). */
export function londonHourToUtcIso(date: string, hour: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, hour);
  let utc = naive - londonOffsetMinutes(naive) * 60_000;
  utc = naive - londonOffsetMinutes(utc) * 60_000;
  return new Date(utc).toISOString().replace(".000Z", "Z");
}

/** London calendar date and hour of a UTC instant. */
export function utcIsoToLondonParts(iso: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

export const STATUS_LABEL: Record<string, string> = {
  matched: "Matched",
  missing_forecast: "No eligible forecast",
  missing_actual: "No actual",
  missing_both: "No forecast or actual",
};

export const FLAG_LABEL: Record<string, string> = {
  no_eligible_forecast: "No vintage published by cutoff",
  no_actual: "FUELHH actual missing",
  negative_actual: "Negative actual reported",
  stale_source: "Served from stale cache",
};
