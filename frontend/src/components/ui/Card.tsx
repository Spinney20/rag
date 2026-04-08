import clsx from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  gradient?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({ children, className, hover = false, gradient = false, style, onClick }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]",
        hover && "glow-hover cursor-pointer",
        gradient && "gradient-border",
        className,
      )}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("px-5 py-4 border-b border-[var(--border)]", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("px-5 py-4", className)}>{children}</div>;
}
