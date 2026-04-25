/* App shell: sidebar + topbar + project context */

const Sidebar = ({ route, go, currentProject }) => {
  const mainNav = [
    { key: "dashboard", label: "Proiecte",       icon: "grid",   route: "/" },
    { key: "new",       label: "Proiect nou",    icon: "plus",   route: "/projects/new", kbd: "N" },
  ];

  const projectNav = currentProject ? [
    { key: "detail",       label: "Pipeline",    icon: "layers",  route: `/projects/${currentProject.id}` },
    { key: "requirements", label: "Cerințe",     icon: "list",    route: `/projects/${currentProject.id}/requirements` },
    { key: "evaluation",   label: "Evaluare",    icon: "sparkle", route: `/projects/${currentProject.id}/evaluation` },
    { key: "report",       label: "Raport",      icon: "gauge",   route: `/projects/${currentProject.id}/report` },
  ] : [];

  const isActive = (r) => {
    if (r === "/") return route === "/";
    return route === r || route.startsWith(r + "/");
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">RAG Checker</div>
          <div className="brand-sub">VER. CONFORMITATE PT/CS</div>
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">General</div>
        {mainNav.map(n => (
          <div
            key={n.key}
            className={`nav-item ${isActive(n.route) ? "active" : ""}`}
            onClick={() => go(n.route)}
          >
            <Icon name={n.icon} size={15} className="icon" />
            <span>{n.label}</span>
            {n.kbd && <span className="kbd">{n.kbd}</span>}
          </div>
        ))}
      </div>

      {currentProject && (
        <div className="nav-section">
          <div className="nav-section-title">Proiect curent</div>
          <div style={{
            padding: "6px 10px 10px", fontSize: 12, color: "var(--ink-1)",
            borderBottom: "1px solid var(--line-0)", marginBottom: 6,
          }}>
            <div style={{ fontSize: 12.5, color: "var(--ink-0)", lineHeight: 1.3, marginBottom: 6 }}>
              {currentProject.name}
            </div>
            <StatusChip status={currentProject.status} />
          </div>
          {projectNav.map(n => (
            <div
              key={n.key}
              className={`nav-item ${isActive(n.route) ? "active" : ""}`}
              onClick={() => go(n.route)}
            >
              <Icon name={n.icon} size={15} className="icon" />
              <span>{n.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">AV</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--ink-0)" }}>ing. A. Vasilescu</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--ff-mono)", letterSpacing: "0.04em" }}>
              CONSTRUX A S.A.
            </div>
          </div>
          <IconButton name="settings" title="Setări" size={14} />
        </div>
      </div>
    </aside>
  );
};

const Topbar = ({ crumbs, right }) => (
  <div className="topbar">
    <nav className="breadcrumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep"><Icon name="chevronR" size={11} /></span>}
          {i === crumbs.length - 1
            ? <span className="cur">{c.label}</span>
            : <a onClick={() => c.onClick && c.onClick()} style={{ cursor: "pointer" }}>{c.label}</a>}
        </React.Fragment>
      ))}
    </nav>
    <div className="topbar-right">
      {right}
      <span className="status-chip">
        <span className="status-dot live" />
        API · online
      </span>
    </div>
  </div>
);

Object.assign(window, { Sidebar, Topbar });
