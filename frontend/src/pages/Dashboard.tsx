import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FolderOpen, ArrowRight, Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Project, STATUS_MAP } from "@/lib/types";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/projects")
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const inProgress = projects.filter((p) => !["created", "completed"].includes(p.status)).length;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-10 anim-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Verificare conformitate propuneri tehnice</p>
        </div>
        <Link to="/projects/new">
          <Button size="lg"><Plus className="w-4 h-4" /> Proiect Nou</Button>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Proiecte", value: projects.length, icon: FolderOpen, color: "var(--accent)" },
          { label: "În lucru", value: inProgress, icon: Activity, color: "var(--partial)" },
          { label: "Avertismente", value: 0, icon: AlertTriangle, color: "var(--text-muted)" },
        ].map((m, i) => (
          <Card key={m.label} className="anim-fade-up" style={{ animationDelay: `${100 + i * 60}ms` }}>
            <CardBody className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `color-mix(in srgb, ${m.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${m.color} 20%, transparent)` }}>
                <m.icon className="w-5 h-5" style={{ color: m.color }} />
              </div>
              <div>
                <div className="text-2xl font-bold mono">{m.value}</div>
                <div className="label-xs">{m.label}</div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <Card className="anim-fade-up" style={{ animationDelay: "200ms" }}>
          <CardBody className="py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-[var(--neconform)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </CardBody>
        </Card>
      ) : projects.length === 0 ? (
        <Card accent className="anim-fade-up" style={{ animationDelay: "200ms" }}>
          <CardBody className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-7 h-7 text-[var(--text-muted)]" />
            </div>
            <h3 className="text-base font-semibold mb-1">Niciun proiect</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">Creează primul proiect pentru a verifica o propunere tehnică</p>
            <Link to="/projects/new"><Button><Plus className="w-4 h-4" /> Creează Proiect</Button></Link>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {projects.map((p, i) => {
            const st = STATUS_MAP[p.status] || { label: p.status, color: "var(--text-muted)" };
            return (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card hover className="anim-fade-up" style={{ animationDelay: `${200 + i * 40}ms` }}>
                  <CardBody className="flex items-center justify-between py-3.5">
                    <div className="flex items-center gap-3">
                      {p.status === "evaluated" || p.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--conform)]" />
                      ) : p.status === "processing" ? (
                        <Clock className="w-4 h-4 text-[var(--accent)] animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-[var(--border)]" />
                      )}
                      <div>
                        <span className="text-sm font-semibold">{p.name}</span>
                        <span className="block text-[11px] text-[var(--text-muted)] mono mt-0.5">
                          {new Date(p.created_at).toLocaleDateString("ro-RO")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{st.label}</Badge>
                      <ArrowRight className="w-4 h-4 text-[var(--text-ghost)]" />
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
