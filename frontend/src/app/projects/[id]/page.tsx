"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, FileText, CheckCircle2, AlertTriangle, Clock,
  ChevronRight, Zap, ListChecks, BarChart3, Download
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Project, Document, STATUS_LABELS, DOC_TYPE_LABELS } from "@/lib/types";
import clsx from "clsx";

const PIPELINE_STEPS = [
  { key: "documents", label: "Documente", icon: FileText },
  { key: "requirements", label: "Cerințe", icon: ListChecks },
  { key: "evaluation", label: "Evaluare", icon: Zap },
  { key: "report", label: "Raport", icon: Download },
];

const STATUS_STEP_MAP: Record<string, number> = {
  created: 0,
  processing: 0,
  documents_ready: 1,
  requirements_extracted: 1,
  requirements_validated: 2,
  evaluated: 3,
  completed: 4,
};

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Project>(`/projects/${projectId}`),
      apiFetch<{ documents: Document[] }>(`/projects/${projectId}/documents`),
    ])
      .then(([proj, docs]) => {
        setProject(proj);
        setDocuments(docs.documents);
      })
      .catch((err) => console.error("Failed to load project:", err))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Polling for processing status
  useEffect(() => {
    if (!project || !["processing"].includes(project.status)) return;
    const interval = setInterval(async () => {
      try {
        const [proj, docs] = await Promise.all([
          apiFetch<Project>(`/projects/${projectId}`),
          apiFetch<{ documents: Document[] }>(`/projects/${projectId}/documents`),
        ]);
        setProject(proj);
        setDocuments(docs.documents);
      } catch (err) { console.error(err); }
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.status, projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-[var(--text-secondary)]">
        Proiectul nu a fost găsit
      </div>
    );
  }

  const currentStep = STATUS_STEP_MAP[project.status] ?? 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-in">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            {project.description && (
              <p className="text-[var(--text-secondary)] mt-1 text-sm">{project.description}</p>
            )}
          </div>
          <Badge size="md">{STATUS_LABELS[project.status] || project.status}</Badge>
        </div>
      </div>

      {/* Pipeline progress */}
      <Card className="mb-8 animate-in" style={{ animationDelay: "50ms" }}>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            {PIPELINE_STEPS.map((step, i) => {
              const isActive = i === currentStep;
              const isDone = i < currentStep;
              const StepIcon = step.icon;
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center border transition-all",
                        isDone && "bg-[var(--conform)]/15 border-[var(--conform)]/30 text-[var(--conform)]",
                        isActive && "bg-[var(--accent-glow)] border-[var(--accent)]/30 text-[var(--accent)] shadow-lg shadow-cyan-500/10",
                        !isDone && !isActive && "bg-[var(--bg-tertiary)] border-[var(--border)] text-[var(--text-muted)]",
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <StepIcon className={clsx("w-5 h-5", isActive && "pulse-glow")} />
                      )}
                    </div>
                    <span
                      className={clsx(
                        "text-xs mt-2 font-medium",
                        isActive ? "text-[var(--accent)]" : isDone ? "text-[var(--conform)]" : "text-[var(--text-muted)]",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div
                      className={clsx(
                        "h-px flex-1 mx-2 -mt-6",
                        i < currentStep ? "bg-[var(--conform)]/40" : "bg-[var(--border)]",
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card className="mb-6 animate-in" style={{ animationDelay: "100ms" }}>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Documente
          </h2>
          <span className="text-xs font-mono text-[var(--text-muted)]">{documents.length} fișiere</span>
        </CardHeader>
        <CardContent className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-4 py-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{doc.original_filename}</div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">
                    {DOC_TYPE_LABELS[doc.doc_type]} · {doc.file_size_bytes ? `${(doc.file_size_bytes / 1024 / 1024).toFixed(1)}MB` : ""}
                    {doc.heading_count !== null && ` · ${doc.heading_count} headings`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {doc.processing_warning && (
                  <span title={doc.processing_warning}><AlertTriangle className="w-4 h-4 text-[var(--partial)]" /></span>
                )}
                {doc.processing_status === "ready" ? (
                  <Badge variant="conform" size="sm">Ready</Badge>
                ) : doc.processing_status === "error" ? (
                  <Badge variant="neconform" size="sm">Eroare</Badge>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-mono text-[var(--accent)]">{doc.processing_status}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Action buttons based on status */}
      <div className="flex gap-3 animate-in" style={{ animationDelay: "150ms" }}>
        {project.status === "documents_ready" && (
          <Link href={`/projects/${projectId}/requirements`}>
            <Button>
              <ListChecks className="w-4 h-4" />
              Extrage Cerințe
            </Button>
          </Link>
        )}
        {project.status === "requirements_extracted" && (
          <Link href={`/projects/${projectId}/requirements`}>
            <Button>
              <ListChecks className="w-4 h-4" />
              Revizuiește și Validează Cerințe
            </Button>
          </Link>
        )}
        {project.status === "requirements_validated" && (
          <Link href={`/projects/${projectId}/evaluation`}>
            <Button>
              <Zap className="w-4 h-4" />
              Lansează Evaluare
            </Button>
          </Link>
        )}
        {(project.status === "evaluated" || project.status === "completed") && (
          <>
            <Link href={`/projects/${projectId}/evaluation`}>
              <Button>
                <BarChart3 className="w-4 h-4" />
                Vezi Rezultate
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/report`}>
              <Button variant="secondary">
                <Download className="w-4 h-4" />
                Raport
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
