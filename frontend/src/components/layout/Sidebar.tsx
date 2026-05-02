import { NavLink } from "react-router-dom";
import { LayoutGrid, Plus, Layers, List, Sparkles, Gauge } from "lucide-react";
import clsx from "clsx";
import { useCurrentProject } from "@/lib/useCurrentProject";
import { useParticlesEnabled, setParticlesEnabled } from "@/lib/preferences";
import { StatusChip } from "@/components/ui/StatusChip";
import iconUrl from "@/assets/icon.ico";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  kbd?: string;
}

const MAIN_NAV: NavItem[] = [
  { to: "/",             label: "Proiecte",    icon: LayoutGrid, end: true },
  { to: "/projects/new", label: "Proiect nou", icon: Plus,       kbd: "N" },
];

export function Sidebar() {
  const project = useCurrentProject();
  const particlesOn = useParticlesEnabled();

  const projectNav: NavItem[] | null = project
    ? [
        { to: `/projects/${project.id}`,              label: "Pipeline", icon: Layers,   end: true },
        { to: `/projects/${project.id}/requirements`, label: "Cerințe",  icon: List },
        { to: `/projects/${project.id}/evaluation`,   label: "Evaluare", icon: Sparkles },
        { to: `/projects/${project.id}/report`,       label: "Raport",   icon: Gauge },
      ]
    : null;

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={iconUrl} className="brand-mark" alt="RAG Checker" />
        <div>
          <div className="brand-name">RAG Checker</div>
          <div className="brand-sub">Conformitate PT/CS</div>
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">General</div>
        {MAIN_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => clsx("nav-item", isActive && "active")}
          >
            <n.icon className="nav-icon w-[15px] h-[15px]" />
            <span>{n.label}</span>
            {n.kbd && <span className="kbd">{n.kbd}</span>}
          </NavLink>
        ))}
      </div>

      {projectNav && project && (
        <div className="nav-section">
          <div className="nav-section-title">Proiect curent</div>
          <div
            style={{
              padding: "6px 10px 12px",
              borderBottom: "1px solid var(--line-0)",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-0)",
                lineHeight: 1.35,
                marginBottom: 8,
                wordBreak: "break-word",
              }}
            >
              {project.name}
            </div>
            <StatusChip status={project.status} />
          </div>
          {projectNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => clsx("nav-item", isActive && "active")}
            >
              <n.icon className="nav-icon w-[15px] h-[15px]" />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>
      )}

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">RC</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--ink-0)" }}>Sesiune locală</div>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--ink-3)",
                fontFamily: "var(--ff-mono)",
                letterSpacing: "0.04em",
              }}
            >
              v0.2 · DEV
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={() => setParticlesEnabled(!particlesOn)}
            aria-label={particlesOn ? "Dezactivează fundalul animat" : "Activează fundalul animat"}
            aria-pressed={particlesOn}
            title={particlesOn ? "Dezactivează fundalul animat" : "Activează fundalul animat"}
          >
            <Sparkles
              className="w-3.5 h-3.5"
              style={{
                color: particlesOn ? "var(--amber)" : "var(--ink-3)",
                opacity: particlesOn ? 1 : 0.6,
              }}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
