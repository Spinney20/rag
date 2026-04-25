/* Particle network background.
   ~100 drifting points, connected by thin lines when within proximity threshold.
   Cursor exerts gentle gravity with orbital swirl; clicks emit a ripple.
   60fps, respects prefers-reduced-motion. */

(function () {
  const canvas = document.getElementById('particle-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tweakable
  const CONFIG = {
    count: 110,
    baseSpeed: 0.12,
    maxDist: 140,
    mouseRadius: 180,
    gravity: 0.00045,
    swirl: 0.00035,
    damping: 0.985,
    rippleLife: 900, // ms
    rippleRadius: 260,
    rippleForce: 2.0,
  };

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth = window.innerWidth;
    H = canvas.clientHeight = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Particles
  const pts = [];
  function init() {
    pts.length = 0;
    for (let i = 0; i < CONFIG.count; i++) {
      pts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * CONFIG.baseSpeed * 2,
        vy: (Math.random() - 0.5) * CONFIG.baseSpeed * 2,
        r: 0.8 + Math.random() * 1.4,
        hue: 70 + Math.random() * 20, // amber-ish
      });
    }
  }
  init();

  const mouse = { x: -9999, y: -9999, active: false };
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  });
  window.addEventListener('mouseleave', () => { mouse.active = false; });

  const ripples = [];
  window.addEventListener('click', e => {
    // Ignore clicks on interactive elements so ripples don't stack weirdly on button mashing
    ripples.push({ x: e.clientX, y: e.clientY, born: performance.now() });
    if (ripples.length > 6) ripples.shift();
  });

  const themeAccent = 'rgba(230, 180, 100,'; // amber-ish base
  const lineAccent  = 'rgba(210, 165, 95,';

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(32, now - last); last = now;
    ctx.clearRect(0, 0, W, H);

    // Update
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];

      // Mouse gravity + orbital swirl
      if (mouse.active) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const d2 = dx*dx + dy*dy;
        const r = CONFIG.mouseRadius;
        if (d2 < r*r) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / r);
          // pull toward mouse
          p.vx += (dx / d) * f * CONFIG.gravity * dt;
          p.vy += (dy / d) * f * CONFIG.gravity * dt;
          // perpendicular swirl (counter-clockwise)
          p.vx += (-dy / d) * f * CONFIG.swirl * dt;
          p.vy += ( dx / d) * f * CONFIG.swirl * dt;
        }
      }

      // Ripples
      for (let k = 0; k < ripples.length; k++) {
        const rp = ripples[k];
        const age = now - rp.born;
        if (age > CONFIG.rippleLife) continue;
        const t = age / CONFIG.rippleLife;
        const radius = CONFIG.rippleRadius * t;
        const dx = p.x - rp.x;
        const dy = p.y - rp.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const ringHalf = 40;
        if (Math.abs(dist - radius) < ringHalf) {
          const strength = (1 - t) * (1 - Math.abs(dist - radius)/ringHalf) * CONFIG.rippleForce;
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

      // Drift nudge to keep things lively
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
    ctx.lineWidth = 0.6;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < CONFIG.maxDist * CONFIG.maxDist) {
          const d = Math.sqrt(d2);
          const alpha = (1 - d / CONFIG.maxDist) * 0.28;
          ctx.strokeStyle = lineAccent + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Points
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      // Glow
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, themeAccent + '0.55)');
      g.addColorStop(1, themeAccent + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fill();
      // Core
      ctx.fillStyle = themeAccent + '0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render ripple rings softly
    for (let k = 0; k < ripples.length; k++) {
      const rp = ripples[k];
      const age = now - rp.born;
      if (age > CONFIG.rippleLife) { ripples.splice(k, 1); k--; continue; }
      const t = age / CONFIG.rippleLife;
      const radius = CONFIG.rippleRadius * t;
      ctx.strokeStyle = `rgba(230,180,100,${(1 - t) * 0.22})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
