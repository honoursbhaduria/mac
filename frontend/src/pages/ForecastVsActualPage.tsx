import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ErrorBarsChart, ForecastActualChart } from "../components/charts/ForecastActualChart";
import { toSeriesPoints } from "../utils/series";
import { AnalysisGate } from "../components/feedback/AnalysisGate";
import { StatusStrip } from "../components/feedback/StatusStrip";
import { Bay } from "../components/layout/Bay";
import { PageOpening } from "../components/layout/PageOpening";
import { usePageAnalysis } from "../hooks/usePageAnalysis";

export function ForecastVsActualPage() {
  const { query } = usePageAnalysis();
  const [showError, setShowError] = useState(true);
  const navigate = useNavigate();
  const { search } = useLocation();
  const points = useMemo(() => toSeriesPoints(query.data?.intervals ?? []), [query.data]);

  const openVintage = (iso: string) => {
    const p = new URLSearchParams(search);
    p.set("t", iso);
    navigate(`/vintages?${p.toString()}`);
  };

  return (
    <>
      <PageOpening
        title="Forecast vs actual"
        busy={query.isFetching}
        lede="The decision-time forecast (latest WINDFOR vintage published by each interval's cutoff) against FUELHH metered wind outturn. Drag the handles under the chart to zoom."
      />
      <StatusStrip data={query.data} isFetching={query.isFetching} isError={query.isError} />
      <Bay
        num="02"
        id="timeseries"
        title="Hourly generation"
        aside={
          <button
            type="button"
            className="cap cap--sm"
            aria-pressed={showError}
            onClick={() => setShowError((v) => !v)}
          >
            <span className={`dot ${showError ? "dot--on" : ""}`} aria-hidden="true" />
            Show signed error
          </button>
        }
      >
        <AnalysisGate query={query} skeletonHeight={420}>
          {(data, refreshing) => (
            <div className={`grid gap-4 ${refreshing ? "opacity-60" : ""}`}>
              <div className="card">
                <ForecastActualChart points={points} onSelect={openVintage} />
              </div>
              {showError && (
                <div className="card">
                  <p className="eyebrow mb-2">Signed error per interval: forecast − actual (MW)</p>
                  {data.metrics.matched_intervals > 0 ? (
                    <ErrorBarsChart points={points} />
                  ) : (
                    <p className="meta py-8 text-center">
                      No matched intervals, so no errors can be computed.
                    </p>
                  )}
                </div>
              )}
              <p className="meta">
                {data.coverage.matched_intervals} matched ·{" "}
                {data.coverage.missing_forecast + data.coverage.missing_both} without an eligible forecast ·{" "}
                {data.coverage.missing_actual + data.coverage.missing_both} without an actual. The full
                interval table is on the Records page.
              </p>
            </div>
          )}
        </AnalysisGate>
      </Bay>
    </>
  );
}
