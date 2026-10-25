import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { DailyMaeChart } from "../components/charts/AccuracyCharts";
import { AnalysisGate } from "../components/feedback/AnalysisGate";
import { QualityWarnings } from "../components/feedback/Feedback";
import { StatusStrip } from "../components/feedback/StatusStrip";
import { KpiDisplay } from "../components/kpis/KpiDisplay";
import { Bay } from "../components/layout/Bay";
import { PageOpening } from "../components/layout/PageOpening";
import { usePageAnalysis } from "../hooks/usePageAnalysis";
import { fmtDate, fmtLondon } from "../utils/format";

export function OverviewPage() {
  const { filters, query } = usePageAnalysis();
  const { search } = useLocation();
  return (
    <>
      <PageOpening
        hero
        title="GB Wind Forecast Intelligence"
        busy={query.isFetching}
        lede={
          <>
            <p>
              How good was the wind forecast that a purchasing team could actually see when it had to buy? For
              every hourly delivery interval this tool takes the latest Elexon WINDFOR forecast published by
              the decision cutoff and scores it against FUELHH metered wind outturn.
            </p>
          </>
        }
      />
      <StatusStrip data={query.data} isFetching={query.isFetching} isError={query.isError} />

      <Bay
        num="02"
        id="kpis"
        title="Decision-time forecast accuracy"
        aside={
          query.data?.query.first_interval ? (
            <p className="meta">
              Decisions {fmtDate(filters.decisionFrom)} – {fmtDate(filters.decisionTo)} · delivery{" "}
              {fmtLondon(query.data.query.first_interval)} → {fmtLondon(query.data.query.last_interval)}
            </p>
          ) : null
        }
      >
        <AnalysisGate query={query} skeletonHeight={170}>
          {(data, refreshing) => (
            <div className="grid gap-3">
              <KpiDisplay data={data} dimmed={refreshing} />
              {data.metrics.notes.map((n) => (
                <p key={n} className="meta">
                  {n}
                </p>
              ))}
            </div>
          )}
        </AnalysisGate>
      </Bay>

      {query.data && query.data.coverage.evaluation_intervals > 0 && (
        <>
          <Bay
            num="03"
            id="daily"
            title="Daily mean absolute error"
            aside={
              <Link
                to={{ pathname: "/accuracy", search }}
                className="link inline-flex items-center gap-1.5 text-[0.95rem]"
              >
                Accuracy detail <ArrowRight size={14} aria-hidden="true" />
              </Link>
            }
          >
            <div className="card">
              <p className="eyebrow mb-2">MAE per delivery day (Europe/London), MW</p>
              {query.data.daily.some((d) => d.mae_mw !== null) ? (
                <DailyMaeChart daily={query.data.daily} />
              ) : (
                <p className="meta py-10 text-center">No matched intervals to chart.</p>
              )}
            </div>
          </Bay>

          <Bay num="04" id="method" title="How these numbers were produced">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="card lg:col-span-2">
                <p className="eyebrow mb-2">Assumptions</p>
                <ul className="grid list-disc gap-1.5 pl-5 text-[15px]">
                  {query.data.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <div className="card grid content-start gap-3">
                <p className="eyebrow">Sources</p>
                {query.data.sources.map((s) => (
                  <div key={s.dataset} className="text-[14px]" data-testid={`source-${s.dataset}`}>
                    <p className="chip chip--dark mb-1">{s.dataset}</p>
                    <p className="meta">
                      {s.records_received.toLocaleString("en-GB")} records · {s.records_rejected} rejected
                    </p>
                    <p className="meta">
                      Retrieved {fmtLondon(s.retrieved_at)}
                      {s.stale ? " · STALE" : s.cached_chunks === s.chunks ? " · cached" : ""}
                    </p>
                  </div>
                ))}
              </div>
              <div className="card lg:col-span-3">
                <p className="eyebrow mb-2">Data quality</p>
                <QualityWarnings warnings={query.data.data_quality} />
              </div>
            </div>
          </Bay>
        </>
      )}
    </>
  );
}
