import { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  pad?: boolean;
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Panel({ pad, title, eyebrow, actions, className, children, ...rest }: PanelProps) {
  const showHeader = title || eyebrow || actions;
  return (
    <section className={clsx("panel", pad && "panel-pad", className)} {...rest}>
      {showHeader && (
        <header className="panel-header">
          <div>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 2 }}>{eyebrow}</div>}
            {title && <div className="h3">{title}</div>}
          </div>
          {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export default Panel;
