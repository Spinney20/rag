/* Evaluation route — pre-launch, running, and results */

const VerdictGlyph = ({ v, size = 16 }) => {
  const map = {
    CONFORM:           { ic: "check", color: "var(--conform)"   },
    NECONFORM:         { ic: "x",     color: "oklch(0.78 0.12 20)" },
    PARTIAL:           { ic: "warn",  color: "var(--partial)"   },
    INSUFFICIENT_DATA: { ic: "info",  color: "var(--ink-2)"     },
  };
  const it = map[v] || map.INSUFFICIENT_DATA;
  return (
    <div style={{
      width: size + 10, height: size + 10, borderRadius: 4,
      display: "grid", placeItems: "center",
      background: `color-mix(in oklch, ${it.color} 15%, transparent)`,
      border: `1px solid color-mix(in oklch, ${it.color} 40%, transparent)`,
      color: it.color, flex: "0 0 auto",
    }}>
      <Icon name={it.ic} size={size - 2} strokeWidth={2} />
    </div>
  );
};

const EvalCard = ({ r }) => {
  const [open, setOpen] = React.useState(r.verdict === "NECONFORM");
  return (
    <div className="req-card" style={{
      borderColor: r.verdict === "NECONFORM" ? "var(--neconform-line)" :
                   r.verdict === "PARTIAL"   ? "var(--partial-line)"   :
                   r.verdict === "INSUFFICIENT_DATA" ? "var(--insuf-line)" : "var(--line-1)",
    }}>
      <div className="req-head" onClick={() => setOpen(o => !o)}>
        <VerdictGlyph v={r.verdict} />
        <div className="req-id mono">{r.reqId}</div>
        <div className="req-text" style={{ fontSize: 13 }}>{r.req}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {r.flags && r.flags.includes("critical") && (
            <span className="badge verdict-neconform" style={{ fontSize: 9.5 }}><span className="dot" /> CRITIC</span>
          )}
          {r.flags && r.flags.includes("needs_review") && (
            <span className="badge badge-amber" style={{ fontSize: 9.5 }}><span className="dot" /> REVIZIE</span>
          )}
          {r.flags && r.flags.includes("quote_unverified") && (
            <span className="badge verdict-partial" style={{ fontSize: 9.5 }}><span className="dot" /> CITAT NEVERIF.</span>
          )}
          <VerdictBadge verdict={r.verdict} />
          <span className="mono num dim" style={{ fontSize: 11, minWidth: 38, textAlign: "right" }}>{r.confidence.toFixed(2)}</span>
          <IconButton name={open ? "chevronD" : "chevronR"} title="" />
        </div>
      </div>
      {open && (
        <div className="req-body" style={{ paddingTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>CERINȚĂ CAIET DE SARCINI</div>
              <div style={{ fontSize: 13, color: "var(--ink-0)", lineHeight: 1.55 }}>
                {window.MOCK_REQUIREMENTS.find(x => x.id === r.reqId)?.text || r.req}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                {r.cs.section} · p. {r.cs.page}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>RAȚIONAMENT MOTOR</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-1)", lineHeight: 1.55 }}>{r.reasoning}</div>
            </div>
          </div>

          <div className="label" style={{ marginBottom: 4 }}>
            <Icon name="quote" size={11} style={{ verticalAlign: "middle", marginRight: 6, color: "var(--amber)" }} />
            CITAT DIN PROPUNEREA TEHNICĂ
          </div>
          {r.quotes.map((q, i) => (
            <Quote key={i} text={q.text} source={q.source} section={q.section} page={q.page} verified={q.verified} />
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>ASPECTE ACOPERITE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {r.covered.length ? r.covered.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-0)" }}>
                    <Icon name="check" size={11} style={{ color: "var(--conform)" }} />
                    {c}
                  </div>
                )) : <span className="dim mono" style={{ fontSize: 11 }}>—</span>}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>ASPECTE LIPSĂ</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {r.missing.length ? r.missing.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-0)" }}>
                    <Icon name="x" size={11} style={{ color: "oklch(0.78 0.12 20)" }} />
                    {c}
                  </div>
                )) : <span className="dim mono" style={{ fontSize: 11 }}>—</span>}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-0)" }}>
            <Button size="sm" icon="edit">Schimbă verdict</Button>
            <Button size="sm" icon="check">Marchează verificat</Button>
            <Button size="sm" variant="ghost" icon="link">Link permanent</Button>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }} className="mono">
              EVAL ID · {r.id}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const Evaluation = ({ project, go }) => {
  const [phase, setPhase] = React.useState("results"); // prelaunch | running | results
  const [tab, setTab] = React.useState("problems");

  const results = window.MOCK_EVAL_RESULTS;
  const totals = window.VERDICT_TOTALS;
  const totalAll = totals.conform + totals.neconform + totals.partial + totals.insuf;

  const filtered = results.filter(r => {
    if (tab === "problems") return r.verdict === "NECONFORM" || r.verdict === "PARTIAL";
    if (tab === "review")   return r.verdict === "INSUFFICIENT_DATA" || (r.flags && r.flags.length);
    if (tab === "conform")  return r.verdict === "CONFORM";
    return true;
  });

  return (
    <div className="page fadein">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ETAPA 3 · EVALUARE AI · <span style={{ color: "var(--amber-ink)" }}>{phase.toUpperCase()}</span>
          </div>
          <div className="h1">
            {phase === "prelaunch" && "Pregătește evaluarea"}
            {phase === "running" && "Evaluare în desfășurare"}
            {phase === "results" && "Rezultate evaluare"}
          </div>
        </div>
        <div className="tabs" style={{ gap: 2 }}>
          {[
            { k: "prelaunch", l: "Pre-lansare" },
            { k: "running",   l: "În rulare" },
            { k: "results",   l: "Rezultate" },
          ].map(p => (
            <button key={p.k} className={`tab ${phase === p.k ? "active" : ""}`} onClick={() => setPhase(p.k)}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {phase === "prelaunch" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
          <Panel title="Ce se va întâmpla" eyebrow="PROCES">
            <div style={{ padding: "4px 22px 22px", fontSize: 13, color: "var(--ink-1)", lineHeight: 1.65 }}>
              <p>
                Motorul va rula prin <b className="mono" style={{ color: "var(--ink-0)" }}>175</b> cerințe atomice, una câte una.
                Pentru fiecare, se efectuează căutare hibridă (vector + keyword) în Propunerea Tehnică, apoi un LLM emite un verdict
                cu citate exacte ca dovadă.
              </p>
              <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                <li>Pentru fiecare cerință se extrag top-<span className="mono">8</span> pasaje candidate din PT.</li>
                <li>LLM-ul emite verdict ({`CONFORM | NECONFORM | PARTIAL | INSUFFICIENT_DATA`}) cu raționament pas-cu-pas.</li>
                <li>Fiecare citat revendicat este re-verificat textual împotriva documentului sursă (anti-halucinație).</li>
                <li>Rezultatele sunt persistate; poți reveni oricând.</li>
              </ol>
            </div>
          </Panel>
          <Panel title="Estimare" eyebrow="PRE-RULARE" actions={<Button size="sm" icon="bolt">Recalculează</Button>}>
            <div style={{ padding: "8px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <EstRow label="Cerințe de evaluat"  value="175"       unit="" />
              <EstRow label="Durată estimată"     value="~ 8"       unit="min" />
              <EstRow label="Token-uri LLM"       value="2.4"       unit="M" />
              <EstRow label="Cost estimat"        value="€ 4.12"    unit="" accent="var(--amber)" />
              <Button variant="primary" icon="sparkle" style={{ marginTop: 6 }} onClick={() => setPhase("running")}>
                Confirmă și lansează
              </Button>
              <div className="mono dim" style={{ fontSize: 10.5, letterSpacing: "0.04em" }}>
                ESTIMAREA FINALĂ POATE VARIA ± 15% · Model <span style={{ color: "var(--ink-1)" }}>claude-haiku-4.5</span>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {phase === "running" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
            <KPI eyebrow="PROGRES" value="108" sub="din 175 cerințe" accent="var(--amber)" />
            <KPI eyebrow="CONFORM" value="87" sub="procesate" accent="var(--conform)" />
            <KPI eyebrow="NECONFORM" value="7" sub="marcate" accent="oklch(0.78 0.12 20)" />
            <KPI eyebrow="PARȚIAL" value="9" sub="parțial acoperite" accent="var(--partial)" />
            <KPI eyebrow="INSUFICIENT" value="5" sub="date lipsă" accent="var(--ink-2)" />
          </div>
          <Panel>
            <div style={{ padding: "18px 22px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <span className="status-dot live" style={{ width: 10, height: 10 }} />
                <div className="h3">Procesează <span className="mono" style={{ color: "var(--amber-ink)" }}>REQ-0412</span> · Personal executant</div>
                <span className="mono dim" style={{ fontSize: 12, marginLeft: "auto" }}>~4:22 rămase</span>
              </div>
              <Meter value={108/175} tall />
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
                62% · 187 ms latență retrieval medie · 2.3 s verdict LLM medie
              </div>
            </div>
            <div className="divider" />
            <div style={{ padding: "14px 22px", display: "flex", gap: 10, flexDirection: "column" }}>
              {[
                ["16:44:02", "EV-0411", "INSUFFICIENT_DATA", "RTE atestare dom. IX"],
                ["16:43:58", "EV-0410", "CONFORM",           "Șef șantier experiență"],
                ["16:43:51", "EV-0302", "CONFORM",           "Plan control calitate"],
                ["16:43:44", "EV-0301", "CONFORM",           "ISO 9001:2015"],
                ["16:43:37", "EV-0208", "PARTIAL",           "Cofraje — tolerantă"],
                ["16:43:30", "EV-0145", "NECONFORM",         "Oțel BST500S vs OB37"],
              ].map((l, i) => (
                <div key={i} className="mono" style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11.5 }}>
                  <span style={{ color: "var(--ink-3)" }}>{l[0]}</span>
                  <span style={{ color: "var(--amber-ink)" }}>{l[1]}</span>
                  <VerdictBadge verdict={l[2]} />
                  <span style={{ color: "var(--ink-1)" }}>{l[3]}</span>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div style={{ padding: 14, display: "flex", gap: 10 }}>
              <Button variant="danger" icon="x">Anulează evaluarea</Button>
              <Button variant="ghost" onClick={() => setPhase("results")} style={{ marginLeft: "auto" }}>
                Sari la rezultate (demo)
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {phase === "results" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
            <KPI eyebrow="CONFORM" value={totals.conform} sub={`${Math.round(totals.conform/totalAll*100)}% din total`} accent="var(--conform)" />
            <KPI eyebrow="NECONFORM" value={totals.neconform} sub="de remediat înainte de depunere" accent="oklch(0.78 0.12 20)" />
            <KPI eyebrow="PARȚIAL" value={totals.partial} sub="acoperire incompletă" accent="var(--partial)" />
            <KPI eyebrow="INSUFICIENT" value={totals.insuf} sub="date lipsă / ambigue" accent="var(--ink-2)" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { key: "problems", label: "Probleme",       count: totals.neconform + totals.partial, icon: "warn" },
                { key: "review",   label: "De verificat",   count: totals.insuf + 4, icon: "flag" },
                { key: "conform",  label: "Conforme",       count: totals.conform, icon: "check" },
              ]}
            />
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <Button size="sm" icon="filter">Filtre</Button>
              <Button size="sm" variant="primary" icon="gauge" onClick={() => go(`/projects/${project.id}/report`)}>
                Generează raport final
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(r => <EvalCard key={r.id} r={r} />)}
          </div>
        </>
      )}
    </div>
  );
};

const EstRow = ({ label, value, unit, accent }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
    <span className="label" style={{ flex: 1 }}>{label}</span>
    <span className="mono num" style={{ fontSize: 16, color: accent || "var(--ink-0)", fontWeight: 500 }}>{value}</span>
    {unit && <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{unit}</span>}
  </div>
);

Object.assign(window, { Evaluation });
