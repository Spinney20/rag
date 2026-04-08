import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 whitespace-nowrap",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        size === "sm" && "text-xs px-3 py-1.5",
        size === "md" && "text-sm px-4 py-2.5",
        size === "lg" && "text-sm px-6 py-3",
        variant === "primary" &&
          "bg-[var(--accent)] text-black hover:brightness-110 active:brightness-90 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30",
        variant === "secondary" &&
          "bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-active)]",
        variant === "danger" &&
          "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
        variant === "ghost" &&
          "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]",
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
