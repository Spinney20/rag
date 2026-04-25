import { BrowserRouter, Routes, Route } from "react-router-dom";
import ParticleNetwork from "@/components/ParticleNetwork";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { ProjectProvider } from "@/lib/useCurrentProject";
import { useParticlesEnabled } from "@/lib/preferences";
import Dashboard from "@/pages/Dashboard";
import NewProject from "@/pages/NewProject";
import ProjectPage from "@/pages/ProjectPage";
import RequirementsPage from "@/pages/RequirementsPage";
import EvaluationPage from "@/pages/EvaluationPage";
import ReportPage from "@/pages/ReportPage";

/**
 * Mount/unmount ParticleNetwork based on user preference. Conditional render
 * here (not inside ParticleNetwork) means the whole canvas + animation loop
 * + event listeners are cleanly torn down when the user disables it — no
 * background CPU work in the disabled state.
 */
function ParticleBackground() {
  const enabled = useParticlesEnabled();
  return enabled ? <ParticleNetwork /> : null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ProjectProvider>
        <ParticleBackground />
        <div className="app">
          <Sidebar />
          <main className="main">
            <Topbar />
            <div className="scroll">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects/new" element={<NewProject />} />
                <Route path="/projects/:id" element={<ProjectPage />} />
                <Route path="/projects/:id/requirements" element={<RequirementsPage />} />
                <Route path="/projects/:id/evaluation" element={<EvaluationPage />} />
                <Route path="/projects/:id/report" element={<ReportPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </ProjectProvider>
    </BrowserRouter>
  );
}
