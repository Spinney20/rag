/* Dashboard — project list */

const Dashboard = ({ projects, go }) => {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");

  const counts = React.useMemo(() => ({
    all: projects.length,
    running: projects.filter(p => p.status === "evaluation_running").length,
    warn: projects.filter(p => p.status === "error" || (p.compliance !== null && p.compliance !== undefined && p.compliance < 90)).length,
    done: projects.filter(p => p.status === "evaluated").length,
  }), [projects]);

  const filtered = projects.filter(p => {
    if (filter === "running" && p.status !== "evaluation_running") return false;
    if (filter === "done" && p.status !== "evaluated") return false;
    if (filter === "warn" && !(p.status === "error" || (p.compliance !== null && p.compliance !== undefined && p.compliance < 90))) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page fadein">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 28 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>PROIECTE / VERIFICĂRI DE CONFORMITATE</div>
          <div className="h1">Bună seara, Andrei.</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 14, maxWidth: 620 }}>
            8 proiecte active · ultima evaluare finalizată acum 14 minute.
            Motorul de retrieval hibrid rulează la <span className="mono" style={{ color: "var(--amber-ink)" }}>99.7%</span> disponibilitate.
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" icon="plus" size="lg" onClick={() => go("/projects/new")}>
            Proiect nou
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <KPI eyebrow="TOTAL PROIECTE" value={counts.all} sub="Active și arhivate" />
        <KPI eyebrow="ÎN PROCESARE" value={counts.running} sub="Evaluări în curs" accent="var(--amber)" />
        <KPI eyebrow="CU NECONFORMITĂȚI" value={counts.warn} sub="Scor &lt; 90% sau eroare" accent="oklch(0.78 0.12 20)" />
        <KPI eyebrow="FINALIZATE" value={counts.done} sub="Raport disponibil" accent="var(--conform)" />
      </div>

      <Panel>
        <div className="panel-header">
          <div className="h3">Toate proiectele</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Tabs
              value={filter}
              onChange={setFilter}
              items={[
                { key: "all",     label: "Toate",            count: counts.all },
                { key: "running", label: "Procesare",        count: counts.running },
                { key: "warn",    label: "Cu neconformități",count: counts.warn },
                { key: "done",    label: "Finalizate",       count: counts.done },
              ]}
            />
            <div style={{ position: "relative" }}>
              <Icon name="search" size={13} className="icon" style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                color: "var(--ink-3)",
              }} />
              <input
                className="input"
                placeholder="Caută proiect..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: 220, padding: "7px 12px 7px 30px", fontSize: 12.5 }}
              />
            </div>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "34%" }}>Proiect</th>
              <th>Autoritate</th>
              <th style={{ width: 100 }}>Valoare</th>
              <th style={{ width: 160 }}>Status</th>
              <th style={{ width: 180 }}>Conformitate</th>
              <th style={{ width: 90 }}>Creat</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => <ProjectRow key={p.id} project={p} onClick={() => go(`/projects/${p.id}`)} />)}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon="search"
              title="Nu am găsit proiecte"
              description="Ajustează filtrele sau creează un proiect nou."
              action={<Button variant="primary" icon="plus" onClick={() => go("/projects/new")}>Proiect nou</Button>}
            />
          </div>
        )}
      </Panel>

      <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <Panel title="Activitate recentă" eyebrow="JURNAL SISTEM">
          <div style={{ padding: "4px 18px 18px" }}>
            {[
              { t: "acum 14 min", ic: "check", color: "var(--conform)",  msg: <>Evaluare finalizată · <span className="mono">p-001</span> · <span className="mono">175</span> cerințe / <span className="mono">86%</span> conformitate</> },
              { t: "acum 38 min", ic: "sparkle", color: "var(--amber)",  msg: <>Evaluare lansată · <span className="mono">p-002</span> · cost estimat <span className="mono">€4.10</span></> },
              { t: "acum 2 ore",  ic: "cpu",    color: "var(--ink-2)",   msg: <>Extracție cerințe · <span className="mono">p-003</span> · <span className="mono">124</span> cerințe atomice detectate</> },
              { t: "acum 3 ore",  ic: "upload", color: "var(--ink-2)",   msg: <>Documente încărcate · <span className="mono">p-006</span> · <span className="mono">4</span> fișiere · <span className="mono">18.2 MB</span></> },
              { t: "acum 5 ore",  ic: "warn",   color: "oklch(0.78 0.12 20)", msg: <>Eroare parsare · <span className="mono">p-008</span> · document corupt (<span className="mono">DOCX</span> malformat)</> },
            ].map((it, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0", borderBottom: i < 4 ? "1px solid var(--line-0)" : "none",
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 4,
                  display: "grid", placeItems: "center",
                  background: "rgba(255,255,255,0.03)", border: "1px solid var(--line-0)",
                  color: it.color,
                }}>
                  <Icon name={it.ic} size={12} />
                </div>
                <div style={{ flex: 1, fontSize: 13 }}>{it.msg}</div>
                <div className="mono dim" style={{ fontSize: 11 }}>{it.t}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Sistem" eyebrow="SĂNĂTATE MOTOR">
          <div style={{ padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
            <MetricRow label="Latență medie retrieval"      value="187 ms"   ok />
            <MetricRow label="Latență LLM verdict (p50)"     value="2.3 s"    ok />
            <MetricRow label="Acuratețe citate (24h)"        value="98.4 %"   ok />
            <MetricRow label="Coadă de procesare"            value="2 job"   ok />
            <MetricRow label="Utilizare context LLM"         value="68 %"    warn />
            <div className="divider" />
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              Motor: <span className="mono" style={{ color: "var(--ink-1)" }}>claude-haiku-4.5</span> · Embeddings: <span className="mono" style={{ color: "var(--ink-1)" }}>bge-m3-ro</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
};

const MetricRow = ({ label, value, ok, warn, err }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <span className={`status-dot ${ok ? "ok" : warn ? "warn" : err ? "err" : ""}`} />
    <span style={{ fontSize: 12.5, color: "var(--ink-1)" }}>{label}</span>
    <span className="mono num" style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-0)" }}>{value}</span>
  </div>
);

const ProjectRow = ({ project, onClick }) => {
  const hasCompliance = typeof project.compliance === "number";
  return (
    <tr onClick={onClick}>
      <td>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-0)", marginBottom: 3 }}>{project.name}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{project.description}</div>
      </td>
      <td className="muted" style={{ fontSize: 12.5 }}>{project.authority}</td>
      <td className="mono num" style={{ fontSize: 12.5, color: "var(--ink-1)" }}>{project.value}</td>
      <td><StatusChip status={project.status} /></td>
      <td>
        {hasCompliance ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mono num" style={{
              fontSize: 13, fontWeight: 600,
              color: project.compliance >= 90 ? "var(--conform)" : project.compliance >= 80 ? "var(--partial)" : "oklch(0.78 0.12 20)",
            }}>{project.compliance}%</span>
            <div style={{ flex: 1, maxWidth: 100 }}>
              <Meter value={project.compliance / 100} color={project.compliance >= 90 ? "var(--conform)" : project.compliance >= 80 ? "var(--partial)" : "var(--neconform)"} />
            </div>
          </div>
        ) : project.status === "evaluation_running" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mono num" style={{ fontSize: 12, color: "var(--amber)" }}>{Math.round(project.progress * 100)}%</span>
            <div style={{ flex: 1, maxWidth: 100 }}><Meter value={project.progress} /></div>
          </div>
        ) : (
          <span className="dim mono" style={{ fontSize: 12 }}>—</span>
        )}
      </td>
      <td className="mono num dim" style={{ fontSize: 12 }}>{project.created.slice(5)}</td>
      <td><Icon name="chevronR" size={14} className="dim" /></td>
    </tr>
  );
};

Object.assign(window, { Dashboard });
