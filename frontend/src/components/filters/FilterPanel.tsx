import { ArrowRight } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  DEFAULT_FILTERS,
  MAX_LEAD_HOURS,
  validateFilters,
  type Alignment,
  type FilterErrors,
  type Filters,
} from "../../types/filters";

interface Props {
  filters: Filters;
  onApply: (f: Filters) => void;
  onReset: () => void;
  busy?: boolean;
}

const LEAD_PRESETS = [6, 12, 24, 48];

function Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="eyebrow">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-[var(--status-bad)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Analysis filters. Edits are held as a draft and only applied (one request) on submit,
 * so typing a date does not fire a request per keystroke.
 */
export function FilterPanel({ filters, onApply, onReset, busy }: Props) {
  // Re-key the draft whenever the applied filters change (e.g. reset, back button).
  return (
    <FilterForm
      key={JSON.stringify(filters)}
      filters={filters}
      onApply={onApply}
      onReset={onReset}
      busy={busy}
    />
  );
}

function FilterForm({ filters, onApply, onReset, busy }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<Filters>(filters);
  const [leadText, setLeadText] = useState(String(filters.leadHours));
  const [restrictDelivery, setRestrictDelivery] = useState(filters.deliveryFrom !== null);
  const [errors, setErrors] = useState<FilterErrors>({});

  const update = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const lead = leadText.trim() === "" ? Number.NaN : Number(leadText);
    const next: Filters = {
      ...draft,
      leadHours: lead,
      deliveryFrom: restrictDelivery ? draft.deliveryFrom || null : null,
      deliveryTo: restrictDelivery ? draft.deliveryTo || null : null,
    };
    const errs = validateFilters(next);
    if (Number.isNaN(lead)) errs.leadHours = "Lead time must be a number";
    setErrors(errs);
    if (Object.keys(errs).length === 0) onApply(next);
  };

  const dirty =
    JSON.stringify({ ...draft, leadHours: Number(leadText) }) !== JSON.stringify(filters) ||
    restrictDelivery !== (filters.deliveryFrom !== null);

  return (
    <form
      onSubmit={submit}
      aria-label="Analysis filters"
      className="card card--lift grid gap-5 p-6"
      noValidate
    >
      <div className="flex items-center justify-between gap-3">
        <span className="chip">Analysis filters</span>
        <button
          type="button"
          className="btn-text"
          onClick={() => {
            setErrors({});
            onReset();
            setDraft(DEFAULT_FILTERS);
            setLeadText(String(DEFAULT_FILTERS.leadHours));
            setRestrictDelivery(false);
          }}
        >
          Reset to January 2026
        </button>
      </div>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="sr-only">Decision date range</legend>
        <Field label="Decision from" htmlFor={`${id}-df`} error={errors.decisionFrom}>
          <input
            id={`${id}-df`}
            type="date"
            className="input"
            value={draft.decisionFrom}
            aria-invalid={Boolean(errors.decisionFrom)}
            onChange={(e) => update({ decisionFrom: e.target.value })}
            required
          />
        </Field>
        <Field label="Decision to" htmlFor={`${id}-dt`} error={errors.decisionTo}>
          <input
            id={`${id}-dt`}
            type="date"
            className="input"
            value={draft.decisionTo}
            aria-invalid={Boolean(errors.decisionTo)}
            onChange={(e) => update({ decisionTo: e.target.value })}
            required
          />
        </Field>
      </fieldset>

      <Field
        label="Decision lead time (hours before delivery)"
        htmlFor={`${id}-lead`}
        error={errors.leadHours}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={`${id}-lead`}
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_LEAD_HOURS}
            step={0.5}
            className="input w-24"
            value={leadText}
            aria-invalid={Boolean(errors.leadHours)}
            onChange={(e) => setLeadText(e.target.value)}
          />
          <div className="segmented" role="group" aria-label="Lead time presets">
            {LEAD_PRESETS.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={Number(leadText) === h}
                onClick={() => setLeadText(String(h))}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </Field>

      <div className="grid gap-2">
        <span className="eyebrow" id={`${id}-align`}>
          Actual alignment
        </span>
        <div className="segmented self-start" role="group" aria-labelledby={`${id}-align`}>
          {(
            [
              ["exact", "Exact start time"],
              ["hourly_mean", "Hourly mean"],
            ] as [Alignment, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={draft.alignment === value}
              onClick={() => update({ alignment: value })}
            >
              <span className={`dot ${draft.alignment === value ? "dot--on" : ""}`} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <label className="flex items-center gap-2 text-[0.9rem]">
          <input
            type="checkbox"
            checked={restrictDelivery}
            onChange={(e) => {
              setRestrictDelivery(e.target.checked);
              if (e.target.checked && !draft.deliveryFrom) {
                update({ deliveryFrom: draft.decisionFrom, deliveryTo: draft.decisionTo });
              }
            }}
            className="h-4 w-4 accent-[var(--ink)]"
          />
          Also restrict delivery dates
        </label>
        {restrictDelivery && (
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="sr-only">Delivery date range</legend>
            <Field label="Delivery from" htmlFor={`${id}-vf`} error={errors.deliveryFrom}>
              <input
                id={`${id}-vf`}
                type="date"
                className="input"
                value={draft.deliveryFrom ?? ""}
                onChange={(e) => update({ deliveryFrom: e.target.value || null })}
              />
            </Field>
            <Field label="Delivery to" htmlFor={`${id}-vt`} error={errors.deliveryTo}>
              <input
                id={`${id}-vt`}
                type="date"
                className="input"
                value={draft.deliveryTo ?? ""}
                aria-invalid={Boolean(errors.deliveryTo)}
                onChange={(e) => update({ deliveryTo: e.target.value || null })}
              />
            </Field>
          </fieldset>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-[var(--rule)] pt-5">
        <button type="submit" className="btn-primary" disabled={busy} aria-label="Apply filters">
          {busy ? "Loading…" : "Apply filters"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <p className="meta" aria-live="polite">
          {dirty ? "Changes pending — apply to run the analysis." : "Showing results for these filters."}
        </p>
      </div>
    </form>
  );
}
