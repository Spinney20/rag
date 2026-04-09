import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({ children, variant = "primary", size = "md", loading, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-md)] transition-all duration-200 whitespace-nowrap",
        "disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50",
        size === "sm" && "text-xs px-3 py-1.5",
        size === "md" && "text-[13px] px-4 py-2.5",
        size === "lg" && "text-sm px-6 py-3",
        variant === "primary" && "bg-[var(--accent)] text-[var(--bg-void)] hover:brightness-110 shadow-[0_0_20px_var(--accent-glow),0_2px_8px_rgba(0,0,0,0.3)]",
        variant === "secondary" && "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-active)] hover:bg-[var(--bg-floating)]",
        variant === "danger" && "bg-[var(--neconform)]/10 text-[var(--neconform)] border border-[var(--neconform)]/20 hover:bg-[var(--neconform)]/20",
        variant === "ghost" && "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}
