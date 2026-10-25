import type { Analysis } from "../../types/api";
import { buildKpis } from "../../utils/kpis";

export function KpiDisplay({ data, dimmed }: { data: Analysis; dimmed?: boolean }) {
  const kpis = buildKpis(data);
  return (
    <div
      className={`card card--flush grid grid-cols-2 gap-px overflow-hidden bg-[var(--gray)] md:grid-cols-4 xl:grid-cols-7 ${dimmed ? "opacity-60" : ""}`}
      data-testid="kpi-display"
    >
      {kpis.map((k) => (
        <div
          key={k.id}
          className="flex flex-col gap-2 bg-[var(--paper-raised)] p-5"
          data-testid={`kpi-${k.id}`}
        >
          <span className="eyebrow">{k.label}</span>
          <span className="font-display text-[46px] leading-[0.95] font-light text-[var(--ink)]">
            {k.value}
            {k.unit && (
              <span className="ml-1 font-sans text-[14px] font-normal text-[var(--text-muted)]">
                {k.unit}
              </span>
            )}
          </span>
          <span className="chip chip--quiet self-start whitespace-normal text-[10px] leading-snug">
            {k.scope}
          </span>
          <span className="text-[13px] leading-snug text-[var(--text-muted)]">{k.sub}</span>
        </div>
      ))}
    </div>
  );
}
