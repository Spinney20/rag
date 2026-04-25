import { useEffect, useRef } from "react";

/**
 * Cool grayscale particle network.
 * Drifting points connected by hairline gray lines. Cursor exerts gentle
 * gravity + orbital swirl; the lines move with the cursor because their
 * endpoints are pulled. Click emits a soft expanding ripple.
 *
 * Palette: cool light gray dots, light cool-gray lines — recedes into the
 * dark warm-graphite background instead of competing with the amber accent.
 */

const CONFIG = {
  count: 110,
  baseSpeed: 0.12,
  maxDist: 150,
  mouseRadius: 220,
  // Gravity bumped slightly (0.00045 → 0.0006) so the graph visibly "swims"
  // toward the cursor — endpoints move => lines visibly track the cursor.
  gravity: 0.0006,
  swirl: 0.00038,
  damping: 0.985,
  rippleLife: 900,
  rippleRadius: 260,
  rippleForce: 2.0,
};

// Pure neutral gray — no blue/amber cast. Light points and faint hairlines
// that recede into the warm-graphite background instead of competing with it.
const DOT_CORE = "rgba(220, 220, 220,";  // neutral off-white core
const DOT_GLOW = "rgba(170, 170, 170,";  // soft neutral halo around each dot
const LINE     = "rgba(150, 150, 150,";  // light gray hairlines
const RIPPLE   = "rgba(200, 200, 200,";  // click-shockwave ring

type Particle = { x: number; y: number; vx: number; vy: number; r: number };
type Ripple = { x: number; y: number; born: number };

export default function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let DPR = 1;

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();

    const pts: Particle[] = [];
    for (let i = 0; i < CONFIG.count; i++) {
      pts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * CONFIG.baseSpeed * 2,
        vy: (Math.random() - 0.5) * CONFIG.baseSpeed * 2,
        r: 0.8 + Math.random() * 1.4,
      });
    }

    const mouse = { x: -9999, y: -9999, active: false };
    const ripples: Ripple[] = [];

    const onResize = () => resize();
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
    };
    const onClick = (e: MouseEvent) => {
      ripples.push({ x: e.clientX, y: e.clientY, born: performance.now() });
      if (ripples.length > 6) ripples.shift();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("click", onClick);

    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      ctx.clearRect(0, 0, W, H);

      // Update
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];

        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const d2 = dx * dx + dy * dy;
          const r = CONFIG.mouseRadius;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / r;
            // Pull toward cursor
            p.vx += (dx / d) * f * CONFIG.gravity * dt;
            p.vy += (dy / d) * f * CONFIG.gravity * dt;
            // Tangential swirl (counter-clockwise) so points orbit, don't collapse
            p.vx += (-dy / d) * f * CONFIG.swirl * dt;
            p.vy += (dx / d) * f * CONFIG.swirl * dt;
          }
        }

        for (let k = 0; k < ripples.length; k++) {
          const rp = ripples[k];
          const age = now - rp.born;
          if (age > CONFIG.rippleLife) continue;
          const t = age / CONFIG.rippleLife;
          const radius = CONFIG.rippleRadius * t;
          const dx = p.x - rp.x;
          const dy = p.y - rp.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ringHalf = 40;
          if (Math.abs(dist - radius) < ringHalf) {
            const strength = (1 - t) * (1 - Math.abs(dist - radius) / ringHalf) * CONFIG.rippleForce;
            p.vx += (dx / dist) * strength * 0.03;
            p.vy += (dy / dist) * strength * 0.03;
          }
        }

        if (!reducedMotion) {
          p.x += p.vx;
          p.y += p.vy;
        }
        p.vx *= CONFIG.damping;
        p.vy *= CONFIG.damping;

        // Tiny drift nudge so the graph stays alive when idle
        if (Math.hypot(p.vx, p.vy) < 0.03) {
          p.vx += (Math.random() - 0.5) * 0.02;
          p.vy += (Math.random() - 0.5) * 0.02;
        }

        // Wrap
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
      }

      // Lines
      ctx.lineWidth = 0.7;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < CONFIG.maxDist * CONFIG.maxDist) {
            const d = Math.sqrt(d2);
            const alpha = (1 - d / CONFIG.maxDist) * 0.26;
            ctx.strokeStyle = LINE + alpha.toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Points (glow + core)
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, DOT_GLOW + "0.45)");
        g.addColorStop(1, DOT_GLOW + "0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = DOT_CORE + "0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ripple rings
      for (let k = 0; k < ripples.length; k++) {
        const rp = ripples[k];
        const age = now - rp.born;
        if (age > CONFIG.rippleLife) {
          ripples.splice(k, 1);
          k--;
          continue;
        }
        const t = age / CONFIG.rippleLife;
        const radius = CONFIG.rippleRadius * t;
        ctx.strokeStyle = RIPPLE + ((1 - t) * 0.20).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("click", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} id="particle-bg" aria-hidden="true" />;
}
