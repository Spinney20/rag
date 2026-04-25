/* Final Report */

const Report = ({ project, go }) => {
  const totals = window.VERDICT_TOTALS;
  const total = totals.conform + totals.neconform + totals.partial + totals.insuf;
  const compliance = Math.round((totals.conform + totals.partial * 0.5) / total * 100);

  const problems = window.MOCK_EVAL_RESULTS.filter(r => r.verdict === "NECONFORM" || r.verdict === "PARTIAL");

  return (
    <div className="page fadein">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ETAPA 4 · RAPORT EXECUTIV · <span style={{ color: "var(--amber-ink)" }}>FINALIZAT</span>
          </div>
          <div className="h1">Raport Conformitate</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
            {project.name} · generat {new Date().toLocaleDateString("ro-RO")} · <span className="mono">RUN-7F3A-2026</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button icon="download">Export PDF</Button>
          <Button icon="link" variant="ghost">Link partajare</Button>
        </div>
      </div>

      {/* Headline */}
      <Panel>
        <div style={{ padding: "28px 32px", display: "grid", gridTemplateColumns: "auto 1fr", gap: 40, alignItems: "center" }}>
          <Ring
            value={compliance / 100}
            size={168}
            stroke={10}
            color={compliance >= 90 ? "var(--conform)" : compliance >= 80 ? "var(--partial)" : "var(--neconform)"}
            label={`${compliance}%`}
            sub="CONFORMITATE"
          />
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>SCOR GLOBAL</div>
            <div className="h2" style={{ marginBottom: 12, maxWidth: 620 }}>
              Propunerea Tehnică acoperă <span style={{ color: "var(--amber-ink)" }}>86%</span> din cerințele Caietului de Sarcini
              — cu <span style={{ color: "oklch(0.78 0.12 20)" }}>11 neconformități</span> identificate, dintre care{" "}
              <span style={{ color: "oklch(0.78 0.12 20)" }}>3 critice</span>.
            </div>

            {/* Stacked distribution bar */}
            <div style={{ margin: "20px 0 10px" }}>
              <StackBar parts={[
                { pct: totals.conform / total,   color: "var(--conform)" },
                { pct: totals.partial / total,   color: "var(--partial)" },
                { pct: totals.insuf / total,     color: "var(--insuf)" },
                { pct: totals.neconform / total, color: "var(--neconform)" },
              ]} />
              <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", fontSize: 12 }}>
                <LegendDot color="var(--conform)"   label={`Conform · ${totals.conform}`} />
                <LegendDot color="var(--partial)"   label={`Parțial · ${totals.partial}`} />
                <LegendDot color="var(--insuf)"     label={`Insuficient · ${totals.insuf}`} />
                <LegendDot color="var(--neconform)" label={`Neconform · ${totals.neconform}`} />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Health */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 18 }}>
        <HealthTile label="CITATE VERIFICATE" value="98.4 %" sub="re-regăsite în PT sursă" tone="ok" />
        <HealthTile label="CERINȚE DE REVIZUIT" value="6"    sub="încredere LLM scăzută" tone="warn" />
        <HealthTile label="ERORI EVALUARE" value="0"         sub="niciun eșec de procesare" tone="ok" />
        <HealthTile label="ACOPERIRE RETRIEVAL" value="100 %" sub="toate cerințele analizate" tone="ok" />
      </div>

      {/* Warning banner */}
      <div className="callout" style={{
        marginTop: 18,
        borderLeftColor: "var(--conform)",
        background: "var(--conform-bg)",
        borderColor: "var(--conform-line)",
      }}>
        <Icon name="shield" size={14} style={{ color: "var(--conform)" }} />
        <div>
          <b>Raport validat.</b> Indicatorii de sănătate sunt în parametri normali —{" "}
          <span className="mono">98.4%</span> dintre citatele returnate de motor au fost re-verificate cu succes în documentul sursă.
          Raportul poate fi folosit în procesul de decizie.
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, marginTop: 22 }}>
        <Panel title="Conformitate pe categorii" eyebrow="DISTRIBUȚIE">
          <div style={{ padding: "4px 22px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Materiale",    c: 48, n: 2, p: 2, i: 0 },
              { label: "Tehnic",       c: 86, n: 3, p: 4, i: 1 },
              { label: "Calitate",     c: 26, n: 0, p: 2, i: 0 },
              { label: "Termene",      c: 14, n: 0, p: 0, i: 0 },
              { label: "Personal",     c: 15, n: 0, p: 1, i: 2 },
              { label: "Echipamente",  c: 8,  n: 1, p: 2, i: 0 },
              { label: "Administrativ",c: 5,  n: 0, p: 1, i: 2 },
            ].map((row, i) => {
              const t = row.c + row.n + row.p + row.i;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 120px", gap: 14, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--ink-0)" }}>{row.label}</span>
                  <StackBar parts={[
                    { pct: row.c/t, color: "var(--conform)" },
                    { pct: row.p/t, color: "var(--partial)" },
                    { pct: row.i/t, color: "var(--insuf)" },
                    { pct: row.n/t, color: "var(--neconform)" },
                  ]} />
                  <span className="mono num" style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>
                    <span style={{ color: "var(--ink-0)" }}>{Math.round(row.c/t*100)}%</span> · {t} tot.
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Standarde" eyebrow="ACOPERIRE">
          <div style={{ padding: "4px 22px 22px" }}>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
              <span className="num mono" style={{ color: "var(--ink-0)" }}>28</span> standarde distincte referențiate în CS
            </div>
            {[
              ["SR EN 206+A2:2021",      "Conform"],
              ["SR 438-1:2012",          "Parțial"],
              ["SR EN 10138-3:2013",     "Conform"],
              ["SR EN ISO 9001:2015",    "Conform"],
              ["NE 012/1-2022",          "Conform"],
              ["STAS 7721-90",           "Parțial"],
              ["SR EN 12620+A1:2008",    "Conform"],
            ].map(([code, verdict], i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 0", borderBottom: i < 6 ? "1px solid var(--line-0)" : "none",
              }}>
                <span className="code amber">{code}</span>
                <span style={{ marginLeft: "auto" }}>
                  <VerdictBadge verdict={verdict === "Conform" ? "CONFORM" : "PARTIAL"} />
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Problems list */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div className="eyebrow">ITEMI DE ACȚIONAT</div>
          <div className="h2" style={{ fontSize: 20 }}>
            <span style={{ color: "oklch(0.78 0.12 20)" }}>{totals.neconform}</span> neconformități ·{" "}
            <span style={{ color: "var(--partial)" }}>{totals.partial}</span> parțiale
          </div>
          <div style={{ flex: 1, height: 1, background: "var(--line-0)" }} />
          <Button size="sm" icon="arrowR" onClick={() => go(`/projects/${project.id}/evaluation`)}>Deschide în evaluare</Button>
        </div>

        <Panel>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 100 }}>ID</th>
                <th style={{ width: 110 }}>Verdict</th>
                <th>Cerință</th>
                <th style={{ width: 120 }}>Categorie</th>
                <th style={{ width: 80 }}>Secț. CS</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {problems.concat([
                { id: "EV-0147", reqId: "REQ-0147", verdict: "NECONFORM", req: "Strat hidroizolație tip KAI cu grosime minimă 5 mm", cs: { section: "Cap. 3 › 3.4", page: 58 }, _cat: "Materiale" },
                { id: "EV-0189", reqId: "REQ-0189", verdict: "NECONFORM", req: "Certificat managementul mediului ISO 14001:2015 al ofertantului", cs: { section: "Cap. 5 › 5.3", page: 102 }, _cat: "Calitate" },
                { id: "EV-0222", reqId: "REQ-0222", verdict: "PARTIAL",   req: "Dispunerea pilonilor cu piloți Ø1200 mm foraj rotativ tubulat", cs: { section: "Cap. 4 › 4.2", page: 76 }, _cat: "Tehnic" },
              ]).map((r, i) => (
                <tr key={r.id}>
                  <td className="mono num dim" style={{ fontSize: 11 }}>{String(i + 1).padStart(2, "0")}</td>
                  <td><span className="code amber">{r.reqId}</span></td>
                  <td><VerdictBadge verdict={r.verdict} /></td>
                  <td style={{ fontSize: 13, color: "var(--ink-0)" }}>{r.req}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r._cat || "Tehnic"}</td>
                  <td className="mono num" style={{ fontSize: 11.5, color: "var(--ink-1)" }}>p. {r.cs.page}</td>
                  <td><Icon name="chevronR" size={13} className="dim" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div style={{ marginTop: 36, paddingTop: 18, borderTop: "1px solid var(--line-0)", display: "flex", gap: 18, fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--ff-mono)" }}>
        <span>Motor: claude-haiku-4.5</span>
        <span>·</span>
        <span>Embeddings: bge-m3-ro (1024d)</span>
        <span>·</span>
        <span>Retrieval: hybrid bm25 + vector (0.4 / 0.6)</span>
        <span>·</span>
        <span>Run duration: 7m 42s</span>
        <span style={{ marginLeft: "auto" }}>Hash verificabilitate: <span style={{ color: "var(--ink-1)" }}>sha256:9a3f…4c81</span></span>
      </div>
    </div>
  );
};

const LegendDot = ({ color, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-1)" }}>
    <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
    {label}
  </span>
);

const HealthTile = ({ label, value, sub, tone }) => {
  const color = tone === "ok" ? "var(--conform)" : tone === "warn" ? "var(--partial)" : "var(--neconform)";
  return (
    <div className="kpi">
      <div className="eyebrow">{label}</div>
      <div className="big num" style={{ color }}>{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
};

Object.assign(window, { Report });
