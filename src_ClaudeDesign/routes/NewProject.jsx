/* Create Project — name + 3 upload zones */

const DocZone = ({ type, label, desc, required, multi, files, onAdd, onRemove }) => {
  const [drag, setDrag] = React.useState(false);

  const simulate = (names) => {
    names.forEach((n, i) => {
      const id = `f-${Date.now()}-${i}`;
      onAdd({ id, name: n, size: `${(2 + Math.random() * 10).toFixed(1)} MB`, status: "uploading", progress: 0 });
      // simulate progress
      let p = 0;
      const tick = () => {
        p += 0.08 + Math.random() * 0.18;
        if (p >= 1) {
          onAdd({ id, name: n, size: `${(2 + Math.random() * 10).toFixed(1)} MB`, status: "uploaded", progress: 1 }, true);
        } else {
          onAdd({ id, name: n, size: `${(2 + Math.random() * 10).toFixed(1)} MB`, status: "uploading", progress: p }, true);
          setTimeout(tick, 120);
        }
      };
      setTimeout(tick, 180);
    });
  };

  const canAddMore = multi || files.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div className="eyebrow" style={{ color: "var(--amber)" }}>{type}</div>
        <div className="h3">{label}</div>
        {required && <span className="mono" style={{ fontSize: 10.5, color: "oklch(0.78 0.12 20)" }}>• obligatoriu</span>}
        {multi && <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>• acceptă mai multe fișiere</span>}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>{desc}</div>

      {canAddMore && (
        <div
          className={`dropzone ${drag ? "filled" : ""}`}
          style={drag ? { borderColor: "var(--amber-line)", background: "var(--amber-bg)" } : undefined}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault(); setDrag(false);
            const names = Array.from(e.dataTransfer.files || []).map(f => f.name);
            if (names.length) simulate(names);
          }}
          onClick={() => {
            // simulate picker — drop in a plausible filename
            const demo = type === "CS" ? "Caiet_Sarcini_v2.docx"
                      : type === "FDA" ? "Fisa_Date_Achizitie.docx"
                      : "Propunere_Tehnica.docx";
            simulate([demo]);
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 6,
              display: "grid", placeItems: "center",
              background: "var(--amber-bg)", border: "1px solid var(--amber-line)",
              color: "var(--amber)", flex: "0 0 auto",
            }}>
              <Icon name="upload" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--ink-0)" }}>
                Trage fișierul aici sau <span style={{ color: "var(--amber-ink)", textDecoration: "underline", textDecorationColor: "var(--amber-line)" }}>selectează din calculator</span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                Format acceptat: <span style={{ color: "var(--ink-1)" }}>.docx</span> · dim. max. <span style={{ color: "var(--ink-1)" }}>50 MB</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {files.map(f => (
            <div key={f.id} className="filebar">
              <div style={{
                width: 30, height: 30, borderRadius: 5,
                display: "grid", placeItems: "center",
                background: "rgba(255,255,255,0.03)", border: "1px solid var(--line-1)",
                color: f.status === "uploaded" ? "var(--conform)" : f.status === "error" ? "var(--neconform)" : "var(--amber)",
              }}>
                <Icon name={f.status === "uploaded" ? "check" : f.status === "error" ? "warn" : "file"} size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "var(--ink-0)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.name}
                </div>
                {f.status === "uploading" ? (
                  <div style={{ marginTop: 4 }}>
                    <Meter value={f.progress} />
                  </div>
                ) : (
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1 }}>
                    {f.size} · {f.status === "uploaded" ? "Încărcat" : f.status === "error" ? "Eroare" : "În așteptare"}
                  </div>
                )}
              </div>
              <IconButton name="trash" title="Șterge" onClick={() => onRemove(f.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NewProject = ({ go }) => {
  const [name, setName] = React.useState("Reabilitare Pasaj Rutier DN7 km 44+200");
  const [desc, setDesc] = React.useState("CNAIR — consolidare suprastructură, reabilitare hidroizolație, înlocuire cale pod");
  const [files, setFiles] = React.useState({ CS: [], FDA: [], PT: [] });

  const addFile = (type) => (file, update = false) => {
    setFiles(prev => {
      const list = prev[type];
      const existing = list.findIndex(f => f.id === file.id);
      if (existing >= 0) {
        const next = list.slice();
        next[existing] = file;
        return { ...prev, [type]: next };
      }
      return { ...prev, [type]: [...list, file] };
    });
  };
  const removeFile = (type) => (id) => {
    setFiles(prev => ({ ...prev, [type]: prev[type].filter(f => f.id !== id) }));
  };

  const readyCount = Object.values(files).flat().filter(f => f.status === "uploaded").length;
  const canSubmit = name.trim() && files.CS.some(f => f.status === "uploaded") && files.FDA.some(f => f.status === "uploaded") && files.PT.some(f => f.status === "uploaded");

  return (
    <div className="page fadein" style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">PROIECT NOU</div>
        <div className="h1" style={{ marginTop: 8 }}>Începe o verificare de conformitate</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 14, maxWidth: 680 }}>
          Numește proiectul, apoi încarcă Caietul de Sarcini, Fișa de Date și Propunerea Tehnică. Motorul va porni procesarea automat.
        </div>
      </div>

      <Panel>
        <div style={{ padding: "22px 26px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <label className="field">
            <span className="label">DENUMIRE PROIECT *</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="ex. Reabilitare Pod DN1 km 127+340" />
          </label>
          <label className="field">
            <span className="label">AUTORITATE CONTRACTANTĂ</span>
            <input className="input" placeholder="ex. CNAIR S.A." defaultValue="CNAIR S.A." />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="label">DESCRIERE (OPȚIONAL)</span>
            <textarea className="textarea" rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
          </label>
        </div>

        <div className="divider" />

        <div style={{ padding: "22px 26px" }}>
          <div className="hint" style={{ marginBottom: 20 }}>
            <Icon name="info" size={14} className="icon" />
            <div>
              <b>Convertește PDF-urile în Word înainte de încărcare.</b> Folosește Adobe Acrobat — documentele .docx păstrează
              titlurile, tabelele și structura ierarhică native. Motorul nu face OCR pe PDF, iar acuratețea extragerii scade
              semnificativ pe conținut scanat.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <DocZone
              type="CS"
              label="Caiet de Sarcini"
              desc="Documentul emis de autoritatea contractantă — cerințele tehnice care trebuie verificate."
              required multi
              files={files.CS}
              onAdd={addFile("CS")}
              onRemove={removeFile("CS")}
            />
            <DocZone
              type="FDA"
              label="Fișa de Date"
              desc="Fișa de date a achiziției — cadrul administrativ."
              required
              files={files.FDA}
              onAdd={addFile("FDA")}
              onRemove={removeFile("FDA")}
            />
            <DocZone
              type="PT"
              label="Propunere Tehnică"
              desc="Documentul ofertantului — propunerea pe care o verificăm împotriva Caietului de Sarcini."
              required
              files={files.PT}
              onAdd={addFile("PT")}
              onRemove={removeFile("PT")}
            />
          </div>
        </div>

        <div className="divider" />

        <div style={{ padding: "16px 26px", display: "flex", alignItems: "center", gap: 14 }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {readyCount > 0 ? <><span style={{ color: "var(--ink-0)" }}>{readyCount}</span> fișier{readyCount !== 1 ? "e" : ""} pregătit{readyCount !== 1 ? "e" : ""}</> : "Niciun fișier încărcat"}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="ghost" onClick={() => go("/")}>Anulează</Button>
            <Button variant="primary" icon="arrowR" disabled={!canSubmit} onClick={() => go("/projects/p-001")}
              style={canSubmit ? undefined : { opacity: 0.4, pointerEvents: "none" }}>
              Creează proiect și pornește procesarea
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
};

Object.assign(window, { NewProject });
