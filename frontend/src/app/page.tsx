"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderOpen, ArrowRight, Clock, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Project, STATUS_LABELS } from "@/lib/types";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/projects")
      .then((data) => setProjects(data.projects))
      .catch((err) => setError(err.message || "Nu se poate conecta la server"))
      .finally(() => setLoading(false));
  }, []);

  const statusIcon = (status: string) => {
    switch (status) {
      case "evaluated":
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-[var(--conform)]" />;
      case "processing":
        return <Clock className="w-4 h-4 text-[var(--accent)] animate-spin" />;
      default:
        return <FileText className="w-4 h-4 text-[var(--text-muted)]" />;
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div className="animate-in" style={{ animationDelay: "0ms" }}>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">
            Verificare conformitate propuneri tehnice
          </p>
        </div>
        <Link href="/projects/new">
          <Button size="lg" className="animate-in" style={{ animationDelay: "100ms" }}>
            <Plus className="w-4 h-4" />
            Proiect Nou
          </Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Proiecte", value: projects.length, icon: FolderOpen },
          { label: "In Lucru", value: projects.filter((p) => !["completed", "created"].includes(p.status)).length, icon: Clock },
          { label: "Avertismente", value: 0, icon: AlertTriangle },
        ].map((stat, i) => (
          <Card key={stat.label} className="animate-in" style={{ animationDelay: `${150 + i * 50}ms` }}>
            <CardContent className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent-glow)] border border-[var(--accent)]/10 flex items-center justify-center">
                <stat.icon className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono">{stat.value}</div>
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projects list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <Card className="animate-in" style={{ animationDelay: "300ms" }}>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-[var(--neconform)] mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">Eroare conexiune</h3>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="animate-in" style={{ animationDelay: "300ms" }}>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-[var(--text-muted)]" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Niciun proiect</h3>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Creează primul proiect pentru a verifica conformitatea unei propuneri tehnice
            </p>
            <Link href="/projects/new">
              <Button>
                <Plus className="w-4 h-4" />
                Creează Proiect
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project, i) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card
                hover
                className="animate-in"
                style={{ animationDelay: `${300 + i * 60}ms` }}
              >
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {statusIcon(project.status)}
                    <div>
                      <div className="font-semibold">{project.name}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        {new Date(project.created_at).toLocaleDateString("ro-RO")}
                        {project.description && ` · ${project.description}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge>{STATUS_LABELS[project.status] || project.status}</Badge>
                    <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
