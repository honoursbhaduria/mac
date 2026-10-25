/** Chart constants for white card surfaces. The forecast/actual pair was validated with the
 * dataviz palette validator against #fdfdfd: lightness band, chroma, CVD and contrast all pass. */
export const C = {
  forecast: "#c2452a", // vermilion
  actual: "#00809f", // teal
  over: "#c2452a", // positive error: forecast above actual
  under: "#00809f", // negative error: forecast below actual
  neutral: "#9a9a9a",
  magnitude: "#3b3b3b", // single-series magnitude bars (ink)
  grid: "#ececec",
  axis: "#6e6e6e",
  surface: "#fdfdfd",
  ink: "#1c1c1c",
  inkMuted: "#6e6e6e",
  cursor: "rgba(0,0,0,0.04)",
} as const;

export const axisProps = {
  stroke: "#dcdcdc",
  tick: { fill: C.axis, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
  tickLine: false,
} as const;

export const gridProps = { stroke: C.grid, vertical: false } as const;
