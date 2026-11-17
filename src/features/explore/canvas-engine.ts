// The Explore world: a bioluminescent organism in a drifting field of particles, drawn with
// the 2D Canvas API. Plain TypeScript with its own requestAnimationFrame loop; React only
// starts it, stops it and hands it targets (see visual-mapping.ts).
//
//   pulse     -> heartbeat ripples from the core (at the pulse RATE), core contractions,
//                colour warmth, particle speed and density
//   breathing -> the whole world expands and contracts over one breathing cycle, flow
//                turbulence and trail length
//   HRV       -> irregularity of the core's shape and of the ripple rhythm
//   confidence-> saturation and sharpness ("clarity")
//
// Every parameter eases toward its target, and rhythms advance as phases, so a new
// measurement never causes a jump or a skipped beat.

import { RESTING_TARGETS, type VisualTargets } from "./visual-mapping";

export type PaletteId = "tide" | "ember" | "aurora";

export interface ExploreOptions {
  palette: PaletteId;
  /** Particle density multiplier, 0.4..1.6. */
  density: number;
}

export interface ExploreEngine {
  setTargets(targets: VisualTargets): void;
  setOptions(options: Partial<ExploreOptions>): void;
  stop(): void;
}

/** Hue range per palette: [low energy, high energy]. */
export const PALETTES: Record<PaletteId, { label: string; hues: readonly [number, number] }> = {
  tide: { label: "Tide", hues: [178, 262] },
  ember: { label: "Ember", hues: [32, -18] },
  aurora: { label: "Aurora", hues: [140, 300] },
};

const MAX_DPR = 1.75;
const MAX_PARTICLES = 2600;
const MAX_RIPPLES = 14;
const HUE_BUCKETS = 6;
/** Seconds each eased parameter takes to cover ~63% of the distance to its target. */
const EASE_S = { fast: 0.8, medium: 1.8, slow: 3.5 } as const;

interface Ripple {
  x: number;
  y: number;
  r: number;
  speed: number;
  strength: number;
  /** User-made ripples are tinted differently from heartbeat ripples. */
  user: boolean;
}

type Params = VisualTargets & { hue: number };

export function startExploreEngine(
  canvas: HTMLCanvasElement,
  initialOptions: ExploreOptions,
): ExploreEngine {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return { setTargets() {}, setOptions() {}, stop() {} };
  const g: CanvasRenderingContext2D = ctx;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const options: ExploreOptions = { ...initialOptions };

  let width = 0;
  let height = 0;
  let frame = 0;
  let stopped = false;
  let last = performance.now();
  let time = 0;

  let targets: VisualTargets = RESTING_TARGETS;
  const p: Params = { ...RESTING_TARGETS, hue: hueFor(RESTING_TARGETS.energy) };

  // Rhythm state, advanced by phase so tempo changes never skip or double a beat.
  let breathPhase = 0;
  let breath = 0; // 0 (exhaled) .. 1 (inhaled), already scaled by breathDrive
  let breathVelocity = 0;
  let nextBeatIn = 1;
  let sinceBeat = 10;

  const ripples: Ripple[] = [];

  // Particles as structure-of-arrays for cache-friendly updates.
  const px = new Float32Array(MAX_PARTICLES);
  const py = new Float32Array(MAX_PARTICLES);
  const pvx = new Float32Array(MAX_PARTICLES);
  const pvy = new Float32Array(MAX_PARTICLES);
  const life = new Float32Array(MAX_PARTICLES); // seconds remaining
  const span = new Float32Array(MAX_PARTICLES); // total lifetime
  const size = new Float32Array(MAX_PARTICLES);
  const glow = new Float32Array(MAX_PARTICLES); // brief brightening from ripples
  const bucket = new Uint8Array(MAX_PARTICLES);
  let count = 0;

  const pointer = { x: 0, y: 0, inside: false, down: false, presence: 0 };

  function hueFor(energy: number): number {
    const [lo, hi] = PALETTES[options.palette].hues;
    return lo + (hi - lo) * energy;
  }

  function targetCount(): number {
    const byArea = (width * height) / 950;
    const energyScale = 0.55 + 0.6 * p.energy;
    return Math.min(MAX_PARTICLES, Math.round(byArea * energyScale * options.density));
  }

  function spawn(i: number, anywhere: boolean) {
    if (anywhere) {
      px[i] = Math.random() * width;
      py[i] = Math.random() * height;
    } else {
      // Respawn around the edges of the core so the organism feels like the source.
      const a = Math.random() * Math.PI * 2;
      const r = coreRadius() * (1.1 + Math.random() * 3.2);
      px[i] = width / 2 + Math.cos(a) * r;
      py[i] = height / 2 + Math.sin(a) * r;
    }
    pvx[i] = 0;
    pvy[i] = 0;
    span[i] = life[i] = 6 + Math.random() * 12;
    size[i] = 0.6 + Math.random() * Math.random() * 2.2;
    glow[i] = 0;
    bucket[i] = Math.floor(Math.random() * HUE_BUCKETS);
  }

  function coreRadius(): number {
    return Math.min(width, height) * 0.13;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Resizing clears the canvas; repaint the base so trails don't start from black.
    g.fillStyle = background(1);
    g.fillRect(0, 0, width, height);
    // Keep particles inside the new bounds.
    for (let i = 0; i < count; i++) {
      if (px[i] > width || py[i] > height) spawn(i, true);
    }
  }

  function background(alpha: number): string {
    const sat = 30 + 25 * p.clarity;
    const light = 3.2 + 1.6 * breath + 0.8 * p.energy;
    return `hsla(${p.hue.toFixed(1)}, ${sat.toFixed(0)}%, ${light.toFixed(2)}%, ${alpha})`;
  }

  // ---- update -------------------------------------------------------------------------

  function ease(dt: number) {
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    p.pulseDrive += (targets.pulseDrive - p.pulseDrive) * k(EASE_S.medium);
    p.breathDrive += (targets.breathDrive - p.breathDrive) * k(EASE_S.medium);
    p.energy += (targets.energy - p.energy) * k(EASE_S.slow);
    p.pace += (targets.pace - p.pace) * k(EASE_S.slow);
    p.variation += (targets.variation - p.variation) * k(EASE_S.slow);
    p.clarity += (targets.clarity - p.clarity) * k(EASE_S.medium);
    // Rhythms change tempo gradually, like a musician following a conductor.
    p.beatHz += (targets.beatHz - p.beatHz) * k(EASE_S.fast);
    p.breathPeriodS += (targets.breathPeriodS - p.breathPeriodS) * k(EASE_S.medium);
    p.hue += (hueFor(p.energy) - p.hue) * k(EASE_S.slow);
  }

  function advanceRhythms(dt: number) {
    // Breathing: a smooth raised-cosine cycle; its derivative pushes particles in and out.
    breathPhase = (breathPhase + dt / p.breathPeriodS) % 1;
    const nextBreath = p.breathDrive * (0.5 - 0.5 * Math.cos(breathPhase * Math.PI * 2));
    breathVelocity = dt > 0 ? (nextBreath - breath) / dt : 0;
    breath = nextBreath;

    // Heartbeat: one ripple per beat interval. HRV adds stylised interval variation.
    sinceBeat += dt;
    nextBeatIn -= dt;
    if (nextBeatIn <= 0) {
      const jitter = (Math.random() - 0.5) * 0.16 * p.variation;
      nextBeatIn += (1 / p.beatHz) * (1 + jitter);
      if (p.pulseDrive > 0.04) {
        sinceBeat = 0;
        if (!reducedMotion.matches) {
          addRipple(width / 2, height / 2, p.pulseDrive * (0.7 + 0.5 * p.energy), false);
        }
      }
    }
  }

  function addRipple(x: number, y: number, strength: number, user: boolean) {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({
      x,
      y,
      r: user ? 4 : coreRadius() * 0.9,
      speed: user ? 240 : 190 + 210 * p.energy,
      strength,
      user,
    });
  }

  function updateRipples(dt: number) {
    const maxR = Math.hypot(width, height) * 0.6;
    for (let j = ripples.length - 1; j >= 0; j--) {
      const rp = ripples[j];
      rp.r += rp.speed * dt;
      rp.strength *= Math.exp(-dt * 0.9);
      if (rp.r > maxR || rp.strength < 0.02) ripples.splice(j, 1);
    }
  }

  function updateParticles(dt: number) {
    const cx = width / 2;
    const cy = height / 2;
    const motion = reducedMotion.matches ? 0.25 : 1;
    const flowSpeed = (10 + 46 * p.energy) * motion;
    const turbulence = 0.6 + 1.2 * p.pace;
    const t = time;
    const want = targetCount();
    const swirlR = 170;

    // Grow toward the target a little each frame; shrinking happens as particles expire.
    const add = Math.min(want - count, 40);
    for (let n = 0; n < add; n++) spawn(count++, true);

    for (let i = 0; i < count; i++) {
      let x = px[i];
      let y = py[i];

      // Flow field: layered sines give a cheap, smoothly varying curl-like drift.
      const a =
        Math.sin(x * 0.0019 + t * 0.06 + Math.sin(y * 0.0023 - t * 0.045) * turbulence) * Math.PI +
        Math.cos(y * 0.0013 + t * 0.03) * 0.8;
      let ax = Math.cos(a) * flowSpeed;
      let ay = Math.sin(a) * flowSpeed;

      // Breathing: radial push on inhale, pull on exhale, stronger farther out.
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const breathPush = breathVelocity * dist * 0.22 * motion;
      ax += (dx / dist) * breathPush;
      ay += (dy / dist) * breathPush;

      // Ripples: a soft band at each wave front pushes outward and lights particles up.
      for (let j = 0; j < ripples.length; j++) {
        const rp = ripples[j];
        const rdx = x - rp.x;
        const rdy = y - rp.y;
        const rd = Math.hypot(rdx, rdy) || 1;
        const band = 1 - Math.abs(rd - rp.r) / 34;
        if (band > 0) {
          const f = band * rp.strength;
          ax += (rdx / rd) * f * 260;
          ay += (rdy / rd) * f * 260;
          glow[i] = Math.min(1.6, glow[i] + f * dt * 9);
        }
      }

      // Pointer: particles swirl around it; holding the button gathers them in.
      if (pointer.presence > 0.01) {
        const qx = pointer.x - x;
        const qy = pointer.y - y;
        const qd = Math.hypot(qx, qy) || 1;
        if (qd < swirlR * 1.6) {
          const fall = Math.exp(-(qd * qd) / (2 * swirlR * swirlR)) * pointer.presence;
          const pull = pointer.down ? 210 : 26;
          ax += ((qx / qd) * pull + (-qy / qd) * 70) * fall;
          ay += ((qy / qd) * pull + (qx / qd) * 70) * fall;
        }
      }

      // Velocity relaxes toward the summed forces (critically damped feel).
      const damp = 1 - Math.exp(-dt * 2.2);
      pvx[i] += (ax - pvx[i]) * damp;
      pvy[i] += (ay - pvy[i]) * damp;
      x += pvx[i] * dt;
      y += pvy[i] * dt;

      // Wrap softly around the edges.
      if (x < -10) x = width + 10;
      else if (x > width + 10) x = -10;
      if (y < -10) y = height + 10;
      else if (y > height + 10) y = -10;
      px[i] = x;
      py[i] = y;

      glow[i] *= Math.exp(-dt * 2.5);
      life[i] -= dt;
      if (life[i] <= 0) {
        if (count > want) {
          // Remove by swapping in the last particle, then re-process this slot.
          count--;
          copyParticle(count, i);
          i--;
        } else {
          spawn(i, false);
        }
      }
    }
  }

  function copyParticle(from: number, to: number) {
    px[to] = px[from];
    py[to] = py[from];
    pvx[to] = pvx[from];
    pvy[to] = pvy[from];
    life[to] = life[from];
    span[to] = span[from];
    size[to] = size[from];
    glow[to] = glow[from];
    bucket[to] = bucket[from];
  }

  // ---- draw ---------------------------------------------------------------------------

  function draw() {
    // Translucent fill leaves trails; slower breathing (lower pace) leaves longer ones.
    const trail = reducedMotion.matches ? 1 : 0.1 + 0.16 * p.pace + 0.1 * (1 - p.clarity);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = background(trail);
    g.fillRect(0, 0, width, height);

    g.globalCompositeOperation = "lighter";
    drawAura();
    drawParticles();
    drawRipples();
    drawCore();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }

  function sat(base: number): number {
    return 18 + base * p.clarity;
  }

  function drawAura() {
    const cx = width / 2;
    const cy = height / 2;
    const R = Math.max(width, height) * (0.42 + 0.08 * breath);
    const aura = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    const a = 0.05 + 0.05 * breath + 0.04 * p.clarity;
    aura.addColorStop(0, `hsla(${p.hue}, ${sat(60)}%, 55%, ${a})`);
    aura.addColorStop(0.45, `hsla(${p.hue + 30}, ${sat(50)}%, 40%, ${a * 0.4})`);
    aura.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    g.globalAlpha = 1;
    g.fillStyle = aura;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
  }

  function drawParticles() {
    const s = sat(62);
    // One fillStyle per hue bucket; per-particle alpha via globalAlpha.
    for (let b = 0; b < HUE_BUCKETS; b++) {
      const hue = p.hue + (b - (HUE_BUCKETS - 1) / 2) * 9;
      g.fillStyle = `hsl(${hue.toFixed(1)}, ${s.toFixed(0)}%, 72%)`;
      for (let i = 0; i < count; i++) {
        if (bucket[i] !== b) continue;
        // Fade in and out over the particle's life.
        const age = 1 - life[i] / span[i];
        const fade = Math.min(1, age * 6, (1 - age) * 4);
        const alpha = fade * (0.22 + 0.25 * p.clarity + 0.45 * glow[i]);
        if (alpha < 0.02) continue;
        const d = size[i] * (1 + glow[i] * 0.8);
        g.globalAlpha = Math.min(1, alpha);
        g.fillRect(px[i] - d / 2, py[i] - d / 2, d, d);
      }
    }
  }

  function drawRipples() {
    for (const rp of ripples) {
      const hue = rp.user ? p.hue + 160 : p.hue + 12;
      g.globalAlpha = Math.min(1, rp.strength * 0.5);
      g.strokeStyle = `hsl(${hue}, ${sat(55)}%, 70%)`;
      g.lineWidth = 1 + rp.strength * 2;
      g.beginPath();
      g.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      g.stroke();
    }
  }

  function drawCore() {
    const cx = width / 2;
    const cy = height / 2;
    // Heartbeat "lub-dub" contraction envelope.
    const env = (s: number) => (s < 0 ? 0 : Math.exp(-s * 9) * Math.min(1, s * 40));
    const kick = p.pulseDrive * (env(sinceBeat) + 0.55 * env(sinceBeat - 0.2));
    const R = coreRadius() * (0.82 + 0.22 * breath) * (1 + 0.07 * kick);
    const v = p.variation;
    const t = time;

    // Inner glow.
    const glowR = R * (1.9 + 0.5 * kick);
    const inner = g.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    inner.addColorStop(0, `hsla(${p.hue - 10}, ${sat(70)}%, 70%, ${0.32 + 0.3 * kick})`);
    inner.addColorStop(0.5, `hsla(${p.hue}, ${sat(60)}%, 50%, ${0.08 + 0.1 * kick})`);
    inner.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    g.globalAlpha = 1;
    g.fillStyle = inner;
    g.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

    // Membranes: closed curves whose harmonics (lobes) grow with variation.
    const layers = 5;
    for (let l = 0; l < layers; l++) {
      const k = l / (layers - 1);
      const lr = R * (0.55 + k * 0.6);
      const steps = 120;
      g.beginPath();
      for (let s = 0; s <= steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const wobble =
          Math.sin(a * 3 + t * 0.4 + l * 0.9) * (0.035 + 0.03 * v) +
          Math.sin(a * 5 - t * 0.3 + l * 1.7) * (0.012 + 0.06 * v) +
          Math.sin(a * 7 + t * 0.55 - l) * 0.045 * v +
          Math.sin(a * 2 - t * 0.2) * 0.03;
        const r = lr * (1 + wobble + 0.04 * kick * (1 - k));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (s === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.globalAlpha = 0.22 + (1 - k) * 0.3 + kick * 0.3;
      g.strokeStyle = `hsl(${p.hue + k * 40}, ${sat(65)}%, ${68 + kick * 12}%)`;
      g.lineWidth = 0.8 + (1 - k) * 1.2 + kick * 1.2;
      g.stroke();
    }
  }

  // ---- loop & lifecycle -----------------------------------------------------------------

  function loop(now: number) {
    if (stopped) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;

    pointer.presence += ((pointer.inside ? 1 : 0) - pointer.presence) * (1 - Math.exp(-dt * 4));
    ease(dt);
    advanceRhythms(dt);
    updateRipples(dt);
    updateParticles(dt);
    draw();
    frame = requestAnimationFrame(loop);
  }

  function onPointerMove(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.inside = true;
  }
  function onPointerDown(e: PointerEvent) {
    onPointerMove(e);
    pointer.down = true;
    if (!reducedMotion.matches) addRipple(pointer.x, pointer.y, 0.75, true);
  }
  function onPointerUp() {
    pointer.down = false;
  }
  function onPointerLeave() {
    pointer.inside = false;
    pointer.down = false;
  }

  // rAF already pauses in hidden tabs; reset the clock so dt doesn't spike on return.
  function onVisibility() {
    last = performance.now();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  frame = requestAnimationFrame(loop);

  return {
    setTargets(next) {
      targets = next;
    },
    setOptions(next) {
      Object.assign(options, next);
      options.density = Math.min(1.6, Math.max(0.4, options.density));
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
