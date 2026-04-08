"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderPlus, FileCheck, Settings, Zap } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/projects/new", icon: FolderPlus, label: "Proiect Nou" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] flex flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* Logo */}
      <div className="p-6 pb-4">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-shadow">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              RAG Checker
            </span>
            <span className="block text-[10px] font-mono text-[var(--accent)] tracking-widest uppercase">
              conformitate
            </span>
          </div>
        </Link>
      </div>

      {/* Divider with glow */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-[var(--accent-dim)] to-transparent" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              )}
            >
              <item.icon className={clsx("w-4 h-4", isActive && "text-[var(--accent)]")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-[var(--text-muted)]">
          <div className="w-2 h-2 rounded-full bg-[var(--conform)] pulse-glow" />
          <span>System online</span>
        </div>
      </div>
    </aside>
  );
}
