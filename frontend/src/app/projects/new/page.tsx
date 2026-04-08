"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, ArrowLeft, AlertCircle, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { apiFetch, apiUpload } from "@/lib/api";
import { DOC_TYPE_LABELS } from "@/lib/types";
import clsx from "clsx";
import Link from "next/link";

interface UploadFile {
  file: File;
  docType: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const DOC_ZONES = [
  {
    type: "caiet_de_sarcini",
    label: "Caiet de Sarcini",
    desc: "Documentul cu cerințe tehnice (.docx)",
    color: "cyan",
    multiple: true,
  },
  {
    type: "fisa_de_date",
    label: "Fișa de Date",
    desc: "Cerințe administrative (.docx)",
    color: "violet",
    multiple: false,
  },
  {
    type: "propunere_tehnica",
    label: "Propunere Tehnică",
    desc: "Documentul de verificat (.docx)",
    color: "amber",
    multiple: true,
  },
] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const handleDrop = useCallback(
    (docType: string, multiple: boolean) => (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith(".docx")
      );
      if (dropped.length === 0) {
        setError("Doar fișiere .docx sunt acceptate");
        return;
      }
      setFiles((prev) => {
        // Enforce single file for non-multiple zones
        if (!multiple) {
          const withoutExisting = prev.filter((f) => f.docType !== docType);
          return [...withoutExisting, { file: dropped[0], docType, status: "pending" as const }];
        }
        return [...prev, ...dropped.map((file) => ({ file, docType, status: "pending" as const }))];
      });
      setError(null);
    },
    []
  );

  const handleFileSelect = (docType: string, multiple: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) =>
      f.name.toLowerCase().endsWith(".docx")
    );
    if (selected.length === 0) {
      setError("Doar fișiere .docx sunt acceptate");
      return;
    }
    setFiles((prev) => {
      if (!multiple) {
        const withoutExisting = prev.filter((f) => f.docType !== docType);
        return [...withoutExisting, { file: selected[0], docType, status: "pending" as const }];
      }
      return [...prev, ...selected.map((file) => ({ file, docType, status: "pending" as const }))];
    });
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Numele proiectului e obligatoriu");
      return;
    }
    if (files.length === 0) {
      setError("Adaugă cel puțin un document");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // Prevent creating a duplicate project on retry
      let projectIdToUse = createdProjectId;
      if (!projectIdToUse) {
        const project = await apiFetch<{ id: string }>("/projects", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
        });
        projectIdToUse = project.id;
        setCreatedProjectId(project.id);
      }

      // Upload files sequentially, track failures locally
      let failCount = 0;
      for (let i = 0; i < files.length; i++) {
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
        );

        const formData = new FormData();
        formData.append("file", files[i].file);
        formData.append("doc_type", files[i].docType);

        try {
          await apiUpload(`/projects/${projectIdToUse}/documents`, formData);
          setFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f))
          );
        } catch (err: any) {
          failCount++;
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "error", error: err.message } : f
            )
          );
        }
      }

      if (failCount > 0) {
        setError(`${failCount} fișier(e) nu s-au uploadat. Verifică erorile sau mergi la proiect.`);
        setCreating(false);
        return;
      }

      router.push(`/projects/${projectIdToUse}`);
    } catch (err: any) {
      setError(err.message);
      setCreating(false);
    }
  };

  const filesForType = (type: string) => files.filter((f) => f.docType === type);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-in">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Înapoi la Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Proiect Nou</h1>
        <p className="text-[var(--text-secondary)] mt-1 text-sm">
          Creează un proiect de verificare conformitate
        </p>
      </div>

      {/* Project info */}
      <Card className="mb-6 animate-in" style={{ animationDelay: "50ms" }}>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
              Nume Proiect *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: DJ714 — Modernizare drum comunal"
              className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
              Descriere
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opțional — note despre licitație"
              className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload zones */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        {DOC_ZONES.map((zone, i) => (
          <Card
            key={zone.type}
            className="animate-in"
            style={{ animationDelay: `${100 + i * 50}ms` }}
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={clsx(
                    "w-2 h-8 rounded-full",
                    zone.color === "cyan" && "bg-cyan-500",
                    zone.color === "violet" && "bg-violet-500",
                    zone.color === "amber" && "bg-amber-500"
                  )}
                />
                <div>
                  <h3 className="font-semibold text-sm">{zone.label}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{zone.desc}</p>
                </div>
              </div>
              {filesForType(zone.type).length > 0 && (
                <Badge variant="default" size="md">
                  {filesForType(zone.type).length} fișier{filesForType(zone.type).length > 1 ? "e" : ""}
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={handleDrop(zone.type, zone.multiple)}
                className="relative group"
              >
                <label className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--accent)]/50 hover:bg-[var(--accent-glow)] transition-all">
                  <Upload className="w-6 h-6 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors mb-2" />
                  <span className="text-sm text-[var(--text-secondary)]">
                    Drag & drop sau{" "}
                    <span className="text-[var(--accent)] font-medium">click pentru a selecta</span>
                  </span>
                  <span className="text-xs text-[var(--text-muted)] mt-1">
                    Doar .docx {zone.multiple ? "(multiple fișiere)" : "(un singur fișier)"}
                  </span>
                  <input
                    type="file"
                    accept=".docx"
                    multiple={zone.multiple}
                    onChange={handleFileSelect(zone.type, zone.multiple)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>

              {/* File list */}
              {filesForType(zone.type).length > 0 && (
                <div className="mt-3 space-y-2">
                  {filesForType(zone.type).map((f) => {
                    const globalIdx = files.indexOf(f);
                    return (
                      <div
                        key={`${f.file.name}-${f.file.size}-${globalIdx}`}
                        className="flex items-center justify-between px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          <span className="text-sm truncate">{f.file.name}</span>
                          <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                            {(f.file.size / 1024 / 1024).toFixed(1)}MB
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {f.status === "uploading" && (
                            <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                          )}
                          {f.status === "done" && <Check className="w-4 h-4 text-[var(--conform)]" />}
                          {f.status === "error" && (
                            <span className="text-[10px] text-[var(--neconform)]">{f.error}</span>
                          )}
                          {f.status === "pending" && (
                            <button
                              onClick={() => removeFile(globalIdx)}
                              className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
                            >
                              <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tip */}
      <div className="flex items-start gap-3 px-4 py-3 bg-[var(--accent-glow)] border border-[var(--accent)]/10 rounded-lg mb-6 animate-in" style={{ animationDelay: "250ms" }}>
        <AlertCircle className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          <strong className="text-[var(--accent)]">Tip:</strong> Dacă sursa e PDF, convertește-l mai întâi
          în Word cu Adobe Acrobat (File → Export → Word). Verifică vizual calitatea conversiei înainte de upload.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-6 text-sm text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
          {createdProjectId && (
            <Link href={`/projects/${createdProjectId}`} className="text-[var(--accent)] hover:underline text-xs font-medium whitespace-nowrap ml-4">
              Mergi la proiect →
            </Link>
          )}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3 animate-in" style={{ animationDelay: "300ms" }}>
        <Link href="/">
          <Button variant="secondary">Anulează</Button>
        </Link>
        <Button onClick={handleCreate} loading={creating} disabled={!name.trim() || files.length === 0}>
          Creează și Procesează
        </Button>
      </div>
    </div>
  );
}
