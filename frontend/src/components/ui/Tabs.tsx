import { ReactNode } from "react";
import clsx from "clsx";

export interface TabItem<T extends string = string> {
  key: T;
  label: ReactNode;
  count?: number | string;
  icon?: ReactNode;
}

export interface TabsProps<T extends string = string> {
  value: T;
  onChange: (key: T) => void;
  items: TabItem<T>[];
  className?: string;
}

export function Tabs<T extends string = string>({ value, onChange, items, className }: TabsProps<T>) {
  return (
    <div className={clsx("tabs", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={value === it.key}
          className={clsx("tab", value === it.key && "active")}
          onClick={() => onChange(it.key)}
        >
          {it.icon}
          {it.label}
          {typeof it.count === "number" || typeof it.count === "string" ? (
            <span className="count num">{it.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export default Tabs;
