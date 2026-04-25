import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useMatch } from "react-router-dom";
import { apiFetch } from "./api";
import { Project } from "./types";

/**
 * One source of truth for "the project the user is currently looking at".
 *
 * The provider lives high in the tree (App), watches the URL via useMatch,
 * and fetches the project once per id transition. Sidebar and Topbar both
 * consume via useCurrentProject() — no duplicate fetches.
 *
 * Note: provider state is read-only here. Pages that mutate the project
 * (e.g., ProjectPage during processing) keep their own local state — the
 * sidebar/topbar refresh on the next navigation. We don't propagate live
 * status changes to the provider on purpose; staleness in chrome is fine,
 * and avoiding a global cache layer keeps this simple.
 */

const ProjectContext = createContext<Project | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const match = useMatch("/projects/:id/*");
  const id = match?.params.id;
  const projectId = id && id !== "new" ? id : null;

  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    apiFetch<Project>(`/projects/${projectId}`)
      .then((p) => { if (!cancelled) setProject(p); })
      .catch(() => { if (!cancelled) setProject(null); });
    return () => { cancelled = true; };
  }, [projectId]);

  return <ProjectContext.Provider value={project}>{children}</ProjectContext.Provider>;
}

export function useCurrentProject(): Project | null {
  return useContext(ProjectContext);
}

export default useCurrentProject;
