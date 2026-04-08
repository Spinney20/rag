import clsx from "clsx";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "conform" | "neconform" | "partial" | "review" | "insufficient" | "default";
  size?: "sm" | "md";
}

export function Badge({ children, variant = "default", size = "sm" }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 font-mono font-medium rounded-md",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        variant === "conform" && "badge-conform",
        variant === "neconform" && "badge-neconform",
        variant === "partial" && "badge-partial",
        variant === "review" && "badge-review",
        variant === "insufficient" && "badge-insufficient",
        variant === "default" && "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]",
      )}
    >
      {children}
    </span>
  );
}
