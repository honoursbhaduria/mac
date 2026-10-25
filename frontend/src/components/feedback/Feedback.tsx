import { AlertTriangle, CircleSlash, Info, RefreshCw, XOctagon } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "../../services/api";
import type { QualityWarning } from "../../types/api";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiErr = error instanceof ApiError ? error : null;
  const upstream = apiErr?.code.startsWith("upstream_");
  return (
    <div role="alert" className="card card--lift flex flex-col gap-3 p-6" data-testid="error-state">
      <span className="chip self-start bg-[var(--status-bad)] text-white">
        <XOctagon aria-hidden="true" size={12} /> Request failed
      </span>
      <div>
        <h3 className="headline text-[2rem]">
          {upstream ? "Elexon data is unavailable" : "The analysis could not be loaded"}
        </h3>
      </div>
      <p className="lede text-[1rem]">{apiErr?.message ?? "An unexpected error occurred."}</p>
      {apiErr?.details && (
        <ul className="meta list-disc pl-5">
          {apiErr.details.map((d) => (
            <li key={d.field + d.message}>
              {d.field}: {d.message}
            </li>
          ))}
        </ul>
      )}
      <p className="meta">
        {apiErr ? `HTTP ${apiErr.status || "—"} · ${apiErr.code}` : null} · No figures are shown because none
        were retrieved.
      </p>
      {onRetry && (
        <div>
          <button type="button" className="btn-primary" onClick={onRetry}>
            <RefreshCw size={15} aria-hidden="true" /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      className="card flex min-h-[180px] flex-col items-center justify-center gap-3 p-8 text-center"
      data-testid="empty-state"
    >
      <CircleSlash aria-hidden="true" size={22} className="text-[var(--text-muted)]" />
      <p className="headline text-[1.75rem]">{title}</p>
      {children && <div className="meta max-w-[56ch]">{children}</div>}
    </div>
  );
}

export function FieldSkeleton({ height = 280, label = "Loading data" }: { height?: number; label?: string }) {
  return (
    <div className="card" style={{ height }} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex h-full flex-col gap-3" aria-hidden="true">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton flex-1" />
      </div>
    </div>
  );
}

const SEVERITY = {
  error: { icon: XOctagon, label: "Error", cls: "text-[var(--status-bad)]" },
  warning: { icon: AlertTriangle, label: "Warning", cls: "text-[var(--status-warn)]" },
  info: { icon: Info, label: "Note", cls: "text-[var(--text-muted)]" },
} as const;

export function QualityWarnings({ warnings }: { warnings: QualityWarning[] }) {
  if (!warnings.length) {
    return <p className="meta">No data-quality issues were detected in the retrieved records.</p>;
  }
  return (
    <ul className="grid gap-2" aria-label="Data-quality notes">
      {warnings.map((w) => {
        const s = SEVERITY[w.severity];
        const Icon = s.icon;
        return (
          <li key={w.code} className="flex items-start gap-2 text-[14px]">
            <Icon size={16} aria-hidden="true" className={`mt-0.5 flex-none ${s.cls}`} />
            <span>
              <span className={`font-mono text-[11px] uppercase tracking-[0.08em] ${s.cls}`}>{s.label}</span>{" "}
              {w.message}
              {w.count > 0 && <span className="meta"> ({w.count.toLocaleString("en-GB")})</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
