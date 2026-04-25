/* Tweaks panel — exposed via the Tweaks toolbar */

const Tweaks = () => {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState({
    accentHue:  window.__TWEAKS__.accentHue,
    density:    window.__TWEAKS__.density,
    particleIntensity: window.__TWEAKS__.particleIntensity,
    verdictLanguage:   window.__TWEAKS__.verdictLanguage,
  });

  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "__activate_edit_mode") setOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setOpen(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Apply tweaks to DOM
  React.useEffect(() => {
    document.documentElement.style.setProperty("--amber", `oklch(0.80 0.13 ${state.accentHue})`);
    document.documentElement.style.setProperty("--amber-dim", `oklch(0.70 0.11 ${state.accentHue})`);
    document.documentElement.style.setProperty("--amber-ink", `oklch(0.92 0.08 ${state.accentHue + 5})`);
    document.body.setAttribute("data-density", state.density);
    // Particle opacity
    const canvas = document.getElementById("particle-bg");
    if (canvas) {
      canvas.style.opacity = state.particleIntensity === "off" ? "0" :
                             state.particleIntensity === "subtle" ? "0.65" :
                             state.particleIntensity === "prominent" ? "1" : "0.85";
    }
  }, [state]);

  const update = (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: patch }, "*");
  };

  if (!open) return null;

  const hues = [
    { h: 75,  name: "Amber" },
    { h: 30,  name: "Copper" },
    { h: 145, name: "Sage" },
    { h: 230, name: "Steel" },
    { h: 320, name: "Rose" },
  ];

  return (
    <div className="tweaks-panel">
      <div className="tweaks-header">
        <Icon name="settings" size={12} />
        <span>Tweaks</span>
        <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", color: "var(--ink-3)" }}>
          <Icon name="x" size={12} />
        </button>
      </div>
      <div className="tweaks-body">
        <div className="tweak-row">
          <span className="label">ACCENT</span>
          <div className="swatch-row">
            {hues.map(h => (
              <button
                key={h.h}
                title={h.name}
                className={`swatch ${state.accentHue === h.h ? "active" : ""}`}
                style={{ background: `oklch(0.80 0.13 ${h.h})` }}
                onClick={() => update({ accentHue: h.h })}
              />
            ))}
          </div>
        </div>
        <div className="tweak-row">
          <span className="label">PARTICLE INTENSITY</span>
          <div className="seg">
            {["off", "subtle", "normal", "prominent"].map(v => (
              <button key={v} className={state.particleIntensity === v ? "active" : ""} onClick={() => update({ particleIntensity: v })}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="tweak-row">
          <span className="label">DENSITY</span>
          <div className="seg">
            {["comfortable", "compact"].map(v => (
              <button key={v} className={state.density === v ? "active" : ""} onClick={() => update({ density: v })}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Tweaks });
