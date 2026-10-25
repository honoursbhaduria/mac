import {
  DailyBiasChart,
  DailyMaeChart,
  ErrorHistogram,
  ForecastActualScatter,
  HourlyProfileChart,
} from "../components/charts/AccuracyCharts";
import { AnalysisGate } from "../components/feedback/AnalysisGate";
import { QualityWarnings } from "../components/feedback/Feedback";
import { StatusStrip } from "../components/feedback/StatusStrip";
import { Bay } from "../components/layout/Bay";
import { PageOpening } from "../components/layout/PageOpening";
import { useMetadata } from "../hooks/useAnalysis";
import { usePageAnalysis } from "../hooks/usePageAnalysis";
import type { Analysis } from "../types/api";
import { fmtMw, fmtNum, fmtPct, fmtSignedMw, fmtSignedPct } from "../utils/format";

function metricValue(key: string, a: Analysis): string {
  const m = a.metrics;
  switch (key) {
    case "mae_mw":
      return fmtMw(m.mae_mw);
    case "rmse_mw":
      return fmtMw(m.rmse_mw);
    case "bias_mw":
      return fmtSignedMw(m.bias_mw);
    case "wape_pct":
      return fmtPct(m.wape_pct);
    case "bias_pct":
      return fmtSignedPct(m.bias_pct);
    case "total_abs_error_mw":
      return fmtMw(m.total_abs_error_mw);
    case "coverage_pct":
      return fmtPct(a.coverage.coverage_pct);
    default:
      return "—";
  }
}

function BiasExplainer({ a }: { a: Analysis }) {
  const b = a.metrics.bias_mw;
  if (b === null) return <p>Bias is undefined because there are no matched intervals.</p>;
  const dir = b > 0 ? "higher" : "lower";
  return (
    <p data-testid="bias-explainer">
      On average the decision-time forecast was{" "}
      <strong>
        {fmtMw(Math.abs(b))} {dir}
      </strong>{" "}
      than the wind generation that actually occurred
      {a.metrics.bias_pct !== null && (
        <> ({fmtSignedPct(a.metrics.bias_pct)} of total actual generation)</>
      )}.{" "}
      {b > 0
        ? "A positive bias means the forecast tended to overstate wind output: relying on it alone would have expected more wind than arrived."
        : b < 0
          ? "A negative bias means the forecast tended to understate wind output: more wind arrived than was expected."
          : "Over- and under-forecasts cancelled out on average."}{" "}
      Bias is an average: large errors in both directions can still hide behind a small bias, which is why MAE
      and RMSE are shown alongside it.
    </p>
  );
}

export function AccuracyPage() {
  const { query } = usePageAnalysis();
  const meta = useMetadata();
  return (
    <>
      <PageOpening
        title="Accuracy analysis"
        busy={query.isFetching}
        lede="Range-level metrics, daily and time-of-day error patterns, and the distribution of signed errors. All values are computed by the backend from matched intervals only."
      />
      <StatusStrip data={query.data} isFetching={query.isFetching} isError={query.isError} />
      <AnalysisGate query={query} skeletonHeight={360}>
        {(a, refreshing) => (
          <div className={refreshing ? "opacity-60" : undefined}>
            <Bay num="02" id="metrics" title="Metrics and definitions">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="card card--flush overflow-auto p-0">
                  <table className="data-table" aria-label="Accuracy metrics">
                    <thead>
                      <tr>
                        <th scope="col">Metric</th>
                        <th scope="col" className="num">
                          Value
                        </th>
                        <th scope="col">Formula</th>
                        <th scope="col">Denominator</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(meta.data?.metrics ?? []).map((d) => (
                        <tr key={d.key}>
                          <td className="font-medium whitespace-normal" title={d.interpretation}>
                            {d.name}
                          </td>
                          <td className="num font-medium text-[var(--ink)]" data-testid={`metric-${d.key}`}>
                            {metricValue(d.key, a)}
                          </td>
                          <td className="font-mono text-[12px]">{d.formula}</td>
                          <td className="text-[13px] whitespace-normal text-[var(--text-muted)]">
                            {d.denominator}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {meta.isError && <p className="meta p-3">Metric definitions could not be loaded.</p>}
                </div>
                <div className="card grid content-start gap-3 text-[15px]">
                  <p className="eyebrow">Reading the bias</p>
                  <BiasExplainer a={a} />
                  <p className="meta">
                    WAPE is used instead of MAPE because MAPE is undefined when an actual is zero and unstable
                    when it is small. WAPE is not converted into an “accuracy %”. No cost or saving is
                    inferred: price and demand data are outside this tool’s scope.
                  </p>
                  {a.metrics.notes.map((n) => (
                    <p key={n} className="meta">
                      {n}
                    </p>
                  ))}
                </div>
              </div>
            </Bay>

            <Bay num="03" id="patterns" title="Daily error patterns">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card">
                  <p className="eyebrow mb-2">MAE per delivery day (MW)</p>
                  <DailyMaeChart daily={a.daily} />
                </div>
                <div className="card">
                  <p className="eyebrow mb-2">Mean bias per delivery day (MW, + over / − under)</p>
                  <DailyBiasChart daily={a.daily} />
                </div>
                <div className="card lg:col-span-2">
                  <p className="eyebrow mb-2">MAE by hour of day (Europe/London, MW)</p>
                  <HourlyProfileChart hourly={a.hourly_profile} />
                </div>
              </div>
            </Bay>

            <Bay num="04" id="deviations" title="Forecast vs actual deviations">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card">
                  <p className="eyebrow mb-2">Forecast against actual, per interval</p>
                  <ForecastActualScatter intervals={a.intervals} />
                </div>
                <div className="card">
                  <p className="eyebrow mb-2">Distribution of signed errors (intervals per bin)</p>
                  {a.error_histogram.length ? (
                    <ErrorHistogram bins={a.error_histogram} />
                  ) : (
                    <p className="meta py-10 text-center">
                      At least two matched intervals are needed for a histogram.
                    </p>
                  )}
                </div>
              </div>
            </Bay>

            <Bay num="05" id="coverage" title="Coverage and missing records">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="card card--flush overflow-auto p-0">
                  <table className="data-table" aria-label="Coverage">
                    <tbody>
                      {(
                        [
                          ["Hourly evaluation intervals", a.coverage.evaluation_intervals],
                          [
                            "FUELHH half-hour records in the delivery span",
                            a.coverage.actual_records_available,
                          ],
                          ["Intervals with an actual", a.coverage.intervals_with_actual],
                          [
                            "Intervals with an eligible forecast",
                            a.coverage.intervals_with_eligible_forecast,
                          ],
                          ["Matched (scored) intervals", a.coverage.matched_intervals],
                          ["Missing eligible forecast only", a.coverage.missing_forecast],
                          ["Missing actual only", a.coverage.missing_actual],
                          ["Missing both", a.coverage.missing_both],
                        ] as [string, number][]
                      ).map(([label, v]) => (
                        <tr key={label}>
                          <th
                            scope="row"
                            className="!static !bg-transparent !normal-case !tracking-normal !text-[14px] !font-normal !font-sans !text-[var(--text)]"
                          >
                            {label}
                          </th>
                          <td className="num font-medium text-[var(--ink)]">{fmtNum(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card">
                  <p className="eyebrow mb-2">Data quality</p>
                  <QualityWarnings warnings={a.data_quality} />
                </div>
              </div>
            </Bay>
          </div>
        )}
      </AnalysisGate>
    </>
  );
}
