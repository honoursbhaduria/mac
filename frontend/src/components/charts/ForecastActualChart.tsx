import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "../../utils/series";
import {
  STATUS_LABEL,
  fmtLondon,
  fmtLondonDay,
  fmtLondonShort,
  fmtMw,
  fmtSignedMw,
} from "../../utils/format";
import { Legend, TooltipCard } from "./ChartTooltip";
import { C, axisProps, gridProps } from "./theme";

export function SeriesTooltip({ point }: { point?: SeriesPoint }) {
  if (!point) return null;
  return (
    <TooltipCard
      title={fmtLondon(point.iso)}
      rows={[
        { label: "Forecast", value: fmtMw(point.forecast), color: C.forecast },
        { label: "Actual", value: fmtMw(point.actual), color: C.actual },
        { label: "Error (F − A)", value: fmtSignedMw(point.error) },
        { label: "Status", value: STATUS_LABEL[point.status] ?? point.status },
      ]}
      footer={
        point.publish
          ? `Forecast published ${fmtLondon(point.publish)}`
          : "No forecast published by the cutoff"
      }
    />
  );
}

interface ChartProps {
  points: SeriesPoint[];
  onSelect?: (iso: string) => void;
  height?: number;
}

export function ForecastActualChart({ points, onSelect, height = 380 }: ChartProps) {
  return (
    <figure className="grid gap-3" aria-label="Decision-time forecast and actual wind generation over time">
      <Legend
        items={[
          { label: "Decision-time forecast (WINDFOR)", color: C.forecast },
          { label: "Actual generation (FUELHH)", color: C.actual },
        ]}
      />
      <div style={{ height }} data-testid="forecast-actual-chart">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 900, height }}>
          <LineChart
            data={points}
            margin={{ top: 8, right: 28, bottom: 4, left: 8 }}
            onClick={(state) => {
              const label = state?.activeLabel;
              const p = label !== undefined ? points.find((x) => x.t === Number(label)) : undefined;
              if (p && onSelect) onSelect(p.iso);
            }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => fmtLondonDay(v)}
              minTickGap={28}
              {...axisProps}
              height={42}
            />
            <YAxis
              {...axisProps}
              width={64}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              label={{ value: "MW", angle: -90, position: "insideLeft", fill: C.axis, fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: C.inkMuted, strokeWidth: 1 }}
              content={({ active, payload }) =>
                active ? <SeriesTooltip point={payload?.[0]?.payload as SeriesPoint | undefined} /> : null
              }
            />
            <Line
              type="linear"
              dataKey="actual"
              name="Actual"
              stroke={C.actual}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="forecast"
              name="Forecast"
              stroke={C.forecast}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            {points.length > 48 && (
              <Brush
                dataKey="t"
                height={26}
                stroke={C.axis}
                fill={C.surface}
                travellerWidth={10}
                tickFormatter={(v: number) => fmtLondonShort(v)}
                aria-label="Zoom time range"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="meta">
        Times are delivery starts in Europe/London. Gaps mean a missing forecast or actual — values are never
        interpolated. Click a point to inspect its forecast vintages.
      </figcaption>
    </figure>
  );
}

export function ErrorBarsChart({ points, height = 220 }: { points: SeriesPoint[]; height?: number }) {
  const matched = points.filter((p) => p.error !== null);
  return (
    <figure className="grid gap-3" aria-label="Signed forecast error per interval">
      <Legend
        items={[
          { label: "Over-forecast (F > A)", color: C.over, shape: "bar" },
          { label: "Under-forecast (F < A)", color: C.under, shape: "bar" },
        ]}
      />
      <div style={{ height }} data-testid="error-chart">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 900, height }}>
          <BarChart data={matched} margin={{ top: 8, right: 28, bottom: 4, left: 8 }} barCategoryGap={0}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => fmtLondonDay(v)}
              minTickGap={28}
              {...axisProps}
            />
            <YAxis
              {...axisProps}
              width={64}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
              label={{ value: "Error MW", angle: -90, position: "insideLeft", fill: C.axis, fontSize: 11 }}
            />
            <ReferenceLine y={0} stroke={C.axis} />
            <Tooltip
              cursor={{ fill: C.cursor }}
              content={({ active, payload }) =>
                active ? <SeriesTooltip point={payload?.[0]?.payload as SeriesPoint | undefined} /> : null
              }
            />
            <Bar dataKey="error" isAnimationActive={false} minPointSize={1}>
              {matched.map((p) => (
                <Cell key={p.t} fill={(p.error ?? 0) >= 0 ? C.over : C.under} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
