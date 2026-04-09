import clsx from "clsx";

type Variant = "conform" | "neconform" | "partial" | "review" | "insufficient" | "neutral";

export function Badge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: Variant }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)]",
      variant === "conform" && "verdict-conform",
      variant === "neconform" && "verdict-neconform",
      variant === "partial" && "verdict-partial",
      variant === "review" && "verdict-review",
      variant === "insufficient" && "verdict-insufficient",
      variant === "neutral" && "bg-[var(--bg-floating)] text-[var(--text-secondary)] border border-[var(--border)]",
    )}>
      {children}
    </span>
  );
}
