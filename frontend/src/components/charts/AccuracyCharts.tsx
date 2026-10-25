import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Analysis } from "../../types/api";
import { fmtDate, fmtLondon, fmtMw, fmtNum, fmtPct, fmtSignedMw } from "../../utils/format";
import { Legend, TooltipCard } from "./ChartTooltip";
import { C, axisProps, gridProps } from "./theme";

const MAGNITUDE = C.magnitude;

function Frame({
  height,
  testId,
  children,
}: {
  height: number;
  testId: string;
  children: React.ReactElement;
}) {
  return (
    <div style={{ height }} data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height }}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const kFmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`);

export function DailyMaeChart({ daily }: { daily: Analysis["daily"] }) {
  return (
    <Frame height={240} testId="daily-mae-chart">
      <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap={2}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => d.slice(8)} minTickGap={8} />
        <YAxis {...axisProps} width={52} tickFormatter={kFmt} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as Analysis["daily"][number] | undefined;
            if (!active || !d) return null;
            return (
              <TooltipCard
                title={`Delivery day ${fmtDate(d.date)}`}
                rows={[
                  { label: "MAE", value: fmtMw(d.mae_mw) },
                  { label: "RMSE", value: fmtMw(d.rmse_mw) },
                  { label: "WAPE", value: fmtPct(d.wape_pct) },
                  { label: "Matched", value: `${d.matched} / ${d.intervals}` },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="mae_mw" fill={MAGNITUDE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

export function DailyBiasChart({ daily }: { daily: Analysis["daily"] }) {
  return (
    <Frame height={240} testId="daily-bias-chart">
      <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap={2}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => d.slice(8)} minTickGap={8} />
        <YAxis {...axisProps} width={52} tickFormatter={kFmt} />
        <ReferenceLine y={0} stroke={C.axis} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as Analysis["daily"][number] | undefined;
            if (!active || !d) return null;
            return (
              <TooltipCard
                title={`Delivery day ${fmtDate(d.date)}`}
                rows={[
                  { label: "Mean bias", value: fmtSignedMw(d.bias_mw) },
                  { label: "Mean forecast", value: fmtMw(d.mean_forecast_mw), color: C.forecast },
                  { label: "Mean actual", value: fmtMw(d.mean_actual_mw), color: C.actual },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="bias_mw" isAnimationActive={false}>
          {daily.map((d) => (
            <Cell key={d.date} fill={d.bias_mw === null ? C.neutral : d.bias_mw >= 0 ? C.over : C.under} />
          ))}
        </Bar>
      </BarChart>
    </Frame>
  );
}

export function HourlyProfileChart({ hourly }: { hourly: Analysis["hourly_profile"] }) {
  return (
    <Frame height={220} testId="hourly-chart">
      <BarChart data={hourly} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap={2}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="hour_london"
          {...axisProps}
          tickFormatter={(h: number) => `${String(h).padStart(2, "0")}`}
        />
        <YAxis {...axisProps} width={52} tickFormatter={kFmt} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as Analysis["hourly_profile"][number] | undefined;
            if (!active || !d) return null;
            return (
              <TooltipCard
                title={`${String(d.hour_london).padStart(2, "0")}:00 Europe/London`}
                rows={[
                  { label: "MAE", value: fmtMw(d.mae_mw) },
                  { label: "Mean bias", value: fmtSignedMw(d.bias_mw) },
                  { label: "Intervals", value: String(d.matched) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="mae_mw" fill={MAGNITUDE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

export function ErrorHistogram({ bins }: { bins: Analysis["error_histogram"] }) {
  const data = bins.map((b) => ({ ...b, mid: (b.lower_mw + b.upper_mw) / 2 }));
  return (
    <figure className="grid gap-2">
      <Legend
        items={[
          { label: "Over-forecast bins", color: C.over, shape: "bar" },
          { label: "Under-forecast bins", color: C.under, shape: "bar" },
          { label: "Bin spans zero", color: C.neutral, shape: "bar" },
        ]}
      />
      <Frame height={240} testId="histogram-chart">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="mid"
            {...axisProps}
            tickFormatter={kFmt}
            interval={Math.max(0, Math.ceil(data.length / 7) - 1)}
          />
          <YAxis {...axisProps} width={40} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: C.cursor }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !d) return null;
              return (
                <TooltipCard
                  title="Signed error bin"
                  rows={[
                    { label: "From", value: fmtSignedMw(d.lower_mw) },
                    { label: "To", value: fmtSignedMw(d.upper_mw) },
                    { label: "Intervals", value: String(d.count) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {data.map((b) => (
              <Cell
                key={b.lower_mw}
                fill={b.lower_mw >= 0 ? C.over : b.upper_mw <= 0 ? C.under : C.neutral}
              />
            ))}
          </Bar>
        </BarChart>
      </Frame>
    </figure>
  );
}

export function ForecastActualScatter({ intervals }: { intervals: Analysis["intervals"] }) {
  const pts = intervals
    .filter((r) => r.status === "matched")
    .map((r) => ({
      x: r.actual_mw as number,
      y: r.forecast_mw as number,
      iso: r.start_time,
      err: r.error_mw,
    }));
  const max = Math.max(1, ...pts.map((p) => Math.max(p.x, p.y)));
  const top = Math.ceil(max / 2000) * 2000;
  return (
    <figure className="grid gap-2">
      <Legend
        items={[
          { label: "Matched interval", color: C.forecast, shape: "dot" },
          { label: "Perfect forecast (F = A)", color: C.axis },
        ]}
      />
      <Frame height={300} testId="scatter-chart">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 16 }}>
          <CartesianGrid stroke={C.grid} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, top]}
            {...axisProps}
            tickFormatter={kFmt}
            label={{ value: "Actual MW", position: "insideBottom", offset: -10, fill: C.axis, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, top]}
            {...axisProps}
            width={52}
            tickFormatter={kFmt}
            label={{
              value: "Forecast MW",
              angle: -90,
              position: "left",
              offset: 2,
              fill: C.axis,
              fontSize: 11,
            }}
          />
          <ReferenceLine
            segment={[
              { x: 0, y: 0 },
              { x: top, y: top },
            ]}
            stroke={C.axis}
          />
          <Tooltip
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof pts)[number] | undefined;
              if (!active || !d) return null;
              return (
                <TooltipCard
                  title={fmtLondon(d.iso)}
                  rows={[
                    { label: "Forecast", value: fmtMw(d.y), color: C.forecast },
                    { label: "Actual", value: fmtMw(d.x), color: C.actual },
                    { label: "Error", value: fmtSignedMw(d.err) },
                  ]}
                />
              );
            }}
          />
          <Scatter data={pts} fill={C.forecast} fillOpacity={0.55} isAnimationActive={false} shape="circle" />
        </ScatterChart>
      </Frame>
      <figcaption className="meta">
        Points above the diagonal are over-forecasts; below are under-forecasts. {fmtNum(pts.length)} matched
        intervals.
      </figcaption>
    </figure>
  );
}
