import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ListChecks,
  Trash2,
  ChevronRight,
  ChevronDown,
  Flag,
  ArrowRight,
  BookOpen,
  Sparkles,
  Eye,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiFetch } from "@/lib/api";
import {
  Project,
  Requirement,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
} from "@/lib/types";

interface RequirementsResponse {
  requirements: Requirement[];
  total: number;
  by_category?: Record<string, number>;
  by_priority?: Record<string, number>;
  needs_review_count?: number;
}

export default function RequirementsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [total, setTotal] = useState(0);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const fetchData = async () => {
    try {
      const [p, r] = await Promise.all([
        apiFetch<Project>(`/projects/${id}`),
        apiFetch<RequirementsResponse>(`/projects/${id}/requirements?limit=500`),
      ]);
      setProject(p);
      setReqs(r.requirements);
      setTotal(r.total);
      setByCategory(r.by_category || {});
      setReviewCount(r.needs_review_count || 0);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [id]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await apiFetch(`/projects/${id}/requirements/extract`, { method: "POST" });
      let polls = 0;
      pollRef.current = setInterval(async () => {
        polls++;
        if (polls > 200) {
          if (pollRef.current) clearInterval(pollRef.current);
          setExtracting(false);
          return;
        }
        try {
          const p = await apiFetch<Project>(`/projects/${id}`);
          if (p.status === "requirements_extracted" || p.status === "requirements_validated") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            await fetchData();
            setExtracting(false);
          }
          if (p.status === "documents_ready" && polls > 3) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setExtracting(false);
          }
        } catch {}
      }, 3000);
    } catch (e) {
      alert((e as Error).message);
      setExtracting(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      await apiFetch(`/projects/${id}/requirements/validate`, { method: "POST" });
      navigate(`/projects/${id}/evaluation`);
    } catch (e) {
      alert((e as Error).message);
      setValidating(false);
    }
  };

  const handleDelete = async (reqId: string) => {
    if (!confirm("Sigur vrei să ștergi această cerință?")) return;
    try {
      await apiFetch(`/projects/${id}/requirements/${reqId}`, { method: "DELETE" });
      setReqs((p) => p.filter((r) => r.id !== reqId));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    return reqs.filter((r) => {
      if (filterCat !== "all" && filterCat !== "review" && r.category !== filterCat) return false;
      if (filterCat === "review" && !r.needs_human_review) return false;
      if (showFlaggedOnly && !r.needs_human_review) return false;
      return true;
    });
  }, [reqs, filterCat, showFlaggedOnly]);

  const grouped = useMemo(() => {
    const g: Record<string, Requirement[]> = {};
    filtered.forEach((r) => {
      const key = r.hierarchy_path?.split(" › ")[0] || "Fără secțiune";
      (g[key] = g[key] || []).push(r);
    });
    return g;
  }, [filtered]);

  if (loading) {
    return (
      <div className="page" style={{ display: "grid", placeItems: "center", height: "60vh" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--amber)" }} />
      </div>
    );
  }

  const canExtract =
    project?.status === "documents_ready" ||
    (project?.status && project.status !== "processing" && total === 0);
  const canValidate =
    project?.status === "requirements_extracted" && total > 0 && !validating;

  return (
    <div className="page fadein" style={{ paddingBottom: 110 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ETAPA 2 · EXTRACȚIE CERINȚE
          </div>
          <div className="h1">Revizuiește cerințele atomice</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 14, maxWidth: 720 }}>
            {total > 0 ? (
              <>
                Motorul a identificat{" "}
                <span className="mono" style={{ color: "var(--ink-0)" }}>{total}</span> cerințe atomice. Elimină
                dublurile, corectează extragerile eronate, apoi validează pentru a lansa evaluarea.
              </>
            ) : (
              <>Cerințele atomice sunt extrase din Caietul de Sarcini cu un model LLM. Procesul durează ~1 min pe sută de pagini.</>
            )}
          </div>
        </div>
      </div>

      {/* Pre-extract empty state */}
      {total === 0 && canExtract && !extracting && (
        <EmptyState
          icon={<ListChecks className="w-5 h-5" />}
          title="Documentele sunt indexate"
          description="Lansează extragerea ca să generezi cerințele atomice din Caietul de Sarcini."
          action={
            <Button
              variant="primary"
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={handleExtract}
              loading={extracting}
            >
              Extrage cerințele cu AI
            </Button>
          }
        />
      )}

      {/* Extracting banner */}
      {extracting && (
        <div className="callout" style={{ marginBottom: 18, borderLeftColor: "var(--amber)" }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--amber)" }} />
          <div>
            <strong>Extragere în curs.</strong> Motorul parcurge Caietul de Sarcini și extrage cerințele atomice.
            Această pagină se actualizează automat la finalizare.
          </div>
        </div>
      )}

      {total > 0 && (
        <>
          {/* Review banner */}
          {reviewCount > 0 && (
            <div className="callout warn" style={{ marginBottom: 18 }}>
              <Flag className="w-3.5 h-3.5" />
              <div>
                <strong>{reviewCount} cerințe marcate pentru revizuire umană.</strong> Motorul are încredere scăzută
                în extragere — formulări ambigue, tabele cu structură neregulată sau referințe implicite.
              </div>
              <Button
                size="sm"
                onClick={() => setShowFlaggedOnly((s) => !s)}
                icon={<Eye className="w-3.5 h-3.5" />}
                style={{ marginLeft: "auto" }}
              >
                {showFlaggedOnly ? "Arată toate" : "Arată doar marcate"}
              </Button>
            </div>
          )}

          {/* Category chips */}
          <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
            <button
              className={clsx("chip", filterCat === "all" && "active")}
              onClick={() => setFilterCat("all")}
            >
              Toate <span className="count num">{total}</span>
            </button>
            {/* Sort by predefined CATEGORY_LABELS order so the chip row is stable
                across renders (backend may emit categories in any order). */}
            {Object.keys(CATEGORY_LABELS)
              .filter((cat) => (byCategory[cat] || 0) > 0)
              .map((cat) => (
                <button
                  key={cat}
                  className={clsx("chip", filterCat === cat && "active")}
                  onClick={() => setFilterCat(cat)}
                >
                  {CATEGORY_LABELS[cat]} <span className="count num">{byCategory[cat]}</span>
                </button>
              ))}
            {reviewCount > 0 && (
              <button
                className={clsx("chip", filterCat === "review" && "active")}
                style={{ color: "var(--partial)" }}
                onClick={() => setFilterCat("review")}
              >
                <Flag className="w-3 h-3" /> De revizuit{" "}
                <span className="count num">{reviewCount}</span>
              </button>
            )}
          </div>

          {/* Grouped list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {Object.entries(grouped).map(([section, items]) => (
              <div key={section}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <BookOpen className="w-3.5 h-3.5 dim" />
                  <div className="h3" style={{ fontSize: 13.5 }}>
                    {section}
                  </div>
                  <div className="mono dim" style={{ fontSize: 11 }}>
                    {items.length} cerințe
                  </div>
                  <div style={{ flex: 1, height: 1, background: "var(--line-0)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((r) => (
                    <RequirementCard key={r.id} req={r} onDelete={() => handleDelete(r.id)} />
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <div style={{ padding: 30 }}>
                <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
                  Niciun rezultat pentru filtrele curente.
                </div>
              </div>
            )}
          </div>

          {/* Sticky CTA */}
          {canValidate && (
            <div className="sticky-cta">
              <div className="eyebrow" style={{ color: "var(--amber)" }}>
                GATA DE VALIDARE
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-0)" }}>
                <span className="mono num" style={{ color: "var(--amber-ink)" }}>
                  {total}
                </span>{" "}
                cerințe ·{" "}
                <span className="mono num" style={{ color: "var(--partial)" }}>
                  {reviewCount}
                </span>{" "}
                marcate
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <Button
                  variant="primary"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={handleValidate}
                  loading={validating}
                >
                  Validează și lansează evaluarea
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ReqCardProps {
  req: Requirement;
  onDelete: () => void;
}

function RequirementCard({ req, onDelete }: ReqCardProps) {
  const [expanded, setExpanded] = useState(false);
  const conf = req.extraction_confidence ?? 0;
  const low = conf < 0.8;
  const flagged = req.needs_human_review;

  return (
    <div
      className="req-card"
      style={
        flagged
          ? { borderColor: "var(--partial-line)", background: "color-mix(in oklch, var(--partial) 5%, var(--bg-glass))" }
          : low
          ? { borderColor: "var(--partial-line)" }
          : undefined
      }
    >
      <button className="req-head" onClick={() => setExpanded((e) => !e)}>
        <div className="req-id mono" style={{ minWidth: 76 }}>
          {req.id.slice(0, 8)}
        </div>
        <div className="req-text">{req.requirement_text}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          <Badge
            className={`prio-${req.priority}`}
            dot
          >
            {PRIORITY_LABELS[req.priority] || req.priority}
          </Badge>
          <Badge>{(CATEGORY_LABELS[req.category] || req.category).toLowerCase()}</Badge>
          <span
            className="mono num"
            style={{
              fontSize: 11,
              color:
                conf >= 0.9
                  ? "var(--conform)"
                  : conf >= 0.8
                  ? "var(--ink-1)"
                  : "var(--partial)",
              minWidth: 38,
              textAlign: "right",
            }}
            title="Încredere extragere LLM"
          >
            {conf.toFixed(2)}
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 dim" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 dim" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="req-body">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              marginBottom: 14,
            }}
          >
            <div>
              <div className="label">VERIFICARE</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-0)", marginTop: 3 }}>
                {req.verification_type}
              </div>
            </div>
            <div>
              <div className="label">SECȚIUNE CS</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-0)", marginTop: 3 }}>
                {req.hierarchy_path || "—"}
              </div>
            </div>
            <div>
              <div className="label">STANDARDE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
                {req.referenced_standards && req.referenced_standards.length > 0 ? (
                  req.referenced_standards.map((s) => (
                    <span key={s} className="code amber">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    —
                  </span>
                )}
              </div>
            </div>
          </div>

          {flagged && (
            <div className="callout warn" style={{ marginBottom: 10 }}>
              <Flag className="w-3.5 h-3.5" />
              <div>
                Încredere scăzută a extragerii. Verifică manual formularea și valorile detectate.
              </div>
            </div>
          )}

          <div className="label" style={{ marginBottom: 4 }}>TEXT ORIGINAL CS</div>
          <div
            className="serif"
            style={{
              fontSize: 13.5,
              color: "var(--ink-1)",
              lineHeight: 1.6,
              padding: 12,
              borderLeft: "2px solid var(--line-2)",
              marginBottom: 14,
            }}
          >
            {req.original_text}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="w-3 h-3" />}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              Șterge
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

