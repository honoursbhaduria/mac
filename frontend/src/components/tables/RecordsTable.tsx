import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { IntervalRecord } from "../../types/api";
import { filterAndSort, type SortKey, type StatusFilter, type TableState } from "../../utils/records";
import { FLAG_LABEL, STATUS_LABEL, fmtLondon, fmtNum } from "../../utils/format";

const PAGE_SIZE = 48;

const COLUMNS: { key: SortKey | null; label: string; num?: boolean }[] = [
  { key: "start_time", label: "Delivery interval" },
  { key: null, label: "Decision cutoff" },
  { key: null, label: "Forecast published" },
  { key: "forecast_mw", label: "Forecast MW", num: true },
  { key: "actual_mw", label: "Actual MW", num: true },
  { key: "error_mw", label: "Error MW", num: true },
  { key: "abs_error_mw", label: "|Error| MW", num: true },
  { key: null, label: "Status" },
  { key: null, label: "Quality" },
];

export function RecordsTable({ rows }: { rows: IntervalRecord[] }) {
  const { search } = useLocation();
  const [state, setState] = useState<TableState>({
    query: "",
    status: "all",
    sortKey: "start_time",
    sortDir: "asc",
  });
  const [page, setPage] = useState(0);
  const visible = useMemo(() => filterAndSort(rows, state), [rows, state]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const set = (patch: Partial<TableState>) => {
    setState((s) => ({ ...s, ...patch }));
    setPage(0);
  };
  const toggleSort = (key: SortKey) =>
    set({ sortKey: key, sortDir: state.sortKey === key && state.sortDir === "asc" ? "desc" : "asc" });

  const vintageLink = (iso: string) => {
    const p = new URLSearchParams(search);
    p.set("t", iso);
    return `/vintages?${p.toString()}`;
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="eyebrow">Search</span>
          <span className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-3 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              className="input w-64 pl-8"
              placeholder="e.g. 14 Jan, missing, 18:00"
              value={state.query}
              onChange={(e) => set({ query: e.target.value })}
              aria-label="Search records"
            />
          </span>
        </label>
        <label className="grid gap-1">
          <span className="eyebrow">Status</span>
          <select
            className="input w-56"
            value={state.status}
            onChange={(e) => set({ status: e.target.value as StatusFilter })}
            aria-label="Filter by status"
          >
            <option value="all">All intervals</option>
            <option value="matched">Matched only</option>
            <option value="unmatched">Any missing data</option>
            <option value="missing_forecast">No eligible forecast</option>
            <option value="missing_actual">No actual</option>
            <option value="missing_both">No forecast or actual</option>
          </select>
        </label>
        <p className="meta ml-auto" aria-live="polite" data-testid="row-count">
          {visible.length.toLocaleString("en-GB")} of {rows.length.toLocaleString("en-GB")} intervals
        </p>
      </div>

      <div className="card card--flush overflow-auto p-0" style={{ maxHeight: 620 }}>
        <table className="data-table" aria-label="Interval records">
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = c.key !== null && state.sortKey === c.key;
                return (
                  <th
                    key={c.label}
                    scope="col"
                    className={c.num ? "num" : undefined}
                    aria-sort={active ? (state.sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {c.key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key as SortKey)}
                        className="inline-flex items-center gap-1 uppercase"
                      >
                        {c.label}
                        {active ? (
                          state.sortDir === "asc" ? (
                            <ArrowUp size={12} aria-hidden="true" />
                          ) : (
                            <ArrowDown size={12} aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown size={12} aria-hidden="true" className="opacity-50" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-8 text-center">
                  No intervals match these table filters.
                </td>
              </tr>
            )}
            {slice.map((r) => (
              <tr key={r.start_time} data-status={r.status}>
                <td>
                  <Link
                    className="underline decoration-dotted underline-offset-2"
                    to={vintageLink(r.start_time)}
                  >
                    {fmtLondon(r.start_time)}
                  </Link>
                </td>
                <td className="text-[var(--text-muted)]">{fmtLondon(r.decision_cutoff)}</td>
                <td className="text-[var(--text-muted)]">
                  {r.forecast_publish_time ? fmtLondon(r.forecast_publish_time) : "—"}
                </td>
                <td className="num">{fmtNum(r.forecast_mw)}</td>
                <td className="num">{fmtNum(r.actual_mw)}</td>
                <td className="num">
                  {r.error_mw === null
                    ? "—"
                    : `${r.error_mw > 0 ? "+" : r.error_mw < 0 ? "−" : ""}${fmtNum(Math.abs(r.error_mw))}`}
                </td>
                <td className="num">{fmtNum(r.abs_error_mw)}</td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`dot ${r.status === "matched" ? "dot--on" : "dot--warn"}`}
                      aria-hidden="true"
                    />
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="text-[13px] text-[var(--text-muted)]">
                  {r.flags.length ? r.flags.map((f) => FLAG_LABEL[f] ?? f).join("; ") : "OK"}
                  {r.eligible_vintages > 0 && (
                    <span className="meta"> · {r.eligible_vintages} eligible vintages</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center justify-end gap-2" aria-label="Table pages">
        <button
          type="button"
          className="cap cap--sm"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="meta">
          Page {current + 1} of {pages}
        </span>
        <button
          type="button"
          className="cap cap--sm"
          disabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
