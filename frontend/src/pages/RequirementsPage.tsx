import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ListChecks, AlertCircle, Trash2, Check, Eye } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Project, Requirement } from "@/lib/types";
import clsx from "clsx";

export default function RequirementsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, Record<string, number>>>({});
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const fetchData = async () => {
    try {
      const [p, r] = await Promise.all([
        apiFetch<Project>(`/projects/${id}`),
        apiFetch<any>(`/projects/${id}/requirements?limit=500`),
      ]);
      setProject(p); setReqs(r.requirements); setTotal(r.total);
      setStats({ category: r.by_category || {}, priority: r.by_priority || {} });
      setReviewCount(r.needs_review_count || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await apiFetch(`/projects/${id}/requirements/extract`, { method: "POST" });
      let polls = 0;
      pollRef.current = setInterval(async () => {
        polls++;
        if (polls > 200) { if (pollRef.current) clearInterval(pollRef.current); setExtracting(false); return; }
        try {
          const p = await apiFetch<Project>(`/projects/${id}`);
          if (p.status === "requirements_extracted") { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; await fetchData(); setExtracting(false); }
          if (p.status === "documents_ready" && polls > 3) { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; setExtracting(false); }
        } catch {}
      }, 3000);
    } catch (e: any) { alert(e.message); setExtracting(false); }
  };

  const handleValidate = async () => {
    setValidating(true);
    try { await apiFetch(`/projects/${id}/requirements/validate`, { method: "POST" }); navigate(`/projects/${id}/evaluation`); }
    catch (e: any) { alert(e.message); setValidating(false); }
  };

  const handleDelete = async (reqId: string) => {
    if (!confirm("Sigur vrei să ștergi?")) return;
    try { await apiFetch(`/projects/${id}/requirements/${reqId}`, { method: "DELETE" }); setReqs((p) => p.filter((r) => r.id !== reqId)); setTotal((t) => t - 1); } catch {}
  };

  const filtered = filter === "review" ? reqs.filter((r) => r.needs_human_review) : filter ? reqs.filter((r) => r.category === filter) : reqs;
  const grouped = filtered.reduce<Record<string, Requirement[]>>((acc, r) => { const k = r.hierarchy_path || "Fără secțiune"; (acc[k] = acc[k] || []).push(r); return acc; }, {});

  if (loading) return <div className="flex justify-center items-center h-screen"><div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;

  const canExtract = project?.status === "documents_ready";
  const canValidate = project?.status === "requirements_extracted" && total > 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6 anim-fade-up">
        <Link to={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"><ArrowLeft className="w-3.5 h-3.5" /> Proiect</Link>
        <h1 className="text-xl font-bold tracking-tight">Cerințe Extrase</h1>
      </div>

      {canExtract && (
        <Card accent className="mb-6 anim-fade-up" style={{ animationDelay: "50ms" }}>
          <CardBody className="py-10 text-center">
            <ListChecks className="w-10 h-10 text-[var(--accent)] mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Documentele sunt gata</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">Extrage cerințe atomice din Caietul de Sarcini</p>
            <Button onClick={handleExtract} loading={extracting}>Extrage Cerințe cu AI</Button>
          </CardBody>
        </Card>
      )}

      {extracting && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--accent-glow)] border border-[var(--accent)]/10 rounded-[var(--radius-md)] mb-5">
          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--accent)]">Extragere în curs...</span>
        </div>
      )}

      {total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[{ label: "Total", value: total, onClick: () => setFilter(null) },
            ...Object.entries(stats.category || {}).slice(0, 3).map(([k, v]) => ({ label: k, value: v, onClick: () => setFilter(k) })),
          ].map((s, i) => (
            <Card key={s.label} hover onClick={s.onClick} className="anim-fade-up cursor-pointer" style={{ animationDelay: `${100 + i * 40}ms` }}>
              <CardBody className="py-2.5 text-center">
                <div className="text-lg font-bold mono">{s.value}</div>
                <div className="label-xs">{s.label}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {reviewCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--partial)]/8 border border-[var(--partial)]/15 rounded-[var(--radius-md)] mb-5">
          <AlertCircle className="w-4 h-4 text-[var(--partial)]" />
          <span className="text-sm text-[var(--partial)]"><strong>{reviewCount}</strong> necesită review</span>
          <Button size="sm" variant="ghost" onClick={() => setFilter("review")}><Eye className="w-3.5 h-3.5" /> Arată</Button>
        </div>
      )}

      {Object.entries(grouped).map(([section, items], i) => (
        <Card key={section} className="mb-3 anim-fade-up" style={{ animationDelay: `${200 + i * 20}ms` }}>
          <CardHeader className="py-2.5 flex items-center justify-between">
            <span className="mono text-[11px] text-[var(--accent)]">{section}</span>
            <span className="mono text-[10px] text-[var(--text-muted)]">{items.length}</span>
          </CardHeader>
          <CardBody className="space-y-1.5 py-3">
            {items.map((r) => (
              <div key={r.id} className={clsx("flex items-start gap-3 px-3 py-2 rounded-[var(--radius-sm)] border transition-colors",
                r.needs_human_review ? "border-[var(--partial)]/20 bg-[var(--partial)]/5" : "border-[var(--border)] bg-[var(--bg-void)]")}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] leading-relaxed">{r.requirement_text}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge>{r.category}</Badge>
                    <Badge>{r.verification_type}</Badge>
                    {r.referenced_standards?.map((s) => <span key={s} className="mono text-[10px] text-[var(--accent)]">{s}</span>)}
                    {r.needs_human_review && <Badge variant="partial">Review</Badge>}
                    <span className="mono text-[10px] text-[var(--text-muted)]">{((r.extraction_confidence || 0) * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <button onClick={() => handleDelete(r.id)} className="p-1 hover:bg-[var(--neconform)]/10 rounded text-[var(--text-muted)] hover:text-[var(--neconform)] transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      {canValidate && (
        <div className="sticky bottom-0 py-4">
          <div className="flex items-center justify-between p-4 surface-floating">
            <div>
              <span className="text-sm font-medium">{total} cerințe gata</span>
              <span className="block text-[11px] text-[var(--text-muted)]">Verifică, apoi validează</span>
            </div>
            <Button onClick={handleValidate} loading={validating} size="lg"><Check className="w-4 h-4" /> Validează și Continuă</Button>
          </div>
        </div>
      )}
    </div>
  );
}
