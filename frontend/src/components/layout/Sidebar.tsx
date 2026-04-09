import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderPlus, Zap } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/projects/new", icon: FolderPlus, label: "Proiect Nou" },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] flex flex-col bg-[var(--bg-base)] border-r border-[var(--border)]">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 px-5 py-5 group">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-teal-700 flex items-center justify-center shadow-[0_0_16px_var(--accent-glow-strong)] group-hover:shadow-[0_0_24px_var(--accent-glow-strong)] transition-shadow">
          <Zap className="w-4 h-4 text-[var(--bg-void)]" />
        </div>
        <div>
          <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">RAG Checker</span>
          <span className="block text-[9px] mono text-[var(--accent)] tracking-[0.15em] uppercase">conformitate</span>
        </div>
      </Link>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-[var(--accent-dim)] to-transparent" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-[13px] font-medium transition-all",
                active
                  ? "bg-[var(--accent-glow-strong)] text-[var(--accent)] border border-[var(--accent)]/15"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]",
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="px-4 py-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 px-2 text-[11px] mono text-[var(--text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--conform)] pulse-live" />
          System online
        </div>
      </div>
    </aside>
  );
}
