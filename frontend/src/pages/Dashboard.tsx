import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowRight, Search, Folder, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { KPI } from "@/components/ui/KPI";
import { Tabs } from "@/components/ui/Tabs";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiFetch } from "@/lib/api";
import { Project } from "@/lib/types";

type Filter = "all" | "running" | "warn" | "done";

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/projects")
      .then((d) => setProjects(d.projects))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const running = projects.filter(
      (p) => p.status === "processing" || p.status === "evaluation_running"
    ).length;
    const done = projects.filter(
      (p) => p.status === "evaluated" || p.status === "completed"
    ).length;
    const warn = projects.filter((p) => p.status === "error").length;
    return { all: projects.length, running, warn, done };
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filter === "running" && p.status !== "processing" && p.status !== "evaluation_running") return false;
      if (filter === "warn" && p.status !== "error") return false;
      if (filter === "done" && p.status !== "evaluated" && p.status !== "completed") return false;
      if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [projects, filter, query]);

  return (
    <div className="page fadein">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 28 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            VERIFICARE CONFORMITATE
          </div>
          <div className="h1">Proiecte</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 14, maxWidth: 620 }}>
            {counts.all === 0
              ? "Niciun proiect încă. Creează primul pentru a începe verificarea unei propuneri."
              : `${counts.all} proiect${counts.all === 1 ? "" : "e"} · ${counts.running} în procesare · ${counts.done} finalizat${counts.done === 1 ? "" : "e"}.`}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Button
            variant="primary"
            size="lg"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => navigate("/projects/new")}
          >
            Proiect nou
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}
      >
        <KPI eyebrow="TOTAL PROIECTE" value={counts.all} sub="Toate proiectele" />
        <KPI
          eyebrow="ÎN PROCESARE"
          value={counts.running}
          sub="Documente sau evaluare"
          accent="var(--amber)"
        />
        <KPI
          eyebrow="CU PROBLEME"
          value={counts.warn}
          sub="Erori de procesare"
          accent="var(--neconform-ink)"
        />
        <KPI
          eyebrow="FINALIZATE"
          value={counts.done}
          sub="Raport disponibil"
          accent="var(--conform)"
        />
      </div>

      {/* List */}
      <Panel>
        <div className="panel-header">
          <div className="h3">Toate proiectele</div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Tabs<Filter>
              value={filter}
              onChange={setFilter}
              items={[
                { key: "all",     label: "Toate",         count: counts.all },
                { key: "running", label: "Procesare",     count: counts.running },
                { key: "warn",    label: "Cu probleme",   count: counts.warn },
                { key: "done",    label: "Finalizate",    count: counts.done },
              ]}
            />
            <div style={{ position: "relative" }}>
              <Search
                className="w-3.5 h-3.5"
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-3)",
                  pointerEvents: "none",
                }}
              />
              <input
                className="input"
                placeholder="Caută proiect..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: 220, padding: "7px 12px 7px 30px", fontSize: 12.5 }}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div
            role="status"
            aria-label="Se încarcă"
            style={{ padding: 60, display: "grid", placeItems: "center" }}
          >
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--amber)" }} />
          </div>
        ) : error ? (
          <div style={{ padding: 40 }}>
            <div className="callout err">
              <AlertTriangle className="w-3.5 h-3.5" />
              <div>
                Nu am putut încărca proiectele: <span className="mono">{error}</span>
              </div>
            </div>
          </div>
        ) : filtered.length === 0 && projects.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon={<Folder className="w-5 h-5" />}
              title="Niciun proiect"
              description="Creează primul proiect pentru a verifica o propunere tehnică."
              action={
                <Button
                  variant="primary"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => navigate("/projects/new")}
                >
                  Creează proiect
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon={<Search className="w-5 h-5" />}
              title="Niciun rezultat"
              description="Niciun proiect nu corespunde filtrelor curente."
              action={
                <Button
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Resetează filtrele
                </Button>
              }
            />
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "44%" }}>Proiect</th>
                <th style={{ width: 200 }}>Status</th>
                <th style={{ width: 140 }}>Creat</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="clickable"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <td>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: "var(--ink-0)",
                        marginBottom: 3,
                      }}
                    >
                      {p.name}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.description}</div>
                    )}
                  </td>
                  <td>
                    <StatusChip status={p.status} />
                  </td>
                  <td className="mono num dim" style={{ fontSize: 12 }}>
                    {new Date(p.created_at).toLocaleDateString("ro-RO")}
                  </td>
                  <td>
                    <ArrowRight className="w-3.5 h-3.5 dim" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
