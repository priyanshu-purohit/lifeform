// Decorative Canvas animation for the Welcome page: a softly breathing "organism" of
// contour rings. It is NOT driven by measurements (none exist before setup) and the page
// says so. Plain TypeScript, no React: the component only starts and stops it.

export interface AmbientEngine {
  stop(): void;
}

interface Mote {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
}

const RING_COUNT = 9;
const POINTS_PER_RING = 160;
const MOTE_COUNT = 90;
// Fixed, generic resting rhythms purely for atmosphere (not anyone's physiology).
const BREATH_PERIOD_S = 5.5;
const RIPPLE_PERIOD_S = 1.1;
const MAX_DPR = 2;

export function startAmbientEngine(canvas: HTMLCanvasElement): AmbientEngine {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { stop() {} };
  const g: CanvasRenderingContext2D = ctx;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let frame = 0;
  let stopped = false;
  let running = false;
  let visible = true;
  const start = performance.now();

  // Pointer in viewport (client) pixels, eased toward its target so the form leans gently.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: 0, targetActive: 0 };

  const motes: Mote[] = Array.from({ length: MOTE_COUNT }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 0.25 + Math.random() * 0.9,
    speed: (0.004 + Math.random() * 0.012) * (Math.random() < 0.5 ? -1 : 1),
    size: 0.4 + Math.random() * 1.4,
    alpha: 0.15 + Math.random() * 0.45,
  }));

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reducedMotion.matches) draw(performance.now());
  }

  function onPointerMove(e: PointerEvent) {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    pointer.targetActive = 1;
  }
  function onPointerLeave() {
    pointer.targetActive = 0;
  }

  function draw(now: number) {
    const t = (now - start) / 1000;
    // The canvas scrolls with the page; convert the pointer into canvas space.
    const rect = canvas.getBoundingClientRect();
    const cx = width / 2;
    const cy = height * 0.46;
    const base = Math.min(width, height) * 0.34;

    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    pointer.active += (pointer.targetActive - pointer.active) * 0.04;

    // Smooth breathing curve (0..1) and a soft pulse ripple travelling outward.
    const breath = 0.5 - 0.5 * Math.cos((t / BREATH_PERIOD_S) * Math.PI * 2);
    const ripplePhase = (t / RIPPLE_PERIOD_S) % 1;

    g.clearRect(0, 0, width, height);
    g.globalCompositeOperation = "lighter";

    // Inner glow.
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, base * 1.2);
    glow.addColorStop(0, `rgba(94, 234, 212, ${0.10 + breath * 0.05})`);
    glow.addColorStop(0.5, "rgba(129, 140, 248, 0.04)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, width, height);

    for (let i = 0; i < RING_COUNT; i++) {
      const k = i / (RING_COUNT - 1); // 0 inner .. 1 outer
      const ringR = base * (0.28 + k * 0.72) * (1 + 0.045 * breath * (1 - k * 0.4));
      // Ripple brightness peaks as the wave front passes this ring.
      const d = Math.abs(ripplePhase - k);
      const ripple = Math.max(0, 1 - d * 6);
      const hue = 168 + k * 80; // teal -> indigo
      const alpha = 0.16 + (1 - k) * 0.18 + ripple * 0.22;

      g.beginPath();
      for (let p = 0; p <= POINTS_PER_RING; p++) {
        const a = (p / POINTS_PER_RING) * Math.PI * 2;
        const wobble =
          Math.sin(a * 3 + t * 0.35 + i * 0.7) * 0.035 +
          Math.sin(a * 5 - t * 0.22 + i * 1.3) * 0.022 +
          Math.sin(a * 2 + t * 0.15 - i) * 0.03;
        let x = cx + Math.cos(a) * ringR * (1 + wobble);
        let y = cy + Math.sin(a) * ringR * (1 + wobble);

        // Lean toward the pointer with a smooth falloff.
        if (pointer.active > 0.01) {
          const dx = pointer.x - rect.left - x;
          const dy = pointer.y - rect.top - y;
          const dist = Math.hypot(dx, dy);
          const pull = Math.exp(-(dist * dist) / (2 * (base * 0.45) ** 2)) * 0.12 * pointer.active;
          x += dx * pull;
          y += dy * pull;
        }

        if (p === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = `hsla(${hue}, 80%, 72%, ${alpha})`;
      g.lineWidth = 1 + (1 - k) * 0.6 + ripple * 0.8;
      g.stroke();
    }

    for (const m of motes) {
      if (!reducedMotion.matches) m.angle += m.speed * 0.016;
      const r = base * m.radius * (1 + 0.03 * breath);
      const x = cx + Math.cos(m.angle) * r;
      const y = cy + Math.sin(m.angle) * r * 0.92;
      g.fillStyle = `rgba(204, 251, 241, ${m.alpha * (0.6 + 0.4 * breath)})`;
      g.beginPath();
      g.arc(x, y, m.size, 0, Math.PI * 2);
      g.fill();
    }

    g.globalCompositeOperation = "source-over";
  }

  function loop(now: number) {
    if (!running) return;
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  // Animate only while on screen and motion is allowed; otherwise hold a still frame.
  function updateRunning() {
    const shouldRun = !stopped && visible && !reducedMotion.matches;
    if (shouldRun && !running) {
      running = true;
      frame = requestAnimationFrame(loop);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frame);
    }
    if (!stopped && reducedMotion.matches) draw(performance.now());
  }

  function onMotionPreferenceChange() {
    updateRunning();
  }

  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateRunning();
  });
  visibility.observe(canvas);

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("pointermove", onPointerMove);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  reducedMotion.addEventListener("change", onMotionPreferenceChange);

  pointer.x = pointer.tx = window.innerWidth / 2;
  pointer.y = pointer.ty = window.innerHeight / 2;
  resize();
  updateRunning();

  return {
    stop() {
      stopped = true;
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      reducedMotion.removeEventListener("change", onMotionPreferenceChange);
    },
  };
}
