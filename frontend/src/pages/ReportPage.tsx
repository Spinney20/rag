import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download,
  AlertTriangle,
  Shield,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Ring } from "@/components/ui/Ring";
import { StackBar } from "@/components/ui/StackBar";
import { KPI } from "@/components/ui/KPI";
import { apiFetch } from "@/lib/api";
import { Analytics } from "@/lib/types";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Analytics>(`/projects/${id}/analytics`)
      .then(setAnalytics)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="page" style={{ display: "grid", placeItems: "center", height: "60vh" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--amber)" }} />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="page">
        <div className="callout warn">
          <AlertTriangle className="w-3.5 h-3.5" />
          <div>
            {error || "Nu există încă o evaluare finalizată pentru acest proiect."}
          </div>
        </div>
      </div>
    );
  }

  const total = analytics.total_evaluated;
  const conform = analytics.verdict_distribution["CONFORM"] || 0;
  const neconform = analytics.verdict_distribution["NECONFORM"] || 0;
  const partial = analytics.verdict_distribution["PARTIAL"] || 0;
  const insuf = analytics.verdict_distribution["INSUFFICIENT_DATA"] || 0;

  // Compliance: conform + half-credit for partial
  const compliance = total > 0 ? Math.round(((conform + partial * 0.5) / total) * 100) : 0;
  const ringColor =
    compliance >= 90
      ? "var(--conform)"
      : compliance >= 75
      ? "var(--partial)"
      : "var(--neconform)";

  const healthOK = analytics.health_warnings.length === 0;

  return (
    <div className="page fadein">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ETAPA 4 · RAPORT EXECUTIV ·{" "}
            <span style={{ color: "var(--amber-ink)" }}>FINALIZAT</span>
          </div>
          <div className="h1">Raport Conformitate</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
            Generat {new Date().toLocaleDateString("ro-RO")} · {total} cerințe evaluate
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button
            variant="primary"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() =>
              window.open(`${API_BASE}/api/projects/${id}/report/export`, "_blank")
            }
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* Headline panel */}
      <Panel>
        <div
          style={{
            padding: "28px 32px",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 40,
            alignItems: "center",
          }}
        >
          <Ring
            value={compliance / 100}
            size={168}
            stroke={10}
            color={ringColor}
            label={`${compliance}%`}
            sub="CONFORMITATE"
          />
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              SCOR GLOBAL
            </div>
            <div className="h2" style={{ marginBottom: 12, maxWidth: 620 }}>
              Propunerea Tehnică acoperă{" "}
              <span style={{ color: "var(--amber-ink)" }}>{compliance}%</span> din cerințele Caietului de Sarcini
              {neconform > 0 && (
                <>
                  {" "}— cu{" "}
                  <span style={{ color: "var(--neconform-ink)" }}>
                    {neconform} neconformitate{neconform === 1 ? "" : "i"}
                  </span>{" "}
                  identificate
                </>
              )}
              {partial > 0 && (
                <>
                  {" "}și{" "}
                  <span style={{ color: "var(--partial)" }}>
                    {partial} parțial{partial === 1 ? "ă" : "e"}
                  </span>
                </>
              )}
              .
            </div>

            <div style={{ margin: "20px 0 10px" }}>
              <StackBar
                parts={
                  total
                    ? [
                        { pct: conform / total, color: "var(--conform)", label: "Conform" },
                        { pct: partial / total, color: "var(--partial)", label: "Parțial" },
                        { pct: insuf / total, color: "var(--insuf)", label: "Insuficient" },
                        { pct: neconform / total, color: "var(--neconform)", label: "Neconform" },
                      ]
                    : []
                }
              />
              <div
                style={{
                  display: "flex",
                  gap: 18,
                  marginTop: 10,
                  flexWrap: "wrap",
                  fontSize: 12,
                }}
              >
                <LegendDot color="var(--conform)" label={`Conform · ${conform}`} />
                <LegendDot color="var(--partial)" label={`Parțial · ${partial}`} />
                <LegendDot color="var(--insuf)" label={`Insuficient · ${insuf}`} />
                <LegendDot color="var(--neconform)" label={`Neconform · ${neconform}`} />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Health KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginTop: 18,
        }}
      >
        <KPI
          eyebrow="CITATE VERIFICATE"
          value={`${(analytics.quote_verification_rate * 100).toFixed(1)}%`}
          sub="re-regăsite în PT sursă"
          accent={analytics.quote_verification_rate >= 0.85 ? "var(--conform)" : "var(--partial)"}
        />
        <KPI
          eyebrow="DE REVIZUIT"
          value={analytics.needs_review_count}
          sub="încredere LLM scăzută"
          accent={analytics.needs_review_count === 0 ? "var(--conform)" : "var(--partial)"}
        />
        <KPI
          eyebrow="ERORI EVALUARE"
          value={analytics.error_count}
          sub="eșecuri de procesare"
          accent={analytics.error_count === 0 ? "var(--conform)" : "var(--neconform-ink)"}
        />
        <KPI
          eyebrow="CONFIDENȚĂ MEDIE"
          value={`${(analytics.avg_confidence * 100).toFixed(0)}%`}
          sub="medie pe cerințe"
        />
      </div>

      {/* Health validation banner */}
      {healthOK ? (
        <div
          className="callout ok"
          style={{ marginTop: 18 }}
        >
          <Shield className="w-3.5 h-3.5" />
          <div>
            <strong>Raport validat.</strong> Toți indicatorii de sănătate sunt în parametri normali —{" "}
            <span className="mono">{(analytics.quote_verification_rate * 100).toFixed(1)}%</span>{" "}
            din citate au fost re-verificate cu succes în documentul sursă. Raportul poate fi
            folosit în procesul de decizie.
          </div>
        </div>
      ) : (
        <div className="callout warn" style={{ marginTop: 18 }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          <div>
            <strong>Atenție:</strong> rezultatele pot necesita revizuire manuală.
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              {analytics.health_warnings.map((w, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div
        style={{
          marginTop: 26,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div className="eyebrow" style={{ flex: 1 }}>
          DETALII
        </div>
        <Button
          icon={<ArrowRight className="w-3.5 h-3.5" />}
          onClick={() => navigate(`/projects/${id}/evaluation`)}
        >
          Deschide rezultatele detaliate
        </Button>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 36,
          paddingTop: 18,
          borderTop: "1px solid var(--line-0)",
          display: "flex",
          gap: 18,
          fontSize: 11,
          color: "var(--ink-3)",
          fontFamily: "var(--ff-mono)",
          flexWrap: "wrap",
        }}
      >
        <span>{total} cerințe evaluate</span>
        <span>·</span>
        <span>Confidență medie {(analytics.avg_confidence * 100).toFixed(1)}%</span>
        <span>·</span>
        <span>{analytics.health_warnings.length} avertisment{analytics.health_warnings.length === 1 ? "" : "e"}</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--ink-1)",
      }}
    >
      <span
        style={{ width: 8, height: 8, borderRadius: 2, background: color, flex: "0 0 auto" }}
      />
      {label}
    </span>
  );
}
