import clsx from "clsx";

export interface StackBarPart {
  pct: number; // 0..1
  color: string;
  label?: string;
}

export interface StackBarProps {
  parts: StackBarPart[];
  className?: string;
}

export function StackBar({ parts, className }: StackBarProps) {
  return (
    <div className={clsx("stackbar", className)}>
      {parts.map((p, i) => (
        <span
          key={i}
          style={{ width: `${Math.max(0, Math.min(1, p.pct)) * 100}%`, background: p.color }}
          title={p.label}
        />
      ))}
    </div>
  );
}

export default StackBar;
