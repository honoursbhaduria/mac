import type { IntervalRecord, IntervalStatus } from "../types/api";
import { FLAG_LABEL, STATUS_LABEL, fmtLondon } from "./format";

export type SortKey = "start_time" | "forecast_mw" | "actual_mw" | "error_mw" | "abs_error_mw";
export type SortDir = "asc" | "desc";
export type StatusFilter = IntervalStatus | "all" | "unmatched";

export interface TableState {
  query: string;
  status: StatusFilter;
  sortKey: SortKey;
  sortDir: SortDir;
}

/** Display-only filtering/sorting of rows the backend already computed. Nulls sort last. */
export function filterAndSort(rows: IntervalRecord[], s: TableState): IntervalRecord[] {
  const q = s.query.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (s.status === "unmatched" ? r.status === "matched" : s.status !== "all" && r.status !== s.status)
      return false;
    if (!q) return true;
    const hay = [
      fmtLondon(r.start_time),
      r.start_time,
      r.forecast_publish_time ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      ...r.flags.map((f) => FLAG_LABEL[f] ?? f),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  const dir = s.sortDir === "asc" ? 1 : -1;
  return out.sort((a, b) => {
    const av = a[s.sortKey];
    const bv = b[s.sortKey];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
  });
}
