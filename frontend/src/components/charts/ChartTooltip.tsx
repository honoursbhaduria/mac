import type { ReactNode } from "react";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Tooltip body shared by all charts: text in ink tokens, colour only as a swatch. */
export function TooltipCard({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div
      className="min-w-[210px] rounded-[6px] bg-[var(--instrument)] px-3.5 py-2.5 text-[12.5px] text-[var(--instrument-text)] shadow-[var(--lift-2)]"
      data-testid="chart-tooltip"
    >
      <p className="mb-1.5 font-mono text-[11px] text-[var(--instrument-muted)]">{title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="flex items-center gap-1.5 text-[var(--instrument-muted)]">
              {r.color && (
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
              )}
              {r.label}
            </dt>
            <dd className="text-right font-mono tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      {footer && (
        <div className="mt-2 border-t border-[var(--instrument-rule)] pt-1.5 font-mono text-[10.5px] text-[var(--gold)]">
          {footer}
        </div>
      )}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; shape?: "line" | "dot" | "bar" | "hollow" }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-muted)]" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.shape === "dot" || i.shape === "hollow" ? (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={i.shape === "hollow" ? { border: `2px solid ${i.color}` } : { background: i.color }}
            />
          ) : i.shape === "bar" ? (
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: i.color }} />
          ) : (
            <span className="inline-block h-[2px] w-4 rounded" style={{ background: i.color }} />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
