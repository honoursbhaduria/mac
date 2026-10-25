import type { ReactNode } from "react";
import { useFilters } from "../../hooks/useFilters";
import { FilterPanel } from "../filters/FilterPanel";

interface Props {
  title: string;
  lede: ReactNode;
  hero?: boolean;
  busy?: boolean;
  eyebrow?: string;
}

/** Light condensed display heading beside the filter card. Shared by every page. */
export function PageOpening({
  title,
  lede,
  hero = false,
  busy,
  eyebrow = "Elexon · WINDFOR × FUELHH",
}: Props) {
  const { filters, apply, reset } = useFilters();
  return (
    <section
      className={`grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)] ${hero ? "pt-16 lg:pt-24" : "pt-10 lg:pt-14"}`}
      aria-labelledby="page-title"
    >
      <div className="grid content-center gap-6">
        <span className="eyebrow">{eyebrow}</span>
        <h1 id="page-title" className={hero ? "display" : "display display--page"}>
          {title}
        </h1>
        <div className="lede max-w-[58ch]">{lede}</div>
        <p className="instrument max-w-[58ch]" aria-label="Decision policy">
          <span className="muted">$ </span>
          decision_cutoff = delivery_start − <span className="hl">{filters.leadHours} h</span>
          <span className="muted"> # pilot assumption, configurable</span>
        </p>
      </div>
      <FilterPanel filters={filters} onApply={apply} onReset={reset} busy={busy} />
    </section>
  );
}
