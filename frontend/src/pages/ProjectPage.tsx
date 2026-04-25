import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FileText,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Download,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { apiFetch } from "@/lib/api";
import {
  Project,
  Document,
  DOC_TYPE_SHORT,
  DOC_TYPES,
  PIPELINE_STAGES,
  statusToStageIndex,
} from "@/lib/types";

type StageState = "idle" | "active" | "done";

/**
 * Map a project status to the visual state of each of the 4 pipeline steps.
 *
 * "active" = stage is in progress (motor running)
 * "done"   = stage finished
 * "idle"   = stage is the next one but waiting for user (or hasn't been reached)
 *
 * Crucially: when the project is at "documents_ready", the Documents stage
 * is DONE but Cerinte is IDLE (awaiting "Extrage cerinte" click) — not done.
 */
function buildStageStates(status: string): StageState[] {
  switch (status) {
    case "created":
    case "processing":
      return ["active", "idle", "idle", "idle"];
    case "documents_ready":
      return ["done", "idle", "idle", "idle"];
    case "requirements_extracted":
    case "requirements_validated":
      return ["done", "done", "idle", "idle"];
    case "evaluation_running":
      return ["done", "done", "active", "idle"];
    case "evaluated":
    case "completed":
      return ["done", "done", "done", "done"];
    case "error":
      return ["active", "idle", "idle", "idle"];
    default:
      return ["idle", "idle", "idle", "idle"];
  }
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Single effect: fetches project + docs on mount and on id change, polls
  // every 3s while the backend is doing async work, stops polling when it
  // settles. Collapsed from two effects so `id` is in deps and we don't
  // get a stale-closure interval if the user navigates between two
  // projects with the same status.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const [p, d] = await Promise.all([
          apiFetch<Project>(`/projects/${id}`),
          apiFetch<{ documents: Document[] }>(`/projects/${id}/documents`),
        ]);
        if (cancelled) return;
        setProject(p);
        setDocs(d.documents);

        const isProcessing =
          p.status === "processing" || p.status === "evaluation_running";
        if (isProcessing && !interval) {
          interval = setInterval(tick, 3000);
        } else if (!isProcessing && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id]);

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Se încarcă proiectul"
        className="page"
        style={{ display: "grid", placeItems: "center", height: "60vh" }}
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--amber)" }} />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="page">
        <div className="callout err">
          <AlertTriangle className="w-3.5 h-3.5" />
          Proiect negăsit.
        </div>
      </div>
    );
  }

  const stageStates = buildStageStates(project.status);

  const primary = (() => {
    switch (project.status) {
      case "documents_ready":
        return {
          label: "Extrage cerințele",
          icon: <Sparkles className="w-3.5 h-3.5" />,
          onClick: () => navigate(`/projects/${id}/requirements`),
        };
      case "requirements_extracted":
      case "requirements_validated":
        return {
          label: "Revizuiește cerințele",
          icon: <ArrowRight className="w-3.5 h-3.5" />,
          onClick: () => navigate(`/projects/${id}/requirements`),
        };
      case "evaluation_running":
        return {
          label: "Vezi progresul evaluării",
          icon: <ArrowRight className="w-3.5 h-3.5" />,
          onClick: () => navigate(`/projects/${id}/evaluation`),
        };
      case "evaluated":
      case "completed":
        return {
          label: "Vezi rezultatele",
          icon: <ArrowRight className="w-3.5 h-3.5" />,
          onClick: () => navigate(`/projects/${id}/evaluation`),
        };
      default:
        return null;
    }
  })();

  const docCount = docs.length;
  const headingTotal = docs.reduce((sum, d) => sum + (d.heading_count || 0), 0);

  return (
    <div className="page fadein">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            PROIECT ·{" "}
            <span className="mono" style={{ color: "var(--amber-ink)" }}>
              {project.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="h1" style={{ wordBreak: "break-word" }}>{project.name}</div>
          {project.description && (
            <div className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
              {project.description}
            </div>
          )}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 18,
              fontSize: 12.5,
              color: "var(--ink-2)",
              flexWrap: "wrap",
            }}
          >
            <span>
              Creat ·{" "}
              <span className="mono" style={{ color: "var(--ink-1)" }}>
                {new Date(project.created_at).toLocaleDateString("ro-RO")}
              </span>
            </span>
            <span>
              Actualizat ·{" "}
              <span className="mono" style={{ color: "var(--ink-1)" }}>
                {new Date(project.updated_at).toLocaleDateString("ro-RO")}
              </span>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {(project.status === "evaluated" || project.status === "completed") && (
            <Button
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={() => navigate(`/projects/${id}/report`)}
            >
              Vezi raportul
            </Button>
          )}
          {primary && (
            <Button variant="primary" icon={primary.icon} onClick={primary.onClick}>
              {primary.label}
            </Button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          PIPELINE PROCESARE
        </div>
        <div className="stepper">
          {PIPELINE_STAGES.map((st, i) => {
            const state = stageStates[i];
            return (
              <div key={st.key} className={clsx("step", state)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="step-num">
                    {state === "done" ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
                  </div>
                  <div className="step-label">ETAPA {i + 1}</div>
                </div>
                <div className="step-title">{st.label}</div>
                <div className="step-sub">{st.sub}</div>
                {state === "active" && (
                  <div style={{ marginTop: 12 }}>
                    <Meter value={0.55} shimmer />
                    <div
                      className="mono"
                      style={{
                        fontSize: 10.5,
                        color: "var(--amber)",
                        marginTop: 6,
                        letterSpacing: "0.08em",
                      }}
                    >
                      ÎN PROGRES
                    </div>
                  </div>
                )}
                {state === "done" && (
                  <div
                    className="mono"
                    style={{
                      fontSize: 10.5,
                      color: "var(--conform)",
                      marginTop: 12,
                      letterSpacing: "0.08em",
                    }}
                  >
                    ✓ FINALIZAT
                  </div>
                )}
                {state === "idle" && (
                  <div
                    className="mono dim"
                    style={{ fontSize: 10.5, marginTop: 12, letterSpacing: "0.08em" }}
                  >
                    ÎN AȘTEPTARE
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Documents + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <Panel
          title="Documente sursă"
          eyebrow={`${docCount} FIȘIER${docCount === 1 ? "" : "E"}`}
        >
          {docs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div className="muted" style={{ fontSize: 13 }}>
                Niciun document încărcat încă.
              </div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Tip</th>
                  <th>Fișier</th>
                  <th style={{ width: 90 }}>Dim.</th>
                  <th style={{ width: 90 }}>Titluri</th>
                  <th style={{ width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Badge variant={d.doc_type === "propunere_tehnica" ? "amber" : "default"}>
                        {DOC_TYPE_SHORT[d.doc_type] || d.doc_type}
                      </Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <FileText className="w-3.5 h-3.5 dim" style={{ flex: "0 0 auto" }} />
                        <span
                          className="mono"
                          style={{
                            fontSize: 12,
                            color: "var(--ink-0)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={`${d.original_filename} · ${DOC_TYPES[d.doc_type]}`}
                        >
                          {d.original_filename}
                        </span>
                      </div>
                    </td>
                    <td className="mono num dim" style={{ fontSize: 11.5 }}>
                      {d.file_size_bytes ? `${(d.file_size_bytes / 1e6).toFixed(1)} MB` : "—"}
                    </td>
                    <td className="mono num" style={{ fontSize: 12, color: "var(--ink-1)" }}>
                      {d.heading_count ?? "—"}
                    </td>
                    <td>
                      {d.processing_status === "ready" ? (
                        <Badge variant="conform" dot>
                          Indexat
                        </Badge>
                      ) : d.processing_status === "error" ? (
                        <Badge variant="neconform" dot>
                          Eroare
                        </Badge>
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--amber)" }} />
                          <span
                            className="mono"
                            style={{ fontSize: 10.5, color: "var(--amber)", letterSpacing: "0.06em", textTransform: "uppercase" }}
                          >
                            {d.processing_status}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Context" eyebrow="STARE PROIECT">
            <div
              style={{
                padding: "6px 18px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div>
                <div className="label" style={{ marginBottom: 4 }}>
                  ETAPA CURENTĂ
                </div>
                <div style={{ fontSize: 14, color: "var(--ink-0)" }}>
                  {PIPELINE_STAGES[statusToStageIndex(project.status)].label}
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 4 }}>
                  DOCUMENTE
                </div>
                <div className="num mono" style={{ fontSize: 22, color: "var(--ink-0)" }}>
                  {docCount}
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 4 }}>
                  TITLURI DETECTATE
                </div>
                <div className="num mono" style={{ fontSize: 22, color: "var(--ink-0)" }}>
                  {headingTotal || "—"}
                </div>
              </div>
            </div>
          </Panel>

          {docs.some((d) => d.processing_warning) && (
            <Panel title="Avertismente" eyebrow="PROCESARE">
              <div
                style={{
                  padding: "6px 18px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {docs
                  .filter((d) => d.processing_warning)
                  .map((d) => (
                    <div key={d.id} className="callout warn">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <div style={{ fontSize: 12 }}>
                        <span className="mono" style={{ color: "var(--ink-0)" }}>
                          {d.original_filename}
                        </span>
                        <div style={{ marginTop: 2 }}>{d.processing_warning}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
