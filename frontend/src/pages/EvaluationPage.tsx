import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Zap, CheckCircle2, XCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, Quote } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { EvaluationRun, EvaluationResult } from "@/lib/types";
import clsx from "clsx";

type Tab = "probleme" | "verificat" | "conform";

const VERDICT_ICON: Record<string, React.ReactNode> = {
  CONFORM: <CheckCircle2 className="w-4 h-4 text-[var(--conform)]" />,
  NECONFORM: <XCircle className="w-4 h-4 text-[var(--neconform)]" />,
  PARTIAL: <AlertTriangle className="w-4 h-4 text-[var(--partial)]" />,
  INSUFFICIENT_DATA: <HelpCircle className="w-4 h-4 text-[var(--insufficient)]" />,
};
const VERDICT_CLASS: Record<string, string> = {
  CONFORM: "verdict-conform", NECONFORM: "verdict-neconform", PARTIAL: "verdict-partial", INSUFFICIENT_DATA: "verdict-insufficient",
};

export default function EvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [estimate, setEstimate] = useState<{ filtered_requirements: number; estimated_cost_usd: number; estimated_duration_minutes: number } | null>(null);
  const [showEstimate, setShowEstimate] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("probleme");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const launchGuard = useRef(false);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const runs = await apiFetch<EvaluationRun[]>(`/projects/${id}/evaluations/runs`);
      if (runs.length > 0) {
        setRun(runs[0]);
        if (runs[0].evaluated_count > 0) {
          const r = await apiFetch<{ results: EvaluationResult[] }>(`/projects/${id}/evaluations/runs/${runs[0].id}/results?limit=500`);
          setResults(r.results);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
    fetchingRef.current = false;
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, [run?.status, fetchData]);

  const evalConfig = { mode: "quick" as const, exclude_verification_types: ["unverifiable"], only_priorities: ["obligatoriu", "recomandat"] };

  const handleEstimate = async () => {
    try {
      const e = await apiFetch<typeof estimate>(`/projects/${id}/evaluations/estimate`, { method: "POST", body: JSON.stringify(evalConfig) });
      setEstimate(e); setShowEstimate(true);
    } catch (e: any) { alert(e.message); }
  };

  const handleLaunch = async () => {
    if (launchGuard.current) return;
    launchGuard.current = true; setLaunching(true); setShowEstimate(false);
    try {
      const r = await apiFetch<EvaluationRun>(`/projects/${id}/evaluations/run`, { method: "POST", body: JSON.stringify(evalConfig) });
      setRun(r);
    } catch (e: any) { alert(e.message); }
    setLaunching(false); launchGuard.current = false;
  };

  const probleme = results.filter((r) => r.verdict === "NECONFORM" || r.verdict === "INSUFFICIENT_DATA");
  const deVerificat = results.filter((r) => r.verdict === "PARTIAL" || (r.needs_human_review && r.verdict === "CONFORM"));
  const conform = results.filter((r) => r.verdict === "CONFORM" && !r.needs_human_review);
  const tabs: Record<Tab, EvaluationResult[]> = { probleme, verificat: deVerificat, conform };

  if (loading) return <div className="flex justify-center items-center h-screen"><div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6 anim-fade-up">
        <Link to={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"><ArrowLeft className="w-3.5 h-3.5" /> Proiect</Link>
        <h1 className="text-xl font-bold tracking-tight">Rezultate Evaluare</h1>
      </div>

      {/* Launch */}
      {!run && (
        <Card accent className="mb-6 anim-fade-up" style={{ animationDelay: "50ms" }}>
          <CardBody className="py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-glow-strong)] border border-[var(--accent)]/15 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-7 h-7 text-[var(--accent)]" />
            </div>
            <h3 className="text-base font-semibold mb-1">Lansează Evaluarea</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">AI-ul verifică fiecare cerință din CS împotriva PT</p>
            {showEstimate && estimate ? (
              <div className="mb-5 p-4 bg-[var(--bg-void)] border border-[var(--border)] rounded-[var(--radius-lg)] max-w-xs mx-auto">
                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  <div><div className="text-lg font-bold mono text-[var(--accent)]">{estimate.filtered_requirements}</div><div className="label-xs">Cerințe</div></div>
                  <div><div className="text-lg font-bold mono text-[var(--accent)]">~{estimate.estimated_duration_minutes.toFixed(0)}m</div><div className="label-xs">Durată</div></div>
                  <div><div className="text-lg font-bold mono text-[var(--accent)]">${estimate.estimated_cost_usd.toFixed(2)}</div><div className="label-xs">Cost</div></div>
                </div>
                <Button onClick={handleLaunch} loading={launching} className="w-full"><Zap className="w-4 h-4" /> Confirmă</Button>
              </div>
            ) : (
              <Button onClick={handleEstimate} size="lg"><Zap className="w-4 h-4" /> Estimează și Lansează</Button>
            )}
          </CardBody>
        </Card>
      )}

      {/* Running */}
      {run?.status === "running" && (
        <Card className="mb-6 anim-fade-up" style={{ animationDelay: "50ms" }}>
          <CardBody className="py-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] pulse-live" /><span className="text-sm font-medium">Evaluare în curs</span></div>
              <span className="mono text-sm text-[var(--accent)]">{run.evaluated_count}/{run.total_requirements}</span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-teal-600 to-[var(--accent)] rounded-full transition-all duration-500 relative shimmer-bar"
                style={{ width: `${run.total_requirements ? (run.evaluated_count / run.total_requirements * 100) : 0}%` }} />
            </div>
            <div className="flex justify-between mt-2 mono text-[10px] text-[var(--text-muted)]">
              <span>✓ {run.conform_count}</span><span>✗ {run.neconform_count}</span><span>◐ {run.partial_count}</span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Results */}
      {run && run.evaluated_count > 0 && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[{ l: "Conform", v: run.conform_count, c: "var(--conform)" }, { l: "Neconform", v: run.neconform_count, c: "var(--neconform)" }, { l: "Parțial", v: run.partial_count, c: "var(--partial)" }, { l: "Insuficient", v: run.insufficient_count, c: "var(--insufficient)" }].map((s) => (
              <Card key={s.l}><CardBody className="py-2.5 text-center"><div className="text-xl font-bold mono" style={{ color: s.c }}>{s.v}</div><div className="label-xs">{s.l}</div></CardBody></Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 p-1 bg-[var(--bg-surface)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {([{ k: "probleme" as Tab, l: "Probleme", n: probleme.length, e: "🔴" }, { k: "verificat" as Tab, l: "De verificat", n: deVerificat.length, e: "🟡" }, { k: "conform" as Tab, l: "Conform", n: conform.length, e: "✅" }]).map((t) => (
              <button key={t.k} onClick={() => setActiveTab(t.k)}
                className={clsx("flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-[var(--radius-sm)] text-[13px] font-medium transition-all",
                  activeTab === t.k ? "bg-[var(--bg-floating)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
                <span>{t.e}</span><span>{t.l}</span><span className="mono text-[10px] opacity-50">({t.n})</span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-2">
            {tabs[activeTab].length === 0 ? (
              <Card><CardBody className="py-10 text-center text-[var(--text-muted)] text-sm">Niciun rezultat</CardBody></Card>
            ) : tabs[activeTab].map((r, i) => {
              const expanded = expandedId === r.id;
              return (
                <Card key={r.id} className="anim-fade-up" style={{ animationDelay: `${i * 20}ms` }}>
                  <button onClick={() => setExpandedId(expanded ? null : r.id)} className="w-full text-left">
                    <CardBody className="flex items-start gap-3 py-3">
                      {VERDICT_ICON[r.verdict]}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-relaxed">{(r.reasoning || "").split("\n")[0].slice(0, 200)}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={clsx("mono text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-sm)]", VERDICT_CLASS[r.verdict])}>{r.verdict}</span>
                          <span className="mono text-[10px] text-[var(--text-muted)]">{(r.confidence_score * 100).toFixed(0)}%</span>
                          {r.needs_human_review && <Badge variant="review">Review</Badge>}
                          {!r.all_quotes_verified && <Badge variant="neconform">Citate neverif.</Badge>}
                        </div>
                      </div>
                      {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                    </CardBody>
                  </button>
                  {expanded && (
                    <div className="border-t border-[var(--border)] px-5 py-4 space-y-4 bg-[var(--bg-void)]">
                      <div><h4 className="label-xs mb-2">Raționament</h4><p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">{r.reasoning}</p></div>
                      {r.proposal_quotes.length > 0 && (
                        <div><h4 className="label-xs mb-2 flex items-center gap-1"><Quote className="w-3 h-3" /> Citate PT</h4>
                          {r.proposal_quotes.map((q, qi) => (
                            <div key={qi} className="pl-3 border-l-2 border-[var(--accent)]/30 text-[13px] text-[var(--text-secondary)] italic mb-2">
                              „{q.quote}" <span className="block mono text-[10px] text-[var(--text-muted)] mt-0.5 not-italic">Fragment #{q.fragment_number}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {r.covered_aspects.length > 0 && <div><h4 className="label-xs text-[var(--conform)] mb-1.5">Acoperit</h4>{r.covered_aspects.map((a, ai) => <div key={ai} className="flex items-start gap-1.5 text-[12px] text-[var(--text-secondary)] mb-0.5"><CheckCircle2 className="w-3 h-3 text-[var(--conform)] mt-0.5 shrink-0" />{a}</div>)}</div>}
                        {r.missing_aspects.length > 0 && <div><h4 className="label-xs text-[var(--neconform)] mb-1.5">Lipsește</h4>{r.missing_aspects.map((a, ai) => <div key={ai} className="flex items-start gap-1.5 text-[12px] text-[var(--text-secondary)] mb-0.5"><XCircle className="w-3 h-3 text-[var(--neconform)] mt-0.5 shrink-0" />{a}</div>)}</div>}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
