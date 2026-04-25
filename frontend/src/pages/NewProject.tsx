import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  Info,
  AlertTriangle,
  Check,
  X,
  Trash2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { apiFetch, apiUpload } from "@/lib/api";

interface UploadFile {
  id: string;
  file: File;
  docType: DocType;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

type DocType = "caiet_de_sarcini" | "fisa_de_date" | "propunere_tehnica";

interface ZoneSpec {
  type: DocType;
  code: string;
  label: string;
  desc: string;
  multiple: boolean;
}

const ZONES: ZoneSpec[] = [
  {
    type: "caiet_de_sarcini",
    code: "CS",
    label: "Caiet de Sarcini",
    desc: "Documentul emis de autoritatea contractantă — cerințele tehnice care trebuie verificate.",
    multiple: true,
  },
  {
    type: "fisa_de_date",
    code: "FDA",
    label: "Fișa de Date",
    desc: "Fișa de date a achiziției — cadrul administrativ și procedural.",
    multiple: false,
  },
  {
    type: "propunere_tehnica",
    code: "PT",
    label: "Propunere Tehnică",
    desc: "Documentul ofertantului — propunerea pe care o verificăm împotriva Caietului de Sarcini.",
    multiple: false,
  },
];

export default function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const filesFor = (type: DocType) => files.filter((f) => f.docType === type);
  const readyCount = files.filter((f) => f.status === "done").length;
  const hasAllRequired =
    filesFor("caiet_de_sarcini").length > 0 &&
    filesFor("fisa_de_date").length > 0 &&
    filesFor("propunere_tehnica").length > 0;
  const canSubmit = name.trim().length > 0 && hasAllRequired && !creating;

  const addFiles = (type: DocType, multiple: boolean, raw: File[]) => {
    const valid = raw.filter((f) => f.name.toLowerCase().endsWith(".docx"));
    if (valid.length === 0) {
      setError("Sunt acceptate doar fișiere .docx");
      return;
    }
    setError(null);
    setFiles((prev) => {
      if (!multiple) {
        const cleaned = prev.filter((f) => f.docType !== type);
        return [
          ...cleaned,
          {
            id: `${Date.now()}-${valid[0].name}`,
            file: valid[0],
            docType: type,
            status: "pending",
          },
        ];
      }
      return [
        ...prev,
        ...valid.map((file) => ({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          docType: type,
          status: "pending" as const,
        })),
      ];
    });
  };

  const removeFile = (id: string) => setFiles((p) => p.filter((f) => f.id !== id));

  const handleCreate = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    try {
      let pid = createdProjectId;
      if (!pid) {
        const proj = await apiFetch<{ id: string }>("/projects", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
          }),
        });
        pid = proj.id;
        setCreatedProjectId(pid);
      }

      let fails = 0;
      for (const f of files) {
        if (f.status === "done") continue;
        setFiles((p) => p.map((x) => (x.id === f.id ? { ...x, status: "uploading" } : x)));
        const fd = new FormData();
        fd.append("file", f.file);
        fd.append("doc_type", f.docType);
        try {
          await apiUpload(`/projects/${pid}/documents`, fd);
          setFiles((p) => p.map((x) => (x.id === f.id ? { ...x, status: "done" } : x)));
        } catch (err) {
          fails++;
          setFiles((p) =>
            p.map((x) =>
              x.id === f.id
                ? { ...x, status: "error", error: (err as Error).message }
                : x
            )
          );
        }
      }
      if (fails > 0) {
        setError(`${fails} fișier(e) nu s-au putut încărca. Reîncearcă.`);
        setCreating(false);
        return;
      }
      navigate(`/projects/${pid}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="page fadein" style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">PROIECT NOU</div>
        <div className="h1" style={{ marginTop: 8 }}>
          Începe o verificare de conformitate
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 14, maxWidth: 680 }}>
          Numește proiectul, apoi încarcă Caietul de Sarcini, Fișa de Date și Propunerea Tehnică.
          Motorul va porni procesarea automat.
        </div>
      </div>

      <Panel>
        {/* Form */}
        <div
          style={{
            padding: "22px 26px",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 20,
          }}
        >
          <label className="field">
            <span className="label">DENUMIRE PROIECT *</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Reabilitare Pod DN1 km 127+340"
            />
          </label>
          <label className="field">
            <span className="label">DESCRIERE (OPȚIONAL)</span>
            <textarea
              className="textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Câteva cuvinte despre licitație, autoritate, valoare estimată…"
            />
          </label>
        </div>

        <div className="divider" />

        <div style={{ padding: "22px 26px" }}>
          <div className="hint" style={{ marginBottom: 20 }}>
            <Info className="w-4 h-4" />
            <div>
              <strong>Convertește PDF-urile în Word înainte de încărcare.</strong>{" "}
              Folosește Adobe Acrobat — documentele <span className="mono">.docx</span> păstrează
              titlurile, tabelele și structura ierarhică native. Motorul nu face OCR pe PDF, iar
              acuratețea extragerii scade semnificativ pe conținut scanat.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {ZONES.map((z) => (
              <DocZone
                key={z.type}
                spec={z}
                files={filesFor(z.type)}
                onAdd={(raw) => addFiles(z.type, z.multiple, raw)}
                onRemove={removeFile}
                disabled={creating}
              />
            ))}
          </div>
        </div>

        {error && (
          <>
            <div className="divider" />
            <div style={{ padding: "16px 26px" }}>
              <div className="callout err">
                <AlertTriangle className="w-3.5 h-3.5" />
                <div>{error}</div>
                {createdProjectId && (
                  <a
                    style={{ marginLeft: "auto", color: "var(--amber-ink)", cursor: "pointer" }}
                    onClick={() => navigate(`/projects/${createdProjectId}`)}
                  >
                    Mergi la proiect →
                  </a>
                )}
              </div>
            </div>
          </>
        )}

        <div className="divider" />

        <div
          style={{
            padding: "16px 26px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {readyCount > 0 ? (
              <>
                <span style={{ color: "var(--ink-0)" }}>{readyCount}</span> fișier
                {readyCount === 1 ? "" : "e"} pregătit{readyCount === 1 ? "" : "e"}
              </>
            ) : (
              <>{files.length} fișier{files.length === 1 ? "" : "e"} în coadă</>
            )}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="ghost" onClick={() => navigate("/")} disabled={creating}>
              Anulează
            </Button>
            <Button
              variant="primary"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={handleCreate}
              loading={creating}
              disabled={!canSubmit}
            >
              Creează și pornește procesarea
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

interface DocZoneProps {
  spec: ZoneSpec;
  files: UploadFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function DocZone({ spec, files, onAdd, onRemove, disabled }: DocZoneProps) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (disabled) return;
    onAdd(Array.from(e.dataTransfer.files || []));
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    onAdd(Array.from(e.target.files || []));
    if (inputRef.current) inputRef.current.value = "";
  };

  const canAddMore = spec.multiple || files.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div className="eyebrow" style={{ color: "var(--amber)" }}>
          {spec.code}
        </div>
        <div className="h3">{spec.label}</div>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--neconform-ink)" }}>
          • obligatoriu
        </span>
        {spec.multiple && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
            • acceptă mai multe fișiere
          </span>
        )}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
        {spec.desc}
      </div>

      {canAddMore && (
        <label
          className={clsx("dropzone", drag && "drag-over")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                display: "grid",
                placeItems: "center",
                background: "var(--amber-bg)",
                border: "1px solid var(--amber-line)",
                color: "var(--amber)",
                flex: "0 0 auto",
              }}
            >
              <Upload className="w-4 h-4" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--ink-0)" }}>
                Trage fișierul aici sau{" "}
                <span
                  style={{
                    color: "var(--amber-ink)",
                    textDecoration: "underline",
                    textDecorationColor: "var(--amber-line)",
                  }}
                >
                  selectează din calculator
                </span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                Format acceptat: <span style={{ color: "var(--ink-1)" }}>.docx</span> · dim. max.{" "}
                <span style={{ color: "var(--ink-1)" }}>50 MB</span>
              </div>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            multiple={spec.multiple}
            onChange={onPick}
            disabled={disabled}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
          />
        </label>
      )}

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {files.map((f) => (
            <div key={f.id} className="filebar">
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 5,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--line-1)",
                  color:
                    f.status === "done"
                      ? "var(--conform)"
                      : f.status === "error"
                      ? "var(--neconform-ink)"
                      : "var(--amber)",
                  flex: "0 0 auto",
                }}
              >
                {f.status === "uploading" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : f.status === "done" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : f.status === "error" ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-0)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {f.file.name}
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1 }}>
                  {(f.file.size / 1e6).toFixed(1)} MB ·{" "}
                  {f.status === "uploading"
                    ? "Se încarcă..."
                    : f.status === "done"
                    ? "Încărcat"
                    : f.status === "error"
                    ? f.error || "Eroare"
                    : "În așteptare"}
                </div>
              </div>
              {(f.status === "pending" || f.status === "error") && (
                <button
                  className="icon-btn"
                  aria-label="Șterge"
                  title="Șterge"
                  onClick={() => onRemove(f.id)}
                >
                  {f.status === "error" ? <X className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
