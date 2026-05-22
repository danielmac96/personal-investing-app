type Props = {
  values: number[];
  width?: number;
  height?: number;
};

/**
 * Minimal inline-SVG line chart for daily closes. No axes, no labels, no
 * library. Caller controls the colour via the surrounding text colour
 * (stroke=currentColor).
 */
export function Sparkline({ values, width = 240, height = 48 }: Props) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const up = values[values.length - 1] >= values[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Recent price trend"
      className={up ? "text-emerald-600" : "text-rose-600"}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
