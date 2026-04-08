"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, BarChart3, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { Analytics } from "@/lib/types";
import clsx from "clsx";

export default function ReportPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Analytics>(`/projects/${projectId}/analytics`)
      .then(setAnalytics)
      .catch((err) => console.error("Failed to load analytics:", err))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-8 text-center text-[var(--text-secondary)]">
        Nu există evaluări completate pentru acest proiect
      </div>
    );
  }

  const total = analytics.total_evaluated;
  const conformRate = total > 0 ? ((analytics.verdict_distribution["CONFORM"] || 0) / total * 100) : 0;

  const verdictBars = [
    { key: "CONFORM", label: "Conform", color: "var(--conform)", count: analytics.verdict_distribution["CONFORM"] || 0 },
    { key: "NECONFORM", label: "Neconform", color: "var(--neconform)", count: analytics.verdict_distribution["NECONFORM"] || 0 },
    { key: "PARTIAL", label: "Parțial", color: "var(--partial)", count: analytics.verdict_distribution["PARTIAL"] || 0 },
    { key: "INSUFFICIENT_DATA", label: "Insuficient", color: "var(--insufficient)", count: analytics.verdict_distribution["INSUFFICIENT_DATA"] || 0 },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6 animate-in">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Proiect
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Raport Conformitate</h1>
          <Button variant="secondary">
            <Download className="w-4 h-4" />
            Export Word
          </Button>
        </div>
      </div>

      {/* Compliance score */}
      <Card className="mb-6 gradient-border animate-in" style={{ animationDelay: "50ms" }}>
        <CardContent className="py-8 text-center">
          <div className="text-6xl font-bold font-mono tracking-tighter" style={{ color: conformRate >= 80 ? "var(--conform)" : conformRate >= 50 ? "var(--partial)" : "var(--neconform)" }}>
            {conformRate.toFixed(0)}%
          </div>
          <div className="text-sm text-[var(--text-secondary)] mt-2">Rată Conformitate</div>
          <div className="text-xs font-mono text-[var(--text-muted)] mt-1">
            {total} cerințe evaluate · confidență medie {(analytics.avg_confidence * 100).toFixed(0)}%
          </div>
        </CardContent>
      </Card>

      {/* Verdict distribution */}
      <Card className="mb-6 animate-in" style={{ animationDelay: "100ms" }}>
        <CardHeader>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Distribuție Verdicte
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {verdictBars.map((bar) => (
            <div key={bar.key} className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-secondary)] w-20">{bar.label}</span>
              <div className="flex-1 h-6 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${total > 0 ? (bar.count / total * 100) : 0}%`,
                    backgroundColor: bar.color,
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="text-sm font-mono font-bold w-8 text-right" style={{ color: bar.color }}>
                {bar.count}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Health warnings */}
      {analytics.health_warnings.length > 0 && (
        <Card className="mb-6 animate-in" style={{ animationDelay: "150ms" }}>
          <CardHeader>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--partial)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Avertismente
            </h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {analytics.health_warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--partial)] mt-0.5 shrink-0" />
                {warning}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3 animate-in" style={{ animationDelay: "200ms" }}>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-lg font-bold font-mono">{(analytics.quote_verification_rate * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Citate verificate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-lg font-bold font-mono">{analytics.needs_review_count}</div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Necesită review</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-lg font-bold font-mono">{analytics.error_count}</div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Erori evaluare</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
