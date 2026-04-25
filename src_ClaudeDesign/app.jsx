/* App root — hash router + route switch */

const useHashRoute = () => {
  const [route, setRoute] = React.useState(() => window.location.hash.replace(/^#/, "") || "/");
  React.useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = React.useCallback((r) => {
    window.location.hash = r;
    try { localStorage.setItem("rag.route", r); } catch (e) {}
  }, []);
  return [route, go];
};

const matchProject = (route) => {
  const m = route.match(/^\/projects\/([^/]+)(?:\/(\w+))?/);
  if (!m) return null;
  return { id: m[1], sub: m[2] || "detail" };
};

const App = () => {
  // Restore last route on first load (if hash missing)
  React.useEffect(() => {
    if (!window.location.hash) {
      try {
        const saved = localStorage.getItem("rag.route");
        if (saved) window.location.hash = saved;
      } catch (e) {}
    }
  }, []);

  const [route, go] = useHashRoute();
  const pm = matchProject(route);

  const projects = window.MOCK_PROJECTS;
  const currentProject = pm ? projects.find(p => p.id === pm.id) || projects[0] : null;

  // Build breadcrumbs
  const crumbs = [{ label: "Proiecte", onClick: () => go("/") }];
  if (route === "/projects/new") crumbs.push({ label: "Proiect nou" });
  else if (pm && currentProject) {
    crumbs.push({ label: currentProject.name, onClick: () => go(`/projects/${currentProject.id}`) });
    const subLabel = { detail: "Pipeline", requirements: "Cerințe", evaluation: "Evaluare", report: "Raport" }[pm.sub];
    if (pm.sub !== "detail") crumbs.push({ label: subLabel });
  }

  let content;
  if (route === "/") {
    content = <Dashboard projects={projects} go={go} />;
  } else if (route === "/projects/new") {
    content = <NewProject go={go} />;
  } else if (pm) {
    if (pm.sub === "detail")            content = <ProjectDetail project={currentProject} go={go} />;
    else if (pm.sub === "requirements") content = <Requirements project={currentProject} go={go} />;
    else if (pm.sub === "evaluation")   content = <Evaluation project={currentProject} go={go} />;
    else if (pm.sub === "report")       content = <Report project={currentProject} go={go} />;
    else                                content = <ProjectDetail project={currentProject} go={go} />;
  } else {
    content = <Dashboard projects={projects} go={go} />;
  }

  const right = pm && currentProject ? (
    <span className="status-chip" title="Status proiect curent">
      <span className={`status-dot ${window.STATUS_LABEL[currentProject.status]?.dot || ""}`} />
      {currentProject.id.toUpperCase()}
    </span>
  ) : null;

  return (
    <>
      <div className="app">
        <Sidebar route={route} go={go} currentProject={currentProject} />
        <main className="main">
          <Topbar crumbs={crumbs} right={right} />
          <div className="scroll">{content}</div>
        </main>
      </div>
      <Tweaks />
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
