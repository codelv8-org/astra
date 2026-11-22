import type { GenBlock } from "./spec";

type Chart = Extract<GenBlock, { type: "chart" }>;
const colors = [
  "--accent",
  "--ok",
  "--wait",
  "--bad",
  "--c-mira",
  "--c-vector",
  "--c-scout",
  "--ink-2",
];
const valueFormat = new Intl.NumberFormat("th-TH", {
  maximumFractionDigits: 6,
});

export function GenChart({ item }: { item: Chart }) {
  const { points, variant, unit } = item;
  const low = Math.min(0, ...points.map(({ value }) => value));
  const high = Math.max(0, ...points.map(({ value }) => value));
  const scale = (value: number) => (value - low) / (high - low || 1);
  const labelValue = (value: number) =>
    `${valueFormat.format(value)}${unit ? ` ${unit}` : ""}`;
  if (variant === "bar") {
    const zero = scale(0) * 100;
    return (
      <ul className="genui-bar-list">
        {points.map(({ label, value }, index) => {
          const end = scale(value) * 100;
          return (
            <li key={index}>
              <span>{label}</span>
              <strong>{labelValue(value)}</strong>
              <svg
                aria-hidden="true"
                viewBox="0 0 100 6"
                preserveAspectRatio="none"
              >
                <rect width="100" height="6" className="genui-track" />
                <rect
                  x={Math.min(zero, end)}
                  width={Math.abs(end - zero)}
                  height="6"
                  className="genui-fill"
                />
              </svg>
            </li>
          );
        })}
      </ul>
    );
  }
  const circular = variant === "pie" || variant === "donut";
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const positions = points.map(({ value }, index) => [
    points.length === 1 ? 120 : 8 + (index * 224) / (points.length - 1),
    72 - scale(value) * 64,
  ]);
  const path = positions.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <>
      {circular ? (
        <svg
          className="genui-round-chart"
          aria-hidden="true"
          viewBox="0 0 100 100"
        >
          {points.map(({ value }, index) => {
            if (value === 0) return null;
            const share = (value / total) * 100;
            const before =
              (points
                .slice(0, index)
                .reduce((sum, point) => sum + point.value, 0) /
                total) *
              100;
            return (
              <circle
                key={index}
                cx="50"
                cy="50"
                r="25"
                pathLength="100"
                fill="none"
                stroke={`var(${colors[index]})`}
                strokeWidth={variant === "pie" ? 50 : 17}
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={-before}
                transform="rotate(-90 50 50)"
              />
            );
          })}
        </svg>
      ) : (
        <svg className="genui-trend" aria-hidden="true" viewBox="0 0 240 80">
          <line
            x1="8"
            x2="232"
            y1={72 - scale(0) * 64}
            y2={72 - scale(0) * 64}
            className="genui-axis"
          />
          {variant === "area" && (
            <polygon
              points={`${positions[0][0]},${72 - scale(0) * 64} ${path} ${positions.at(-1)![0]},${72 - scale(0) * 64}`}
              className="genui-fill genui-area"
            />
          )}
          <polyline points={path} className="genui-line" />
          {positions.map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="2.5" className="genui-fill" />
          ))}
        </svg>
      )}
      <details open={circular || undefined}>
        <summary>อ่านค่ากราฟ</summary>
        <dl className="genui-values">
          {points.map(({ label, value }, index) => (
            <div key={index}>
              <dt>
                {circular && (
                  <svg aria-hidden="true" viewBox="0 0 9 9">
                    <rect
                      width="9"
                      height="9"
                      rx="2"
                      fill={`var(${colors[index]})`}
                    />
                  </svg>
                )}
                {label}
              </dt>
              <dd>{labelValue(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
