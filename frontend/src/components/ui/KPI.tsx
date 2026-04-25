import { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export interface KPIProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  accent?: string;
}

export function KPI({ eyebrow, value, unit, sub, accent, className, children, ...rest }: KPIProps) {
  return (
    <div className={clsx("kpi", className)} {...rest}>
      <div className="eyebrow">{eyebrow}</div>
      <div className="big num" style={accent ? { color: accent } : undefined}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="sub">{sub}</div>}
      {children}
    </div>
  );
}

export default KPI;
