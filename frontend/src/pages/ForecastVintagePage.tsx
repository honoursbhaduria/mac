import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { VintageChart } from "../components/charts/VintageChart";
import { EmptyState, ErrorState, FieldSkeleton, QualityWarnings } from "../components/feedback/Feedback";
import { Bay } from "../components/layout/Bay";
import { PageOpening } from "../components/layout/PageOpening";
import { useVintages } from "../hooks/useAnalysis";
import { usePageAnalysis } from "../hooks/usePageAnalysis";
import type { Vintages } from "../types/api";
import { fmtLondon, fmtMw, fmtSignedMw, londonHourToUtcIso, utcIsoToLondonParts } from "../utils/format";

function shiftHours(iso: string, h: number): string {
  return new Date(Date.parse(iso) + h * 3_600_000).toISOString().replace(".000Z", "Z");
}

function IntervalPicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const parts = utcIsoToLondonParts(value);
  const [date, setDate] = useState(parts.date);
  const [hour, setHour] = useState(parts.hour);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) onChange(londonHourToUtcIso(date, hour));
  };
  return (
    <form
      onSubmit={submit}
      className="card flex flex-wrap items-end gap-3"
      aria-label="Choose delivery interval"
    >
      <label className="grid gap-1">
        <span className="eyebrow">Delivery date (London)</span>
        <input
          type="date"
          className="input w-44"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label className="grid gap-1">
        <span className="eyebrow">Hour starting</span>
        <select className="input w-28" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="cap">
        <Search size={14} aria-hidden="true" /> Inspect
      </button>
      <div className="ml-auto flex gap-1.5">
        <button
          type="button"
          className="cap cap--sm"
          onClick={() => onChange(shiftHours(value, -1))}
          aria-label="Previous hour"
        >
          <ChevronLeft size={14} aria-hidden="true" /> Hour
        </button>
        <button
          type="button"
          className="cap cap--sm"
          onClick={() => onChange(shiftHours(value, 1))}
          aria-label="Next hour"
        >
          Hour <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

function SelectionSummary({ v }: { v: Vintages }) {
  const eligible = v.vintages.filter((x) => x.eligible).length;
  return (
    <div className="card grid gap-3 md:grid-cols-4" data-testid="vintage-summary">
      <div>
        <p className="eyebrow">Delivery interval</p>
        <p className="font-display text-[30px] leading-tight font-light text-[var(--ink)]">
          {fmtLondon(v.start_time)}
        </p>
      </div>
      <div>
        <p className="eyebrow">Decision cutoff</p>
        <p className="font-display text-[30px] leading-tight font-light text-[var(--ink)]">
          {fmtLondon(v.decision_cutoff)}
        </p>
        <p className="meta">
          {v.decision_lead_hours !== null ? `${v.decision_lead_hours} h before delivery` : "explicit cutoff"}
        </p>
      </div>
      <div>
        <p className="eyebrow">Selected forecast</p>
        {v.selected ? (
          <>
            <p
              className="font-display text-[30px] leading-tight font-light text-[var(--ink)]"
              data-testid="selected-forecast"
            >
              {fmtMw(v.selected.forecast_mw)}
            </p>
            <p className="meta">published {fmtLondon(v.selected.publish_time)}</p>
          </>
        ) : (
          <p className="font-display text-[30px] leading-tight font-light text-[var(--ink)]">None eligible</p>
        )}
      </div>
      <div>
        <p className="eyebrow">Actual · error</p>
        <p className="font-display text-[30px] leading-tight font-light text-[var(--ink)]">
          {fmtMw(v.actual_mw)} · {fmtSignedMw(v.selected?.error_mw)}
        </p>
        <p className="meta">
          {v.actual_mw === null ? "No FUELHH actual available" : "error = forecast − actual"}
        </p>
      </div>
      <p className="text-[15px] text-[var(--text-muted)] md:col-span-4">
        {v.vintages.length === 0
          ? "No WINDFOR vintages were returned for this interval."
          : v.selected
            ? `${eligible} of ${v.vintages.length} vintages had been published by the cutoff. The latest of them (published ${fmtLondon(v.selected.publish_time)}) is the forecast a buyer could have used, so it is the one scored. Later vintages are shown for context only.`
            : `None of the ${v.vintages.length} vintages had been published by the cutoff, so this interval has no decision-time forecast.`}
      </p>
    </div>
  );
}

export function ForecastVintagePage() {
  const { filters, query } = usePageAnalysis();
  const [params, setParams] = useSearchParams();
  const fallback = query.data?.query.first_interval ?? null;
  const t = params.get("t") ?? fallback;
  const vq = useVintages(t, filters.leadHours, filters.alignment);

  const choose = (iso: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("t", iso);
      return p;
    });

  return (
    <>
      <PageOpening
        title="Forecast vintage explorer"
        busy={vq.isFetching}
        lede={`Every WINDFOR publication for one delivery hour. Vintages published by the decision cutoff (delivery − ${filters.leadHours} h) are eligible; the latest eligible one is selected.`}
      />
      <Bay num="02" id="picker" title="Choose an interval">
        {t ? (
          <IntervalPicker key={t} value={t} onChange={choose} />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <FieldSkeleton height={90} label="Loading default interval" />
        )}
      </Bay>
      <Bay num="03" id="vintages" title="Publication history">
        {!t ? null : vq.isError ? (
          <ErrorState error={vq.error} onRetry={() => void vq.refetch()} />
        ) : !vq.data ? (
          <FieldSkeleton height={360} label="Loading forecast vintages" />
        ) : vq.data.vintages.length === 0 ? (
          <div className="grid gap-4">
            <SelectionSummary v={vq.data} />
            <EmptyState title="No vintages returned">
              Elexon returned no WINDFOR publications for this hour in the searched window (
              {vq.data.publish_window.from} → {vq.data.publish_window.to}).
            </EmptyState>
          </div>
        ) : (
          <div className={`grid gap-4 ${vq.isFetching ? "opacity-60" : ""}`}>
            <SelectionSummary v={vq.data} />
            <div className="card">
              <VintageChart data={vq.data} />
            </div>
            <div className="card card--flush overflow-auto p-0" style={{ maxHeight: 520 }}>
              <table className="data-table" aria-label="Forecast vintages">
                <thead>
                  <tr>
                    <th scope="col">Published (London)</th>
                    <th scope="col" className="num">
                      Horizon
                    </th>
                    <th scope="col" className="num">
                      Forecast MW
                    </th>
                    <th scope="col">Available at cutoff</th>
                    <th scope="col">Selection</th>
                    <th scope="col" className="num">
                      Error MW
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vq.data.vintages.map((v) => (
                    <tr
                      key={v.publish_time}
                      data-eligible={v.eligible}
                      data-selected={v.selected}
                      className={
                        v.selected
                          ? "bg-[var(--gold-soft)] font-medium"
                          : v.eligible
                            ? ""
                            : "text-[var(--text-muted)]"
                      }
                    >
                      <td>{fmtLondon(v.publish_time)}</td>
                      <td className="num">{v.horizon_hours} h</td>
                      <td className="num">{fmtMw(v.forecast_mw)}</td>
                      <td>{v.eligible ? "Yes: published by cutoff" : "No: published after cutoff"}</td>
                      <td>
                        {v.selected ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="dot dot--on" aria-hidden="true" /> Selected
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{v.selected ? fmtSignedMw(v.error_mw) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <p className="eyebrow mb-2">Data quality</p>
              <QualityWarnings warnings={vq.data.data_quality} />
            </div>
          </div>
        )}
      </Bay>
    </>
  );
}
