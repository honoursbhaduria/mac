import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Vintages } from "../../types/api";
import { fmtLondon, fmtLondonShort, fmtMw } from "../../utils/format";
import { Legend, TooltipCard } from "./ChartTooltip";
import { C, axisProps } from "./theme";

interface Pt {
  x: number;
  y: number;
  iso: string;
  horizon: number;
  eligible: boolean;
  selected: boolean;
}

export function VintageChart({ data }: { data: Vintages }) {
  const pts: Pt[] = data.vintages.map((v) => ({
    x: Date.parse(v.publish_time),
    y: v.forecast_mw,
    iso: v.publish_time,
    horizon: v.horizon_hours,
    eligible: v.eligible,
    selected: v.selected,
  }));
  const cutoff = Date.parse(data.decision_cutoff);
  const delivery = Date.parse(data.start_time);
  const xs = [...pts.map((p) => p.x), cutoff, delivery];
  const ys = [...pts.map((p) => p.y), ...(data.actual_mw !== null ? [data.actual_mw] : [])];
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.15 || 500;
  const x0 = Math.min(...xs) - 3_600_000;
  const x1 = Math.max(...xs) + 3_600_000;
  // Keep the last tick inset so its label is not clipped at the plot edge.
  const ticks = Array.from({ length: 6 }, (_, i) => x0 + ((x1 - x0) * 0.92 * i) / 5);

  return (
    <figure
      className="grid gap-3"
      aria-label="Forecast vintages for the selected interval by publication time"
    >
      <Legend
        items={[
          { label: "Published by cutoff (eligible)", color: C.forecast, shape: "dot" },
          { label: "Published after cutoff (not eligible)", color: C.neutral, shape: "hollow" },
          { label: "Actual outturn", color: C.actual },
          { label: "Decision cutoff", color: C.inkMuted },
        ]}
      />
      <div style={{ height: 300 }} data-testid="vintage-chart">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 300 }}>
          <ScatterChart margin={{ top: 18, right: 44, bottom: 18, left: 8 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              scale="time"
              domain={[x0, x1]}
              ticks={ticks}
              tickFormatter={(v: number) => fmtLondonShort(v)}
              {...axisProps}
              minTickGap={40}
              label={{
                value: "Publish time (Europe/London)",
                position: "insideBottom",
                offset: -10,
                fill: C.axis,
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[Math.max(0, Math.floor(Math.min(...ys) - pad)), Math.ceil(Math.max(...ys) + pad)]}
              {...axisProps}
              width={60}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
              label={{ value: "MW", angle: -90, position: "insideLeft", fill: C.axis, fontSize: 11 }}
            />
            <ReferenceLine
              x={cutoff}
              stroke={C.inkMuted}
              strokeWidth={1.5}
              label={{ value: "Cutoff", position: "top", fill: C.inkMuted, fontSize: 11 }}
            />
            <ReferenceLine
              x={delivery}
              stroke={C.grid}
              strokeWidth={1}
              label={{ value: "Delivery", position: "top", fill: C.axis, fontSize: 11 }}
            />
            {data.actual_mw !== null && (
              <ReferenceLine y={data.actual_mw} stroke={C.actual} strokeWidth={2} />
            )}
            <Tooltip
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as Pt | undefined;
                if (!active || !d) return null;
                return (
                  <TooltipCard
                    title={`Published ${fmtLondon(d.iso)}`}
                    rows={[
                      { label: "Forecast", value: fmtMw(d.y), color: d.eligible ? C.forecast : C.neutral },
                      { label: "Horizon", value: `${d.horizon} h before delivery` },
                      { label: "At cutoff", value: d.eligible ? "Available" : "Not yet published" },
                    ]}
                    footer={d.selected ? "SELECTED: latest vintage available at the cutoff" : undefined}
                  />
                );
              }}
            />
            <Scatter
              data={pts.filter((p) => !p.eligible)}
              fill={C.surface}
              stroke={C.neutral}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Scatter
              data={pts.filter((p) => p.eligible && !p.selected)}
              fill={C.forecast}
              fillOpacity={0.7}
              isAnimationActive={false}
            />
            <Scatter
              data={pts.filter((p) => p.selected)}
              fill={C.forecast}
              stroke={C.surface}
              strokeWidth={2}
              shape={(props: { cx?: number; cy?: number }) => (
                <circle cx={props.cx} cy={props.cy} r={8} fill={C.forecast} stroke={C.ink} strokeWidth={2} />
              )}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="meta">The ringed point is the vintage used for scoring.</figcaption>
    </figure>
  );
}
