import { AlertTriangle, Loader2 } from "lucide-react";
import type { Analysis } from "../../types/api";
import { fmtLondon } from "../../utils/format";

interface Props {
  data?: Analysis;
  isFetching: boolean;
  isError: boolean;
}

/** Retrieval provenance: when the data was fetched, whether it came from cache or is stale. */
export function StatusStrip({ data, isFetching, isError }: Props) {
  const retrieved = data?.sources
    .map((s) => s.retrieved_at)
    .filter((v): v is string => v !== null)
    .sort()[0];
  const cachedAll = data?.sources.length && data.sources.every((s) => s.cached_chunks === s.chunks);
  const warnings = data?.data_quality.filter((w) => w.severity !== "info").length ?? 0;

  return (
    <div className="mt-12" data-testid="status-strip" role="status" aria-live="polite">
      <div className="rule-dotted" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4 text-[13px]">
        <span className="flex items-center gap-2">
          {isFetching ? (
            <>
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span className="eyebrow">Fetching from Elexon…</span>
            </>
          ) : isError ? (
            <>
              <span className="dot bg-[var(--status-bad)]" aria-hidden="true" />
              <span className="eyebrow text-[var(--status-bad)]">Last request failed</span>
            </>
          ) : data ? (
            <>
              <span className="dot dot--on" aria-hidden="true" />
              <span className="eyebrow text-[var(--ink)]">Analysis loaded</span>
            </>
          ) : null}
        </span>
        {data && (
          <>
            <span className="meta">
              Data retrieved <span className="text-[var(--ink)]">{fmtLondon(retrieved)}</span>
              {cachedAll ? " · served from cache" : ""}
            </span>
            {data.stale && (
              <span className="chip" data-testid="stale-badge">
                <AlertTriangle size={12} aria-hidden="true" />
                Stale: Elexon unreachable, cached data may be out of date
              </span>
            )}
            <span className="meta">
              {warnings > 0
                ? `${warnings} data-quality warning${warnings > 1 ? "s" : ""}`
                : "No data-quality warnings"}
            </span>
          </>
        )}
      </div>
      <div className="rule-dotted" aria-hidden="true" />
    </div>
  );
}
