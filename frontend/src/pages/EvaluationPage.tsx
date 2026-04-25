import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Bolt,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  AlertTriangle,
  HelpCircle,
  Quote as QuoteIcon,
  Loader2,
  RefreshCw,
  Gauge,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { KPI } from "@/components/ui/KPI";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { Meter } from "@/components/ui/Meter";
import { Quote } from "@/components/ui/Quote";
import { apiFetch } from "@/lib/api";
import { EvaluationRun, EvaluationResult, Requirement } from "@/lib/types";

type Tab = "problems" | "review" | "conform";

interface CostEstimate {
  filtered_requirements: number;
  estimated_cost_usd: number;
  estimated_duration_minutes: number;
  total_requirements: number;
}

const VERDICT_COLOR: Record<string, string> = {
  CONFORM: "var(--conform)",
  NECONFORM: "var(--neconform-ink)",
  PARTIAL: "var(--partial)",
  INSUFFICIENT_DATA: "var(--ink-2)",
};

function VerdictGlyph({ verdict, size = 14 }: { verdict: string; size?: number }) {
  const color = VERDICT_COLOR[verdict] || "var(--ink-2)";
  const Icon =
    verdict === "CONFORM"
      ? Check
      : verdict === "NECONFORM"
      ? X
      : verdict === "PARTIAL"
      ? AlertTriangle
      : HelpCircle;
  return (
    <div
      style={{
        width: size + 10,
        height: size + 10,
        borderRadius: 4,
        display: "grid",
        placeItems: "center",
        background: `color-mix(in oklch, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
        color,
        flex: "0 0 auto",
      }}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
    </div>
  );
}

export default function EvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [reqMap, setReqMap] = useState<Record<string, Requirement>>({});
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [showEstimate, setShowEstimate] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("problems");
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
          const r = await apiFetch<{ results: EvaluationResult[] }>(
            `/projects/${id}/evaluations/runs/${runs[0].id}/results?limit=500`
          );
          setResults(r.results);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    fetchingRef.current = false;
  }, [id]);

  // Fetch requirements once for expanded-card text lookup
  useEffect(() => {
    apiFetch<{ requirements: Requirement[] }>(`/projects/${id}/requirements?limit=500`)
      .then((d) => {
        const map: Record<string, Requirement> = {};
        d.requirements.forEach((r) => {
          map[r.id] = r;
        });
        setReqMap(map);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "pending")) return;
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, [run?.status, fetchData]);

  const evalConfig = useMemo(
    () => ({
      mode: "quick" as const,
      exclude_verification_types: ["unverifiable"],
      only_priorities: ["obligatoriu", "recomandat"],
    }),
    []
  );

  const handleEstimate = async () => {
    try {
      const e = await apiFetch<CostEstimate>(`/projects/${id}/evaluations/estimate`, {
        method: "POST",
        body: JSON.stringify(evalConfig),
      });
      setEstimate(e);
      setShowEstimate(true);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleLaunch = async () => {
    if (launchGuard.current) return;
    launchGuard.current = true;
    setLaunching(true);
    setShowEstimate(false);
    try {
      const r = await apiFetch<EvaluationRun>(`/projects/${id}/evaluations/run`, {
        method: "POST",
        body: JSON.stringify(evalConfig),
      });
      setRun(r);
    } catch (e) {
      alert((e as Error).message);
    }
    setLaunching(false);
    launchGuard.current = false;
  };

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (activeTab === "problems")
        return r.verdict === "NECONFORM" || r.verdict === "PARTIAL";
      if (activeTab === "review")
        return r.verdict === "INSUFFICIENT_DATA" || r.needs_human_review || !r.all_quotes_verified;
      if (activeTab === "conform")
        return r.verdict === "CONFORM" && !r.needs_human_review;
      return true;
    });
  }, [results, activeTab]);

  const recentResults = useMemo(
    () => [...results].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    [results]
  );

  if (loading) {
    return (
      <div className="page" style={{ display: "grid", placeItems: "center", height: "60vh" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--amber)" }} />
      </div>
    );
  }

  const phase: "prelaunch" | "running" | "results" =
    !run
      ? "prelaunch"
      : run.status === "running" || run.status === "pending"
      ? "running"
      : "results";

  const totals = run
    ? {
        conform: run.conform_count,
        neconform: run.neconform_count,
        partial: run.partial_count,
        insuf: run.insufficient_count,
      }
    : { conform: 0, neconform: 0, partial: 0, insuf: 0 };
  const totalAll = totals.conform + totals.neconform + totals.partial + totals.insuf;

  return (
    <div className="page fadein">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ETAPA 3 · EVALUARE AI ·{" "}
            <span style={{ color: "var(--amber-ink)" }}>{phase.toUpperCase()}</span>
          </div>
          <div className="h1">
            {phase === "prelaunch" && "Pregătește evaluarea"}
            {phase === "running" && "Evaluare în desfășurare"}
            {phase === "results" && "Rezultate evaluare"}
          </div>
        </div>
      </div>

      {phase === "prelaunch" && (
        <PrelaunchView
          showEstimate={showEstimate}
          estimate={estimate}
          launching={launching}
          onEstimate={handleEstimate}
          onLaunch={handleLaunch}
        />
      )}

      {phase === "running" && run && (
        <RunningView run={run} recent={recentResults} reqMap={reqMap} />
      )}

      {phase === "results" && run && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
              marginBottom: 24,
            }}
          >
            <KPI
              eyebrow="CONFORM"
              value={totals.conform}
              sub={totalAll ? `${Math.round((totals.conform / totalAll) * 100)}% din total` : "—"}
              accent="var(--conform)"
            />
            <KPI
              eyebrow="NECONFORM"
              value={totals.neconform}
              sub="de remediat"
              accent="var(--neconform-ink)"
            />
            <KPI
              eyebrow="PARȚIAL"
              value={totals.partial}
              sub="acoperire incompletă"
              accent="var(--partial)"
            />
            <KPI
              eyebrow="INSUFICIENT"
              value={totals.insuf}
              sub="date lipsă / ambigue"
              accent="var(--ink-2)"
            />
          </div>

          <div
            style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}
          >
            <Tabs<Tab>
              value={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: "problems",
                  label: "Probleme",
                  count: results.filter((r) => r.verdict === "NECONFORM" || r.verdict === "PARTIAL").length,
                  icon: <AlertTriangle className="w-3 h-3" />,
                },
                {
                  key: "review",
                  label: "De verificat",
                  count: results.filter(
                    (r) => r.verdict === "INSUFFICIENT_DATA" || r.needs_human_review || !r.all_quotes_verified
                  ).length,
                  icon: <HelpCircle className="w-3 h-3" />,
                },
                {
                  key: "conform",
                  label: "Conforme",
                  count: results.filter((r) => r.verdict === "CONFORM" && !r.needs_human_review).length,
                  icon: <Check className="w-3 h-3" />,
                },
              ]}
            />
            <div style={{ marginLeft: "auto" }}>
              <Button
                size="sm"
                variant="primary"
                icon={<Gauge className="w-3 h-3" />}
                onClick={() => navigate(`/projects/${id}/report`)}
              >
                Generează raport final
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <Check className="w-5 h-5" />
                </div>
                <div className="h3" style={{ marginBottom: 6 }}>
                  Niciun rezultat în această secțiune
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Schimbă filtrul pentru a vedea celelalte verdicte.
                </div>
              </div>
            ) : (
              filtered.map((r) => (
                <EvalCard
                  key={r.id}
                  result={r}
                  requirement={reqMap[r.requirement_id]}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId((cur) => (cur === r.id ? null : r.id))}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ----------------- Phase: Prelaunch -----------------

interface PrelaunchProps {
  showEstimate: boolean;
  estimate: CostEstimate | null;
  launching: boolean;
  onEstimate: () => void;
  onLaunch: () => void;
}

function PrelaunchView({ showEstimate, estimate, launching, onEstimate, onLaunch }: PrelaunchProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
      <Panel title="Ce se va întâmpla" eyebrow="PROCES">
        <div
          style={{
            padding: "4px 22px 22px",
            fontSize: 13.5,
            color: "var(--ink-1)",
            lineHeight: 1.65,
          }}
        >
          <p style={{ marginTop: 0 }}>
            Motorul va rula prin fiecare cerință atomică, una câte una. Pentru fiecare se face
            căutare hibridă (vector + keyword) în Propunerea Tehnică, apoi un LLM emite un verdict
            cu citate exacte ca dovadă.
          </p>
          <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <li>Pentru fiecare cerință se extrag pasajele candidate din PT.</li>
            <li>
              LLM-ul emite verdict ({"CONFORM | NECONFORM | PARTIAL | INSUFFICIENT_DATA"}) cu raționament
              pas-cu-pas.
            </li>
            <li>
              Fiecare citat revendicat este re-verificat textual împotriva documentului sursă (anti-halucinație).
            </li>
            <li>Rezultatele sunt persistate; poți reveni oricând.</li>
          </ol>
        </div>
      </Panel>
      <Panel
        title="Estimare"
        eyebrow="PRE-RULARE"
        actions={
          <Button size="sm" icon={<RefreshCw className="w-3 h-3" />} onClick={onEstimate}>
            {showEstimate ? "Recalculează" : "Estimează"}
          </Button>
        }
      >
        <div style={{ padding: "8px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {showEstimate && estimate ? (
            <>
              <EstRow label="Cerințe de evaluat" value={String(estimate.filtered_requirements)} />
              <EstRow
                label="Durată estimată"
                value={`~ ${estimate.estimated_duration_minutes.toFixed(1)}`}
                unit="min"
              />
              <EstRow
                label="Cost estimat"
                value={`$${estimate.estimated_cost_usd.toFixed(2)}`}
                accent="var(--amber)"
              />
              <Button
                variant="primary"
                icon={<Sparkles className="w-3.5 h-3.5" />}
                style={{ marginTop: 6 }}
                onClick={onLaunch}
                loading={launching}
              >
                Confirmă și lansează
              </Button>
              <div
                className="mono dim"
                style={{ fontSize: 10.5, letterSpacing: "0.04em" }}
              >
                ESTIMAREA POATE VARIA ± 15%
              </div>
            </>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 13 }}>
                Apasă <strong>Estimează</strong> pentru a vedea durata și costul aproximative.
              </div>
              <Button
                variant="primary"
                icon={<Bolt className="w-3.5 h-3.5" />}
                onClick={onEstimate}
              >
                Estimează costul
              </Button>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function EstRow({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span className="label" style={{ flex: 1 }}>{label}</span>
      <span
        className="mono num"
        style={{ fontSize: 16, color: accent || "var(--ink-0)", fontWeight: 500 }}
      >
        {value}
      </span>
      {unit && (
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {unit}
        </span>
      )}
    </div>
  );
}

// ----------------- Phase: Running -----------------

function RunningView({
  run,
  recent,
  reqMap,
}: {
  run: EvaluationRun;
  recent: EvaluationResult[];
  reqMap: Record<string, Requirement>;
}) {
  const progress = run.total_requirements ? run.evaluated_count / run.total_requirements : 0;
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <KPI
          eyebrow="PROGRES"
          value={`${run.evaluated_count}/${run.total_requirements}`}
          sub="cerințe procesate"
          accent="var(--amber)"
        />
        <KPI eyebrow="CONFORM" value={run.conform_count} sub="procesate" accent="var(--conform)" />
        <KPI
          eyebrow="NECONFORM"
          value={run.neconform_count}
          sub="marcate"
          accent="var(--neconform-ink)"
        />
        <KPI
          eyebrow="PARȚIAL"
          value={run.partial_count}
          sub="parțial acoperite"
          accent="var(--partial)"
        />
        <KPI
          eyebrow="INSUFICIENT"
          value={run.insufficient_count}
          sub="date lipsă"
          accent="var(--ink-2)"
        />
      </div>

      <Panel>
        <div style={{ padding: "18px 22px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
            <span className="status-dot live" style={{ width: 10, height: 10 }} />
            <div className="h3">Evaluare în curs</div>
            <span className="mono dim" style={{ fontSize: 12, marginLeft: "auto" }}>
              {Math.round(progress * 100)}%
            </span>
          </div>
          <Meter value={progress} tall shimmer />
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
            {run.evaluated_count} / {run.total_requirements} cerințe procesate
          </div>
        </div>
        <div className="divider" />
        <div
          style={{
            padding: "14px 22px",
            display: "flex",
            gap: 10,
            flexDirection: "column",
          }}
        >
          {recent.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>
              Aștept primul verdict…
            </div>
          ) : (
            recent.map((r) => {
              const req = reqMap[r.requirement_id];
              const text = (req?.requirement_text || "Cerință").slice(0, 70);
              return (
                <div
                  key={r.id}
                  className="mono"
                  style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11.5 }}
                >
                  <span style={{ color: "var(--ink-3)" }}>
                    {new Date(r.created_at).toLocaleTimeString("ro-RO")}
                  </span>
                  <span style={{ color: "var(--amber-ink)" }}>{r.id.slice(0, 8).toUpperCase()}</span>
                  <VerdictBadge verdict={r.verdict} />
                  <span style={{ color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {text}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}

// ----------------- EvalCard -----------------

interface EvalCardProps {
  result: EvaluationResult;
  requirement?: Requirement;
  expanded: boolean;
  onToggle: () => void;
}

function EvalCard({ result: r, requirement, expanded, onToggle }: EvalCardProps) {
  const borderColor =
    r.verdict === "NECONFORM"
      ? "var(--neconform-line)"
      : r.verdict === "PARTIAL"
      ? "var(--partial-line)"
      : r.verdict === "INSUFFICIENT_DATA"
      ? "var(--insuf-line)"
      : "var(--line-1)";

  const reqText = requirement?.requirement_text || r.reasoning.split("\n")[0].slice(0, 200);

  return (
    <div className="req-card" style={{ borderColor }}>
      <button className="req-head" onClick={onToggle}>
        <VerdictGlyph verdict={r.verdict} />
        <div className="req-id mono">{r.id.slice(0, 8).toUpperCase()}</div>
        <div className="req-text" style={{ fontSize: 13 }}>
          {reqText}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          {r.needs_human_review && (
            <Badge variant="amber" dot>
              Revizie
            </Badge>
          )}
          {!r.all_quotes_verified && (
            <Badge variant="partial" dot>
              Citat neverif.
            </Badge>
          )}
          <VerdictBadge verdict={r.verdict} />
          <span
            className="mono num dim"
            style={{ fontSize: 11, minWidth: 38, textAlign: "right" }}
          >
            {r.confidence_score.toFixed(2)}
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 dim" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 dim" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="req-body" style={{ paddingTop: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              marginBottom: 14,
            }}
          >
            <div>
              <div className="label" style={{ marginBottom: 5 }}>
                CERINȚĂ CAIET DE SARCINI
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-0)", lineHeight: 1.55 }}>
                {requirement?.requirement_text || "—"}
              </div>
              {requirement?.hierarchy_path && (
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                  {requirement.hierarchy_path}
                </div>
              )}
            </div>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>
                RAȚIONAMENT MOTOR
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-1)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-line",
                }}
              >
                {r.reasoning}
              </div>
            </div>
          </div>

          {r.proposal_quotes && r.proposal_quotes.length > 0 && (
            <>
              <div className="label" style={{ marginBottom: 4 }}>
                <QuoteIcon
                  className="w-3 h-3"
                  style={{ verticalAlign: "middle", marginRight: 6, color: "var(--amber)" }}
                />
                CITAT DIN PROPUNEREA TEHNICĂ
              </div>
              {r.proposal_quotes.map((q, i) => (
                <Quote
                  key={i}
                  text={q.quote}
                  fragment={q.fragment_number}
                  verified={r.all_quotes_verified}
                />
              ))}
            </>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              marginTop: 14,
            }}
          >
            <div>
              <div className="label" style={{ marginBottom: 5 }}>
                ASPECTE ACOPERITE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {r.covered_aspects.length > 0 ? (
                  r.covered_aspects.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12.5,
                        color: "var(--ink-0)",
                      }}
                    >
                      <Check className="w-3 h-3" style={{ color: "var(--conform)", flex: "0 0 auto" }} />
                      {c}
                    </div>
                  ))
                ) : (
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    —
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>
                ASPECTE LIPSĂ
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {r.missing_aspects.length > 0 ? (
                  r.missing_aspects.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12.5,
                        color: "var(--ink-0)",
                      }}
                    >
                      <X
                        className="w-3 h-3"
                        style={{ color: "var(--neconform-ink)", flex: "0 0 auto" }}
                      />
                      {c}
                    </div>
                  ))
                ) : (
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    —
                  </span>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid var(--line-0)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ fontSize: 11, color: "var(--ink-3)" }}
              className="mono"
            >
              EVAL ID · {r.id.slice(0, 8).toUpperCase()}
            </span>
            <span
              style={{ fontSize: 11, color: "var(--ink-3)" }}
              className="mono"
            >
              {new Date(r.created_at).toLocaleString("ro-RO")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

