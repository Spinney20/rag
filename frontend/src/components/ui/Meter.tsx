import clsx from "clsx";

export interface MeterProps {
  value: number; // 0..1
  tall?: boolean;
  shimmer?: boolean;
  color?: string;
  className?: string;
}

export function Meter({ value, tall, shimmer, color, className }: MeterProps) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className={clsx("meter", tall && "tall", shimmer && "shimmer", className)}>
      <span style={{ width: `${Math.round(pct * 100)}%`, ...(color ? { background: color } : null) }} />
    </div>
  );
}

export default Meter;
