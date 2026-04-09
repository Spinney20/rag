import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, AlertTriangle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Analytics } from "@/lib/types";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Analytics>(`/projects/${id}/analytics`).then(setAnalytics).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-screen"><div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  if (!analytics) return <div className="p-8 text-center text-[var(--text-secondary)]">Nu există evaluări completate</div>;

  const total = analytics.total_evaluated;
  const conformRate = total > 0 ? ((analytics.verdict_distribution["CONFORM"] || 0) / total * 100) : 0;
  const bars = [
    { k: "CONFORM", l: "Conform", c: "var(--conform)", v: analytics.verdict_distribution["CONFORM"] || 0 },
    { k: "NECONFORM", l: "Neconform", c: "var(--neconform)", v: analytics.verdict_distribution["NECONFORM"] || 0 },
    { k: "PARTIAL", l: "Parțial", c: "var(--partial)", v: analytics.verdict_distribution["PARTIAL"] || 0 },
    { k: "INSUFFICIENT_DATA", l: "Insuficient", c: "var(--insufficient)", v: analytics.verdict_distribution["INSUFFICIENT_DATA"] || 0 },
  ];
  const API_BASE = import.meta.env.VITE_API_URL || "";

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 anim-fade-up">
        <Link to={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"><ArrowLeft className="w-3.5 h-3.5" /> Proiect</Link>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Raport Conformitate</h1>
          <Button variant="secondary" onClick={() => window.open(`${API_BASE}/api/projects/${id}/report/export`, "_blank")}><Download className="w-4 h-4" /> Export PDF</Button>
        </div>
      </div>

      {/* Compliance Score */}
      <Card accent className="mb-6 anim-fade-up" style={{ animationDelay: "50ms" }}>
        <CardBody className="py-10 text-center">
          <div className="text-5xl font-bold mono tracking-tighter" style={{ color: conformRate >= 80 ? "var(--conform)" : conformRate >= 50 ? "var(--partial)" : "var(--neconform)" }}>
            {conformRate.toFixed(0)}%
          </div>
          <div className="text-sm text-[var(--text-secondary)] mt-2">Rată Conformitate</div>
          <div className="mono text-[11px] text-[var(--text-muted)] mt-1">{total} cerințe · confidență {(analytics.avg_confidence * 100).toFixed(0)}%</div>
        </CardBody>
      </Card>

      {/* Distribution */}
      <Card className="mb-6 anim-fade-up" style={{ animationDelay: "100ms" }}>
        <CardHeader><span className="label-xs">Distribuție Verdicte</span></CardHeader>
        <CardBody className="space-y-3">
          {bars.map((b) => (
            <div key={b.k} className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--text-secondary)] w-20">{b.l}</span>
              <div className="flex-1 h-5 bg-[var(--bg-void)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${total > 0 ? (b.v / total * 100) : 0}%`, background: b.c, opacity: 0.7 }} />
              </div>
              <span className="mono text-sm font-bold w-8 text-right" style={{ color: b.c }}>{b.v}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Warnings */}
      {analytics.health_warnings.length > 0 && (
        <Card className="mb-6 anim-fade-up" style={{ animationDelay: "150ms" }}>
          <CardHeader><span className="label-xs text-[var(--partial)] flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Avertismente</span></CardHeader>
          <CardBody className="space-y-2">
            {analytics.health_warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]"><AlertTriangle className="w-3.5 h-3.5 text-[var(--partial)] mt-0.5 shrink-0" />{w}</div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 anim-fade-up" style={{ animationDelay: "200ms" }}>
        {[{ l: "Citate verificate", v: `${(analytics.quote_verification_rate * 100).toFixed(0)}%` }, { l: "Review necesar", v: analytics.needs_review_count }, { l: "Erori", v: analytics.error_count }].map((m) => (
          <Card key={m.l}><CardBody className="py-3 text-center"><div className="text-lg font-bold mono">{m.v}</div><div className="label-xs">{m.l}</div></CardBody></Card>
        ))}
      </div>
    </div>
  );
}
