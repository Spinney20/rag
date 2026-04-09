import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Upload, FileText, ArrowLeft, AlertCircle, Check, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch, apiUpload } from "@/lib/api";
import clsx from "clsx";

interface UploadFile { file: File; docType: string; status: "pending" | "uploading" | "done" | "error"; error?: string; }

const ZONES = [
  { type: "caiet_de_sarcini", label: "Caiet de Sarcini", desc: "Cerințe tehnice (.docx)", color: "#00d4aa", multiple: true },
  { type: "fisa_de_date", label: "Fișa de Date", desc: "Cerințe administrative (.docx)", color: "#a855f7", multiple: false },
  { type: "propunere_tehnica", label: "Propunere Tehnică", desc: "Documentul de verificat (.docx)", color: "#ffa502", multiple: true },
] as const;

export default function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const addFiles = (docType: string, multiple: boolean, newFiles: File[]) => {
    const valid = newFiles.filter((f) => f.name.toLowerCase().endsWith(".docx"));
    if (!valid.length) { setError("Doar fișiere .docx"); return; }
    setFiles((prev) => {
      if (!multiple) {
        const cleaned = prev.filter((f) => f.docType !== docType);
        return [...cleaned, { file: valid[0], docType, status: "pending" }];
      }
      return [...prev, ...valid.map((file) => ({ file, docType, status: "pending" as const }))];
    });
    setError(null);
  };

  const handleDrop = (type: string, multiple: boolean) => (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(type, multiple, Array.from(e.dataTransfer.files));
  };

  const handleSelect = (type: string, multiple: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(type, multiple, Array.from(e.target.files || []));
  };

  const removeFile = (idx: number) => setFiles((p) => p.filter((_, i) => i !== idx));

  const handleCreate = async () => {
    if (!name.trim()) { setError("Numele proiectului e obligatoriu"); return; }
    if (!files.length) { setError("Adaugă cel puțin un document"); return; }
    setCreating(true); setError(null);

    try {
      let pid = createdProjectId;
      if (!pid) {
        const proj = await apiFetch<{ id: string }>("/projects", {
          method: "POST", body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
        });
        pid = proj.id;
        setCreatedProjectId(pid);
      }

      let fails = 0;
      for (let i = 0; i < files.length; i++) {
        setFiles((p) => p.map((f, j) => j === i ? { ...f, status: "uploading" } : f));
        const fd = new FormData();
        fd.append("file", files[i].file);
        fd.append("doc_type", files[i].docType);
        try {
          await apiUpload(`/projects/${pid}/documents`, fd);
          setFiles((p) => p.map((f, j) => j === i ? { ...f, status: "done" } : f));
        } catch (err: any) {
          fails++;
          setFiles((p) => p.map((f, j) => j === i ? { ...f, status: "error", error: err.message } : f));
        }
      }
      if (fails) { setError(`${fails} fișier(e) eșuate.`); setCreating(false); return; }
      navigate(`/projects/${pid}`);
    } catch (err: any) { setError(err.message); setCreating(false); }
  };

  const filesFor = (type: string) => files.filter((f) => f.docType === type);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8 anim-fade-up">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Proiect Nou</h1>
      </div>

      {/* Name */}
      <Card className="mb-5 anim-fade-up" style={{ animationDelay: "50ms" }}>
        <CardBody className="space-y-4">
          <div>
            <label className="label-xs mb-1.5 block">Nume Proiect *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="ex: DJ714 — Modernizare drum comunal"
              className="w-full px-4 py-2.5 bg-[var(--bg-void)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-ghost)] focus:outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div>
            <label className="label-xs mb-1.5 block">Descriere</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Opțional"
              className="w-full px-4 py-2.5 bg-[var(--bg-void)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-ghost)] focus:outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
        </CardBody>
      </Card>

      {/* Upload zones */}
      {ZONES.map((z, i) => (
        <Card key={z.type} className="mb-4 anim-fade-up" style={{ animationDelay: `${100 + i * 50}ms` }}>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-7 rounded-full" style={{ background: z.color }} />
              <div>
                <span className="text-sm font-semibold">{z.label}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{z.desc}</span>
              </div>
            </div>
            {filesFor(z.type).length > 0 && <Badge>{filesFor(z.type).length} fișier{filesFor(z.type).length > 1 ? "e" : ""}</Badge>}
          </CardHeader>
          <CardBody>
            <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop(z.type, z.multiple)} className="relative group">
              <label className="flex flex-col items-center py-7 border border-dashed border-[var(--border)] rounded-[var(--radius-md)] cursor-pointer hover:border-[var(--accent)]/40 hover:bg-[var(--accent-glow)] transition-all">
                <Upload className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors mb-2" />
                <span className="text-[13px] text-[var(--text-secondary)]">
                  Drag & drop sau <span className="text-[var(--accent)] font-medium">selectează</span>
                </span>
                <span className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  .docx {z.multiple ? "(multiple)" : "(un fișier)"}
                </span>
                <input type="file" accept=".docx" multiple={z.multiple} onChange={handleSelect(z.type, z.multiple)} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
            </div>
            {filesFor(z.type).length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                {filesFor(z.type).map((f) => {
                  const gi = files.indexOf(f);
                  return (
                    <div key={`${f.file.name}-${f.file.size}-${gi}`}
                      className="flex items-center justify-between px-3 py-2 bg-[var(--bg-void)] border border-[var(--border)] rounded-[var(--radius-sm)]">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                        <span className="text-[13px] truncate">{f.file.name}</span>
                        <span className="mono text-[10px] text-[var(--text-muted)]">{(f.file.size/1e6).toFixed(1)}MB</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {f.status === "uploading" && <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />}
                        {f.status === "done" && <Check className="w-3.5 h-3.5 text-[var(--conform)]" />}
                        {f.status === "error" && <span className="mono text-[10px] text-[var(--neconform)]">{f.error}</span>}
                        {f.status === "pending" && <button onClick={() => removeFile(gi)} className="p-0.5 hover:bg-[var(--bg-elevated)] rounded"><X className="w-3 h-3 text-[var(--text-muted)]" /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      ))}

      {/* Tip */}
      <div className="flex items-start gap-3 px-4 py-3 bg-[var(--accent-glow)] border border-[var(--accent)]/10 rounded-[var(--radius-md)] mb-5 anim-fade-up" style={{ animationDelay: "250ms" }}>
        <AlertCircle className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          <strong className="text-[var(--accent)]">Tip:</strong> Dacă sursa e PDF, convertește în Word cu Adobe Acrobat înainte de upload.
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--neconform)]/10 border border-[var(--neconform)]/20 rounded-[var(--radius-md)] mb-5 text-sm text-[var(--neconform)]">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>
          {createdProjectId && <Link to={`/projects/${createdProjectId}`} className="text-[var(--accent)] hover:underline text-xs">Mergi la proiect →</Link>}
        </div>
      )}

      <div className="flex justify-end gap-3 anim-fade-up" style={{ animationDelay: "300ms" }}>
        <Link to="/"><Button variant="secondary">Anulează</Button></Link>
        <Button onClick={handleCreate} loading={creating} disabled={!name.trim() || !files.length}>Creează și Procesează</Button>
      </div>
    </div>
  );
}
