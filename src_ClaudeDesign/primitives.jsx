/* Primitives used across routes. */

const Badge = ({ children, kind = "", icon = null, className = "" }) => (
  <span className={`badge ${kind} ${className}`}>
    {icon && <span className="dot" />}
    {children}
  </span>
);

const VerdictBadge = ({ verdict }) => {
  const map = {
    CONFORM:           { cls: "verdict-conform",   text: "Conform" },
    NECONFORM:         { cls: "verdict-neconform", text: "Neconform" },
    PARTIAL:           { cls: "verdict-partial",   text: "Parțial" },
    INSUFFICIENT_DATA: { cls: "verdict-insuf",     text: "Insuficient" },
  };
  const it = map[verdict] || map.INSUFFICIENT_DATA;
  return (
    <span className={`badge ${it.cls}`}>
      <span className="dot" />
      {it.text}
    </span>
  );
};

const StatusChip = ({ status }) => {
  const meta = window.STATUS_LABEL[status] || { label: status, dot: "" };
  return (
    <span className="status-chip">
      <span className={`status-dot ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

const Button = ({ children, variant = "", size = "", icon, kbd, className = "", ...props }) => (
  <button className={`btn ${variant ? "btn-" + variant : ""} ${size} ${className}`} {...props}>
    {icon && <Icon name={icon} size={14} />}
    {children}
    {kbd && <span className="kbd">{kbd}</span>}
  </button>
);

const IconButton = ({ name, title, onClick, size = 14 }) => (
  <button className="icon-btn" title={title} aria-label={title} onClick={onClick}>
    <Icon name={name} size={size} />
  </button>
);

const Panel = ({ children, className = "", pad = false, title, eyebrow, actions }) => (
  <section className={`panel ${pad ? "panel-pad" : ""} ${className}`}>
    {(title || eyebrow || actions) && (
      <header className="panel-header">
        <div>
          {eyebrow && <div className="eyebrow" style={{ marginBottom: 2 }}>{eyebrow}</div>}
          {title && <div className="h3">{title}</div>}
        </div>
        {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

const KPI = ({ eyebrow, value, unit, sub, accent, children }) => (
  <div className="kpi">
    <div className="eyebrow">{eyebrow}</div>
    <div className="big num" style={accent ? { color: accent } : undefined}>
      {value}{unit && <span className="unit">{unit}</span>}
    </div>
    {sub && <div className="sub">{sub}</div>}
    {children}
  </div>
);

const Meter = ({ value, tall = false, color }) => (
  <div className={`meter ${tall ? "tall" : ""}`}>
    <span style={{ width: `${Math.round(value * 100)}%`, background: color }} />
  </div>
);

const StackBar = ({ parts }) => (
  <div className="stackbar">
    {parts.map((p, i) => (
      <span key={i} style={{ width: `${p.pct * 100}%`, background: p.color }} />
    ))}
  </div>
);

const Quote = ({ text, source, section, page, verified = true, onShowSource }) => (
  <div className="quote">
    <span className="quote-mark">“</span>
    <div className="quote-body">{text}</div>
    <div className="quote-cite">
      <span className="mono">{source}</span>
      <span style={{ color: "var(--ink-4)" }}>·</span>
      <span>{section}</span>
      <span style={{ color: "var(--ink-4)" }}>·</span>
      <span>p. {page}</span>
      {verified && (
        <span className="badge verdict-conform" style={{ height: 18, padding: "0 6px", fontSize: 9.5 }}>
          <Icon name="check" size={10} /> CITAT VERIFICAT
        </span>
      )}
      <a onClick={(e) => { e.preventDefault(); onShowSource && onShowSource(); }} href="#" style={{ marginLeft: "auto" }}>
        Arată în document →
      </a>
    </div>
  </div>
);

const Tabs = ({ value, onChange, items }) => (
  <div className="tabs" role="tablist">
    {items.map(it => (
      <button
        key={it.key}
        role="tab"
        aria-selected={value === it.key}
        className={`tab ${value === it.key ? "active" : ""}`}
        onClick={() => onChange(it.key)}
      >
        {it.icon && <Icon name={it.icon} size={12} />}
        {it.label}
        {typeof it.count === "number" && <span className="count num">{it.count}</span>}
      </button>
    ))}
  </div>
);

const EmptyState = ({ icon = "folder", title, description, action }) => (
  <div style={{
    padding: "64px 20px", textAlign: "center",
    border: "1px dashed var(--line-1)", borderRadius: 10,
    background: "rgba(255,255,255,0.015)",
  }}>
    <div style={{
      width: 48, height: 48, borderRadius: 10, margin: "0 auto 14px",
      display: "grid", placeItems: "center",
      background: "var(--amber-bg)", border: "1px solid var(--amber-line)",
      color: "var(--amber)",
    }}>
      <Icon name={icon} size={20} />
    </div>
    <div className="h3" style={{ marginBottom: 6 }}>{title}</div>
    <div className="muted" style={{ maxWidth: 360, margin: "0 auto 18px", fontSize: 13 }}>{description}</div>
    {action}
  </div>
);

// Circular progress ring
const Ring = ({ value, size = 120, stroke = 8, color = "var(--amber)", label, sub }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset 500ms var(--ease)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center",
        flexDirection: "column", textAlign: "center",
      }}>
        <div>
          <div className="num" style={{ fontSize: size * 0.28, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1 }}>{label}</div>
          {sub && <div className="eyebrow" style={{ marginTop: 4 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  Badge, VerdictBadge, StatusChip, Button, IconButton,
  Panel, KPI, Meter, StackBar, Quote, Tabs, EmptyState, Ring,
});
