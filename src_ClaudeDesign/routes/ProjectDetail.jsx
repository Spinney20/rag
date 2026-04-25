/* Project Detail — pipeline stepper + documents */

const ProjectDetail = ({ project, go }) => {
  // Determine stage progress
  const stageState = {
    documents: "done",
    requirements: project.status === "created" || project.status === "documents_ready" ? "idle"
                 : project.status === "requirements_extracted" || project.status === "evaluation_running" || project.status === "evaluated" ? "done"
                 : "active",
    evaluation: project.status === "evaluation_running" ? "active"
               : project.status === "evaluated" ? "done"
               : "idle",
    report: project.status === "evaluated" ? "done" : "idle",
  };

  const currentStageIdx = project.status === "created" || project.status === "documents_ready" ? 0
                       : project.status === "requirements_extracted" ? 1
                       : project.status === "evaluation_running" ? 2
                       : project.status === "evaluated" ? 3 : 0;

  const primaryAction = (() => {
    switch (project.status) {
      case "documents_ready":          return { label: "Extrage cerințele", onClick: () => go(`/projects/${project.id}/requirements`), icon: "sparkle" };
      case "requirements_extracted":   return { label: "Revizuiește cerințele", onClick: () => go(`/projects/${project.id}/requirements`), icon: "list" };
      case "evaluation_running":       return { label: "Vezi progresul evaluării", onClick: () => go(`/projects/${project.id}/evaluation`), icon: "play" };
      case "evaluated":                return { label: "Vezi rezultatele", onClick: () => go(`/projects/${project.id}/evaluation`), icon: "arrowR" };
      default:                         return { label: "Procesează documentele", onClick: () => {}, icon: "cpu" };
    }
  })();

  return (
    <div className="page fadein">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            PROIECT · <span className="mono" style={{ color: "var(--amber-ink)" }}>{project.id.toUpperCase()}</span>
          </div>
          <div className="h1">{project.name}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 18, fontSize: 13, color: "var(--ink-2)", flexWrap: "wrap" }}>
            <span><Icon name="shield" size={12} style={{ marginRight: 4, verticalAlign: "middle", color: "var(--ink-3)" }} />{project.authority}</span>
            <span>Valoare estimată · <span className="mono" style={{ color: "var(--ink-0)" }}>{project.value}</span></span>
            <span>Creat · <span className="mono">{project.created}</span></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {project.status === "evaluated" && (
            <Button icon="download" onClick={() => go(`/projects/${project.id}/report`)}>Descarcă raport</Button>
          )}
          <Button variant="primary" icon={primaryAction.icon} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        </div>
      </div>

      {/* Pipeline stepper */}
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>PIPELINE PROCESARE</div>
        <div className="stepper">
          {window.PIPELINE_STAGES.map((st, i) => {
            const state = stageState[st.key];
            return (
              <div key={st.key} className={`step ${state}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="step-num">
                    {state === "done" ? <Icon name="check" size={12} /> : i + 1}
                  </div>
                  <div className="step-label">ETAPA {i + 1}</div>
                </div>
                <div className="step-title">{st.label}</div>
                <div className="step-sub">{st.sub}</div>
                {state === "active" && (
                  <div style={{ marginTop: 12 }}>
                    <Meter value={0.62} />
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--amber)", marginTop: 6 }}>
                      <Icon name="bolt" size={10} style={{ verticalAlign: "middle", marginRight: 3 }} />
                      ÎN PROGRES · 62%
                    </div>
                  </div>
                )}
                {state === "done" && (
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--conform)", marginTop: 12, letterSpacing: "0.08em" }}>
                    ✓ FINALIZAT
                  </div>
                )}
                {state === "idle" && (
                  <div className="mono dim" style={{ fontSize: 10.5, marginTop: 12, letterSpacing: "0.08em" }}>
                    ÎN AȘTEPTARE
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <Panel title="Documente sursă" eyebrow="4 FIȘIERE" actions={<Button size="sm" icon="plus" variant="ghost">Adaugă</Button>}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Tip</th>
                <th>Fișier</th>
                <th style={{ width: 80 }}>Dim.</th>
                <th style={{ width: 70 }}>Pagini</th>
                <th style={{ width: 80 }}>Titluri</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {window.MOCK_DOCUMENTS.map(d => (
                <tr key={d.id}>
                  <td>
                    <span className={`badge ${d.type === "PT" ? "badge-amber" : ""}`} style={{ fontSize: 10 }}>{d.type}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon name="file" size={14} className="dim" />
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink-0)" }}>{d.name}</span>
                    </div>
                  </td>
                  <td className="mono num dim" style={{ fontSize: 11.5 }}>{d.size}</td>
                  <td className="mono num" style={{ fontSize: 12, color: "var(--ink-1)" }}>{d.pages}</td>
                  <td className="mono num" style={{ fontSize: 12, color: "var(--ink-1)" }}>{d.headings}</td>
                  <td>
                    <span className="badge verdict-conform" style={{ fontSize: 10 }}>
                      <span className="dot" /> Indexat
                    </span>
                  </td>
                  <td><IconButton name="eye" title="Deschide" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Context curent" eyebrow="STARE">
            <div style={{ padding: "6px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div className="label" style={{ marginBottom: 4 }}>ETAPA CURENTĂ</div>
                <div style={{ fontSize: 14, color: "var(--ink-0)" }}>
                  {window.PIPELINE_STAGES[currentStageIdx].label}
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 4 }}>CERINȚE DETECTATE</div>
                <div className="num mono" style={{ fontSize: 20, color: "var(--ink-0)" }}>
                  {project.status === "created" || project.status === "documents_ready" ? "—" : "175"}
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 4 }}>STANDARDE REFERENȚIATE</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                  {["SR EN 206", "SR 438-1", "SR EN 10138-3", "NE 012", "SR EN ISO 9001"].map(s => (
                    <span key={s} className="code">{s}</span>
                  ))}
                  <span className="mono dim" style={{ fontSize: 11, alignSelf: "center" }}>+ 23 altele</span>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Jurnal procesare" eyebrow="EVENIMENTE">
            <div style={{ padding: "6px 18px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                ["16:42:18", "Document indexat", "Propunere_Tehnica.docx"],
                ["16:41:52", "Chunking finalizat", "412 chunks"],
                ["16:41:30", "Embeddings generate", "bge-m3-ro"],
                ["16:40:18", "Parsare DOCX", "276 titluri detectate"],
                ["16:39:52", "Upload finalizat", "4/4 fișiere"],
              ].map((l, i) => (
                <div key={i} className="mono" style={{ fontSize: 11, color: "var(--ink-2)", display: "flex", gap: 10, padding: "4px 0" }}>
                  <span style={{ color: "var(--ink-3)" }}>{l[0]}</span>
                  <span style={{ color: "var(--ink-0)" }}>{l[1]}</span>
                  <span style={{ color: "var(--ink-3)", marginLeft: "auto" }}>{l[2]}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ProjectDetail });
