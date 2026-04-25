/* Requirements Review */

const CATEGORY_LABELS = {
  tehnic: "Tehnic", materiale: "Materiale", calitate: "Calitate",
  termene: "Termene", personal: "Personal", echipamente: "Echipamente",
  administrativ: "Administrativ",
};

const RequirementCard = ({ req, onEdit, onDelete }) => {
  const [expanded, setExpanded] = React.useState(false);
  const low = req.confidence < 0.80;

  return (
    <div className="req-card" style={low ? { borderColor: "var(--partial-line)" } : undefined}>
      <div className="req-head" onClick={() => setExpanded(e => !e)}>
        <div className="req-id mono">{req.id}</div>
        <div className="req-text">{req.text}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          <Badge kind={`prio-${req.priority}`} icon>
            {req.priority}
          </Badge>
          <span className="badge" style={{ fontSize: 10 }}>{CATEGORY_LABELS[req.category]}</span>
          <span className="mono num" style={{
            fontSize: 11,
            color: req.confidence >= 0.9 ? "var(--conform)" : req.confidence >= 0.8 ? "var(--ink-1)" : "var(--partial)",
            minWidth: 40, textAlign: "right",
          }} title="Încredere extragere LLM">
            {req.confidence.toFixed(2)}
          </span>
          <IconButton name={expanded ? "chevronD" : "chevronR"} title="Extinde" />
        </div>
      </div>
      {expanded && (
        <div className="req-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 14 }}>
            <div>
              <div className="label">VERIFICARE</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-0)", marginTop: 3 }}>{req.verification}</div>
            </div>
            <div>
              <div className="label">SECȚIUNE CS</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-0)", marginTop: 3 }}>{req.section}</div>
            </div>
            <div>
              <div className="label">STANDARDE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
                {req.standards.length > 0 ? req.standards.map(s => <span key={s} className="code amber">{s}</span>) : <span className="dim mono" style={{ fontSize: 11 }}>—</span>}
              </div>
            </div>
          </div>
          {req.flagged && (
            <div className="callout warn" style={{ marginBottom: 10 }}>
              <Icon name="flag" size={13} />
              <div>Încredere scăzută a extragerii. Verifică manual formulare și valorile detectate.</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" icon="edit" onClick={(e) => { e.stopPropagation(); onEdit(req); }}>Editează</Button>
            <Button size="sm" variant="danger" icon="trash" onClick={(e) => { e.stopPropagation(); onDelete(req); }}>Șterge</Button>
          </div>
        </div>
      )}
    </div>
  );
};

const Requirements = ({ project, go }) => {
  const [selectedCat, setSelectedCat] = React.useState("all");
  const [showFlagged, setShowFlagged] = React.useState(false);

  const reqs = window.MOCK_REQUIREMENTS;
  const filtered = reqs.filter(r => {
    if (selectedCat !== "all" && r.category !== selectedCat) return false;
    if (showFlagged && !r.flagged) return false;
    return true;
  });

  // Group by section prefix (Cap. N)
  const grouped = React.useMemo(() => {
    const g = {};
    filtered.forEach(r => {
      const key = r.section.split(" › ")[0];
      (g[key] = g[key] || []).push(r);
    });
    return g;
  }, [filtered]);

  const total = 175;
  const flaggedCount = reqs.filter(r => r.flagged).length + 6;

  return (
    <div className="page fadein" style={{ paddingBottom: 110 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ETAPA 2 · EXTRACȚIE CERINȚE
          </div>
          <div className="h1">Revizuiește cerințele atomice</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 14, maxWidth: 720 }}>
            Motorul a identificat <span className="mono" style={{ color: "var(--ink-0)" }}>{total}</span> cerințe
            atomice în Caietul de Sarcini. Elimină dublurile, corectează extragerile eronate, apoi validează pentru a lansa evaluarea.
          </div>
        </div>
      </div>

      {flaggedCount > 0 && (
        <div className="callout warn" style={{ marginBottom: 18 }}>
          <Icon name="flag" size={14} />
          <div>
            <b>{flaggedCount} cerințe marcate pentru revizuire umană.</b> Motorul are încredere scăzută în extragerea acestora
            (tipic: formulări ambigue, tabele cu structură neregulată, referințe implicite la standarde). Verifică-le înainte de evaluare.
          </div>
          <Button size="sm" onClick={() => setShowFlagged(f => !f)} style={{ marginLeft: "auto" }}>
            {showFlagged ? "Arată toate" : "Arată doar marcate"}
          </Button>
        </div>
      )}

      {/* Category filter row */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          className={`tab ${selectedCat === "all" ? "active" : ""}`}
          style={{
            padding: "10px 14px", borderRadius: 6, border: "1px solid var(--line-1)",
            background: selectedCat === "all" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
          }}
          onClick={() => setSelectedCat("all")}
        >
          Toate
          <span className="count num">{total}</span>
        </button>
        {window.REQUIREMENT_CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`tab ${selectedCat === c.key ? "active" : ""}`}
            style={{
              padding: "10px 14px", borderRadius: 6, border: "1px solid var(--line-1)",
              background: selectedCat === c.key ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
            }}
            onClick={() => setSelectedCat(c.key)}
          >
            {c.label}
            <span className="count num">{c.count}</span>
          </button>
        ))}
      </div>

      {/* Grouped list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {Object.entries(grouped).map(([section, items]) => (
          <div key={section}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Icon name="book" size={13} className="dim" />
              <div className="h3" style={{ fontSize: 14 }}>{section}</div>
              <div className="mono dim" style={{ fontSize: 11 }}>{items.length} cerințe</div>
              <div style={{ flex: 1, height: 1, background: "var(--line-0)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(r => <RequirementCard key={r.id} req={r} onEdit={() => {}} onDelete={() => {}} />)}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky validate bar */}
      <div style={{
        position: "fixed", bottom: 20, left: 252, right: 20,
        maxWidth: 1180, margin: "0 auto",
        background: "var(--bg-glass-2)", backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--line-2)", borderRadius: 10,
        padding: "12px 18px",
        display: "flex", alignItems: "center", gap: 14,
        boxShadow: "0 20px 50px -12px rgba(0,0,0,0.6)",
        zIndex: 40,
      }}>
        <div className="eyebrow" style={{ color: "var(--amber)" }}>GATA DE VALIDARE</div>
        <div style={{ fontSize: 13, color: "var(--ink-0)" }}>
          <span className="mono num" style={{ color: "var(--amber-ink)" }}>{total}</span> cerințe ·{" "}
          <span className="mono num" style={{ color: "var(--partial)" }}>{flaggedCount}</span> marcate
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Button variant="ghost">Salvează schiță</Button>
          <Button variant="primary" icon="arrowR" onClick={() => go(`/projects/${project.id}/evaluation`)}>
            Validează și lansează evaluarea
          </Button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Requirements });
