import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import Dashboard from "@/pages/Dashboard";
import NewProject from "@/pages/NewProject";
import ProjectPage from "@/pages/ProjectPage";
import RequirementsPage from "@/pages/RequirementsPage";
import EvaluationPage from "@/pages/EvaluationPage";
import ReportPage from "@/pages/ReportPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="dot-grid flex min-h-screen bg-[var(--bg-void)]">
        <Sidebar />
        <main className="flex-1 ml-[240px] min-h-screen relative z-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects/new" element={<NewProject />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
            <Route path="/projects/:id/requirements" element={<RequirementsPage />} />
            <Route path="/projects/:id/evaluation" element={<EvaluationPage />} />
            <Route path="/projects/:id/report" element={<ReportPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
