import clsx from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  accent?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({ children, className, hover, accent, style, onClick }: CardProps) {
  return (
    <div
      className={clsx(
        "surface relative overflow-hidden",
        hover && "glow-border cursor-pointer",
        accent && "accent-line",
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
  return <div className={clsx("px-5 py-3.5 border-b border-[var(--border)]", className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("px-5 py-4", className)}>{children}</div>;
}
