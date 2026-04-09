import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, CheckCircle2, Clock, ListChecks, Zap, Download, BarChart3, AlertTriangle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Project, Document, STATUS_MAP, DOC_TYPES } from "@/lib/types";
import clsx from "clsx";

const STEPS = [
  { key: "docs", label: "Documente", icon: FileText },
  { key: "reqs", label: "Cerințe", icon: ListChecks },
  { key: "eval", label: "Evaluare", icon: Zap },
  { key: "report", label: "Raport", icon: Download },
];
const STATUS_STEP: Record<string, number> = { created: 0, processing: 0, documents_ready: 1, requirements_extracted: 1, requirements_validated: 2, evaluated: 3, completed: 4 };

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    Promise.all([
      apiFetch<Project>(`/projects/${id}`),
      apiFetch<{ documents: Document[] }>(`/projects/${id}/documents`),
    ]).then(([p, d]) => { setProject(p); setDocs(d.documents); }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [id]);
  useEffect(() => {
    if (!project || project.status !== "processing") return;
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, [project?.status]);

  if (loading) return <div className="flex justify-center items-center h-screen"><div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  if (!project) return <div className="p-8 text-center text-[var(--text-secondary)]">Proiect negăsit</div>;

  const step = STATUS_STEP[project.status] ?? 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 anim-fade-up">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"><ArrowLeft className="w-3.5 h-3.5" /> Dashboard</Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
            {project.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{project.description}</p>}
          </div>
          <Badge>{(STATUS_MAP[project.status] || { label: project.status }).label}</Badge>
        </div>
      </div>

      {/* Pipeline */}
      <Card className="mb-8 anim-fade-up" style={{ animationDelay: "50ms" }}>
        <CardBody className="py-6">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const done = i < step, active = i === step;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center border transition-all",
                      done && "bg-[var(--conform)]/10 border-[var(--conform)]/25 text-[var(--conform)]",
                      active && "bg-[var(--accent-glow-strong)] border-[var(--accent)]/25 text-[var(--accent)] shadow-[0_0_16px_var(--accent-glow)]",
                      !done && !active && "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)]",
                    )}>
                      {done ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className={clsx("w-5 h-5", active && "pulse-live")} />}
                    </div>
                    <span className={clsx("text-[11px] mt-2 font-medium", active ? "text-[var(--accent)]" : done ? "text-[var(--conform)]" : "text-[var(--text-muted)]")}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={clsx("h-px flex-1 mx-2 -mt-6", i < step ? "bg-[var(--conform)]/30" : "bg-[var(--border)]")} />}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Documents */}
      <Card className="mb-6 anim-fade-up" style={{ animationDelay: "100ms" }}>
        <CardHeader className="flex items-center justify-between">
          <span className="label-xs">Documente</span>
          <span className="mono text-[11px] text-[var(--text-muted)]">{docs.length} fișiere</span>
        </CardHeader>
        <CardBody className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-void)] border border-[var(--border)] rounded-[var(--radius-sm)]">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{d.original_filename}</div>
                  <div className="mono text-[10px] text-[var(--text-muted)]">
                    {DOC_TYPES[d.doc_type]} {d.heading_count != null && `· ${d.heading_count} headings`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.processing_warning && <span title={d.processing_warning}><AlertTriangle className="w-3.5 h-3.5 text-[var(--partial)]" /></span>}
                {d.processing_status === "ready" ? <Badge variant="conform">Ready</Badge> :
                 d.processing_status === "error" ? <Badge variant="neconform">Eroare</Badge> :
                 <div className="flex items-center gap-1.5"><div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /><span className="mono text-[10px] text-[var(--accent)]">{d.processing_status}</span></div>}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 anim-fade-up" style={{ animationDelay: "150ms" }}>
        {project.status === "documents_ready" && <Link to={`/projects/${id}/requirements`}><Button><ListChecks className="w-4 h-4" /> Extrage Cerințe</Button></Link>}
        {project.status === "requirements_extracted" && <Link to={`/projects/${id}/requirements`}><Button><ListChecks className="w-4 h-4" /> Validează Cerințe</Button></Link>}
        {project.status === "requirements_validated" && <Link to={`/projects/${id}/evaluation`}><Button><Zap className="w-4 h-4" /> Evaluare</Button></Link>}
        {(project.status === "evaluated" || project.status === "completed") && <>
          <Link to={`/projects/${id}/evaluation`}><Button><BarChart3 className="w-4 h-4" /> Rezultate</Button></Link>
          <Link to={`/projects/${id}/report`}><Button variant="secondary"><Download className="w-4 h-4" /> Raport</Button></Link>
        </>}
      </div>
    </div>
  );
}
