"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Zap, AlertCircle, CheckCircle2, XCircle, HelpCircle,
  ChevronDown, ChevronUp, Quote, Shield, AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Project, EvaluationRun, EvaluationResult, VERDICT_CONFIG } from "@/lib/types";
import clsx from "clsx";

type Tab = "probleme" | "verificat" | "conform";

export default function EvaluationPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [estimate, setEstimate] = useState<{
    filtered_requirements: number;
    estimated_cost_usd: number;
    estimated_duration_minutes: number;
  } | null>(null);
  const [showEstimate, setShowEstimate] = useState(false);
  const launchGuard = useRef(false);
  const fetchingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<Tab>("probleme");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const proj = await apiFetch<Project>(`/projects/${projectId}`);
      setProject(proj);

      const runs = await apiFetch<EvaluationRun[]>(`/projects/${projectId}/evaluations/runs`);
      if (runs.length > 0) {
        const latestRun = runs[0];
        setRun(latestRun);

        if (latestRun.status === "completed" || latestRun.evaluated_count > 0) {
          const res = await apiFetch<{ results: EvaluationResult[] }>(
            `/projects/${projectId}/evaluations/runs/${latestRun.id}/results?limit=500`
          );
          setResults(res.results);
        }
      }
    } catch (err) { console.error(err); }
    setLoading(false);
    fetchingRef.current = false;
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Polling when running
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [run?.status, fetchData]);

  const evalConfig = {
    mode: "quick" as const,
    exclude_verification_types: ["unverifiable"],
    only_priorities: ["obligatoriu", "recomandat"],
  };

  const handleEstimate = async () => {
    try {
      const est = await apiFetch<{
        filtered_requirements: number;
        estimated_cost_usd: number;
        estimated_duration_minutes: number;
      }>(`/projects/${projectId}/evaluations/estimate`, {
        method: "POST",
        body: JSON.stringify(evalConfig),
      });
      setEstimate(est);
      setShowEstimate(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLaunch = async () => {
    if (launchGuard.current) return;
    launchGuard.current = true;
    setLaunching(true);
    setShowEstimate(false);
    try {
      const newRun = await apiFetch<EvaluationRun>(`/projects/${projectId}/evaluations/run`, {
        method: "POST",
        body: JSON.stringify(evalConfig),
      });
      setRun(newRun);
    } catch (err: any) {
      alert(err.message);
    }
    setLaunching(false);
    launchGuard.current = false;
  };

  // Categorize results into tabs
  const probleme = results.filter(
    (r) => r.verdict === "NECONFORM" || r.verdict === "INSUFFICIENT_DATA"
  );
  const deVerificat = results.filter(
    (r) => r.verdict === "PARTIAL" || (r.needs_human_review && r.verdict === "CONFORM")
  );
  const conform = results.filter(
    (r) => r.verdict === "CONFORM" && !r.needs_human_review
  );

  const tabResults: Record<Tab, EvaluationResult[]> = {
    probleme,
    verificat: deVerificat,
    conform,
  };

  const VerdictIcon = ({ verdict }: { verdict: string }) => {
    switch (verdict) {
      case "CONFORM": return <CheckCircle2 className="w-4 h-4 text-[var(--conform)]" />;
      case "NECONFORM": return <XCircle className="w-4 h-4 text-[var(--neconform)]" />;
      case "PARTIAL": return <AlertTriangle className="w-4 h-4 text-[var(--partial)]" />;
      default: return <HelpCircle className="w-4 h-4 text-[var(--insufficient)]" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 animate-in">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Proiect
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Rezultate Evaluare</h1>
      </div>

      {/* No run yet — estimate then launch */}
      {!run && (
        <Card className="mb-6 animate-in gradient-border" style={{ animationDelay: "50ms" }}>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent-glow)] border border-[var(--accent)]/20 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-[var(--accent)]" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Lansează Evaluarea</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
              AI-ul va verifica fiecare cerință din Caietul de Sarcini împotriva Propunerii Tehnice
            </p>

            {/* Estimate display */}
            {showEstimate && estimate && (
              <div className="mb-6 p-4 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg max-w-sm mx-auto text-left">
                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  <div>
                    <div className="text-lg font-bold font-mono text-[var(--accent)]">{estimate.filtered_requirements}</div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase">Cerințe</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold font-mono text-[var(--accent)]">~{estimate.estimated_duration_minutes.toFixed(0)} min</div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase">Durată</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold font-mono text-[var(--accent)]">~${estimate.estimated_cost_usd.toFixed(2)}</div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase">Cost</div>
                  </div>
                </div>
                <Button onClick={handleLaunch} loading={launching} size="lg" className="w-full">
                  <Zap className="w-4 h-4" />
                  Confirmă și Lansează
                </Button>
              </div>
            )}

            {!showEstimate && (
              <Button onClick={handleEstimate} size="lg">
                <Zap className="w-4 h-4" />
                Estimează și Lansează
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Running indicator */}
      {run && run.status === "running" && (
        <Card className="mb-6 animate-in" style={{ animationDelay: "50ms" }}>
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[var(--accent)] pulse-glow" />
                <span className="text-sm font-medium">Evaluare în curs</span>
              </div>
              <span className="text-sm font-mono text-[var(--accent)]">
                {run.evaluated_count}/{run.total_requirements}
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-500 relative shimmer"
                style={{ width: `${run.total_requirements ? (run.evaluated_count / run.total_requirements * 100) : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-mono text-[var(--text-muted)]">
              <span>✓ {run.conform_count} conform</span>
              <span>✗ {run.neconform_count} neconform</span>
              <span>◐ {run.partial_count} parțial</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results summary */}
      {run && (run.status === "completed" || run.evaluated_count > 0) && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3 mb-6 animate-in" style={{ animationDelay: "100ms" }}>
            {[
              { label: "Conform", value: run.conform_count, color: "var(--conform)" },
              { label: "Neconform", value: run.neconform_count, color: "var(--neconform)" },
              { label: "Parțial", value: run.partial_count, color: "var(--partial)" },
              { label: "Insuficient", value: run.insufficient_count, color: "var(--insufficient)" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="py-3 text-center">
                  <div className="text-2xl font-bold font-mono" style={{ color: stat.color }}>{stat.value}</div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] animate-in" style={{ animationDelay: "150ms" }}>
            {([
              { key: "probleme" as Tab, label: "Probleme", count: probleme.length, icon: "🔴" },
              { key: "verificat" as Tab, label: "De verificat", count: deVerificat.length, icon: "🟡" },
              { key: "conform" as Tab, label: "Conform", count: conform.length, icon: "✅" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all",
                  activeTab === tab.key
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className="text-[10px] font-mono opacity-60">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Results list */}
          <div className="space-y-2">
            {tabResults[activeTab].length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-[var(--text-muted)]">
                  Niciun rezultat în această categorie
                </CardContent>
              </Card>
            ) : (
              tabResults[activeTab].map((result, i) => {
                const isExpanded = expandedId === result.id;
                const config = VERDICT_CONFIG[result.verdict];
                return (
                  <Card
                    key={result.id}
                    className="animate-in"
                    style={{ animationDelay: `${200 + i * 30}ms` }}
                  >
                    {/* Summary row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : result.id)}
                      className="w-full text-left"
                    >
                      <CardContent className="flex items-start gap-3 py-3">
                        <VerdictIcon verdict={result.verdict} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-relaxed">{(result.reasoning || "").split("\n")[0].slice(0, 200)}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={clsx("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded", config?.class)}>
                              {config?.label}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              conf: {(result.confidence_score * 100).toFixed(0)}%
                            </span>
                            {result.needs_human_review && (
                              <Badge variant="review" size="sm">Review</Badge>
                            )}
                            {!result.all_quotes_verified && (
                              <Badge variant="neconform" size="sm">Citate neverificate</Badge>
                            )}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        )}
                      </CardContent>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border)] px-5 py-4 space-y-4 bg-[var(--bg-primary)]">
                        {/* Full reasoning */}
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                            Raționament
                          </h4>
                          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
                            {result.reasoning}
                          </p>
                        </div>

                        {/* Quotes */}
                        {result.proposal_quotes.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Quote className="w-3 h-3" />
                              Citate din PT
                            </h4>
                            <div className="space-y-2">
                              {result.proposal_quotes.map((q, qi) => (
                                <div
                                  key={qi}
                                  className="pl-3 border-l-2 border-[var(--accent)]/40 text-sm text-[var(--text-secondary)] italic"
                                >
                                  &ldquo;{q.quote}&rdquo;
                                  <span className="block text-[10px] font-mono text-[var(--text-muted)] mt-1 not-italic">
                                    Fragment #{q.fragment_number} — {q.relevance}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Covered / Missing */}
                        <div className="grid grid-cols-2 gap-4">
                          {result.covered_aspects.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-[var(--conform)] uppercase tracking-wider mb-2">
                                Acoperit ✓
                              </h4>
                              <ul className="space-y-1">
                                {result.covered_aspects.map((a, ai) => (
                                  <li key={ai} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                                    <CheckCircle2 className="w-3 h-3 text-[var(--conform)] mt-0.5 shrink-0" />
                                    {a}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {result.missing_aspects.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-[var(--neconform)] uppercase tracking-wider mb-2">
                                Lipsește ✗
                              </h4>
                              <ul className="space-y-1">
                                {result.missing_aspects.map((a, ai) => (
                                  <li key={ai} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                                    <XCircle className="w-3 h-3 text-[var(--neconform)] mt-0.5 shrink-0" />
                                    {a}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
