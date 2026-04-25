import { ReactNode } from "react";

export interface RingProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  label: ReactNode;
  sub?: ReactNode;
}

export function Ring({
  value,
  size = 120,
  stroke = 8,
  color = "var(--amber)",
  label,
  sub,
}: RingProps) {
  const v = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 500ms var(--ease)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div
            className="num"
            style={{
              fontSize: size * 0.28,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: "var(--ink-0)",
            }}
          >
            {label}
          </div>
          {sub && <div className="eyebrow" style={{ marginTop: 4 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export default Ring;
