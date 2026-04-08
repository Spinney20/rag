"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ListChecks, AlertCircle, Trash2, Check, Eye } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Project, Requirement } from "@/lib/types";
import clsx from "clsx";
import Link from "next/link";

export default function RequirementsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [stats, setStats] = useState<Record<string, Record<string, number>>>({});
  const [reviewCount, setReviewCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [proj, reqs] = await Promise.all([
        apiFetch<Project>(`/projects/${projectId}`),
        apiFetch<any>(`/projects/${projectId}/requirements?limit=500`),
      ]);
      setProject(proj);
      setRequirements(reqs.requirements);
      setTotal(reqs.total);
      setStats({
        category: reqs.by_category || {},
        priority: reqs.by_priority || {},
        verification_type: reqs.by_verification_type || {},
      });
      setReviewCount(reqs.needs_review_count || 0);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await apiFetch(`/projects/${projectId}/requirements/extract`, { method: "POST" });
      // Poll until extraction completes (ref-based, with timeout + error detection)
      let pollCount = 0;
      const MAX_POLLS = 200; // ~10 min at 3s intervals
      pollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount > MAX_POLLS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setExtracting(false);
          alert("Extragerea a depășit timpul maxim. Verifică statusul proiectului.");
          return;
        }
        try {
          const proj = await apiFetch<Project>(`/projects/${projectId}`);
          // Success: extraction done
          if (proj.status === "requirements_extracted") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            await fetchData();
            setExtracting(false);
          }
          // Failure: status went back to documents_ready (task failed)
          if (proj.status === "documents_ready" && pollCount > 3) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setExtracting(false);
            alert("Extragerea a eșuat. Încearcă din nou.");
          }
        } catch {
          // Network error — don't stop polling, might be transient
        }
      }, 3000);
    } catch (err: any) {
      alert(err.message);
      setExtracting(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      await apiFetch(`/projects/${projectId}/requirements/validate`, { method: "POST" });
      router.push(`/projects/${projectId}/evaluation`);
    } catch (err: any) {
      alert(err.message);
      setValidating(false);
    }
  };

  const handleDelete = async (reqId: string) => {
    if (!confirm("Sigur vrei să ștergi această cerință?")) return;
    try {
      await apiFetch(`/projects/${projectId}/requirements/${reqId}`, { method: "DELETE" });
      setRequirements((prev) => prev.filter((r) => r.id !== reqId));
      setTotal((t) => t - 1);
    } catch (err) { console.error(err); }
  };

  const filtered = filter === "review"
    ? requirements.filter((r) => r.needs_human_review)
    : filter
      ? requirements.filter((r) => r.category === filter || r.priority === filter)
      : requirements;

  // Group by hierarchy_path
  const grouped = filtered.reduce<Record<string, Requirement[]>>((acc, req) => {
    const key = req.hierarchy_path || "Fără secțiune";
    (acc[key] = acc[key] || []).push(req);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const needsExtraction = project?.status === "documents_ready";
  const canValidate = project?.status === "requirements_extracted" && total > 0;

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
        <h1 className="text-2xl font-bold tracking-tight">Cerințe Extrase</h1>
      </div>

      {/* Extract button */}
      {needsExtraction && (
        <Card className="mb-6 animate-in" style={{ animationDelay: "50ms" }}>
          <CardContent className="py-8 text-center">
            <ListChecks className="w-10 h-10 text-[var(--accent)] mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Documentele sunt gata</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Extrage cerințe atomice din Caietul de Sarcini
            </p>
            <Button onClick={handleExtract} loading={extracting}>
              Extrage Cerințe cu AI
            </Button>
          </CardContent>
        </Card>
      )}

      {extracting && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--accent-glow)] border border-[var(--accent)]/10 rounded-lg mb-6">
          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--accent)]">Extragere în curs... Poate dura câteva minute.</span>
        </div>
      )}

      {/* Stats */}
      {total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6 animate-in" style={{ animationDelay: "100ms" }}>
          <Card className="cursor-pointer" hover onClick={() => setFilter(null)}>
            <CardContent className="py-3 text-center">
              <div className="text-xl font-bold font-mono">{total}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Total</div>
            </CardContent>
          </Card>
          {Object.entries(stats.category || {}).slice(0, 3).map(([cat, count]) => (
            <Card key={cat} className="cursor-pointer" hover onClick={() => setFilter(cat)}>
              <CardContent className="py-3 text-center">
                <div className="text-xl font-bold font-mono">{count}</div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{cat}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review warning */}
      {reviewCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--partial)]/10 border border-[var(--partial)]/20 rounded-lg mb-6 animate-in" style={{ animationDelay: "150ms" }}>
          <AlertCircle className="w-4 h-4 text-[var(--partial)] shrink-0" />
          <span className="text-sm text-[var(--partial)]">
            <strong>{reviewCount} cerințe</strong> necesită revizuire manuală (confidență scăzută)
          </span>
          <Button size="sm" variant="ghost" onClick={() => setFilter("review")}>
            <Eye className="w-3.5 h-3.5" />
            Arată
          </Button>
        </div>
      )}

      {/* Requirements grouped by section */}
      {Object.entries(grouped).map(([section, reqs], i) => (
        <Card key={section} className="mb-4 animate-in" style={{ animationDelay: `${200 + i * 30}ms` }}>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[var(--accent)]">{section}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{reqs.length} cerințe</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 py-3">
            {reqs.map((req) => (
              <div
                key={req.id}
                className={clsx(
                  "flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                  req.needs_human_review
                    ? "border-[var(--partial)]/30 bg-[var(--partial)]/5"
                    : "border-[var(--border)] bg-[var(--bg-primary)]",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{req.requirement_text}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge size="sm">{req.category}</Badge>
                    <Badge size="sm">{req.priority}</Badge>
                    <Badge size="sm">{req.verification_type}</Badge>
                    {req.referenced_standards?.map((std) => (
                      <span key={std} className="text-[10px] font-mono text-[var(--accent)]">{std}</span>
                    ))}
                    {req.needs_human_review && (
                      <Badge variant="partial" size="sm">Review</Badge>
                    )}
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      conf: {((req.extraction_confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(req.id)}
                  className="p-1 hover:bg-red-500/10 rounded text-[var(--text-muted)] hover:text-[var(--neconform)] transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Validate button */}
      {canValidate && (
        <div className="sticky bottom-0 py-4 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent">
          <div className="flex items-center justify-between p-4 glass rounded-xl">
            <div>
              <span className="text-sm font-medium">{total} cerințe gata pentru evaluare</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Verifică cerințele, apoi validează pentru a continua
              </span>
            </div>
            <Button onClick={handleValidate} loading={validating} size="lg">
              <Check className="w-4 h-4" />
              Validează și Continuă la Evaluare
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
