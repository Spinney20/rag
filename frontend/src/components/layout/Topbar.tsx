import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useCurrentProject } from "@/lib/useCurrentProject";

interface Crumb {
  label: string;
  to?: string;
}

const SUB_LABEL: Record<string, string> = {
  requirements: "Cerințe",
  evaluation:   "Evaluare",
  report:       "Raport",
};

function buildCrumbs(pathname: string, projectName: string | null): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Proiecte", to: "/" }];

  if (pathname === "/projects/new") {
    crumbs.push({ label: "Proiect nou" });
    return crumbs;
  }

  const m = pathname.match(/^\/projects\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return crumbs;
  const [, id, sub] = m;
  if (id === "new") return crumbs;

  crumbs.push({
    label: projectName || `Proiect ${id.slice(0, 8)}`,
    to: `/projects/${id}`,
  });
  if (sub && SUB_LABEL[sub]) {
    crumbs.push({ label: SUB_LABEL[sub] });
  }
  return crumbs;
}

export function Topbar() {
  const location = useLocation();
  const project = useCurrentProject();
  const crumbs = buildCrumbs(location.pathname, project?.name || null);

  return (
    <div className="topbar">
      <nav className="breadcrumb" aria-label="breadcrumb">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <span className="sep">
                <ChevronRight className="w-3 h-3" />
              </span>
            )}
            {i === crumbs.length - 1 || !c.to ? (
              <span className="cur">{c.label}</span>
            ) : (
              <Link to={c.to}>{c.label}</Link>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="topbar-right">
        {project && (
          <span className="status-chip" title="ID proiect">
            <span className="status-dot ok" />
            {project.id.slice(0, 8).toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

export default Topbar;
