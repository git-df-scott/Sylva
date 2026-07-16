// Canvas rendering: the stage (environment, growth clock, wind, particles)
// and a shared plant painter also used for greenhouse thumbnails.

import { traverse, computeBounds } from './plant.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ENVS = {
  dawn: {
    sky: ['#F1E5CF', '#EEDCC2', '#E7CFB6'],
    line: 'rgba(58,68,48,0.55)', shadow: 'rgba(52,62,44,0.20)',
    glow: { x: 0.28, y: 1.0, r: 0.9, color: 'rgba(233,178,132,0.34)' },
    night: false, particles: 'pollen',
  },
  noon: {
    sky: ['#F4EFE0', '#F0E9D5', '#EAE1C9'],
    line: 'rgba(54,66,46,0.5)', shadow: 'rgba(50,60,42,0.18)',
    glow: null, night: false, particles: 'pollen',
  },
  dusk: {
    sky: ['#E9D9BD', '#E2CBAA', '#D8BC9C'],
    line: 'rgba(66,58,42,0.55)', shadow: 'rgba(56,50,38,0.22)',
    glow: { x: 0.74, y: 1.0, r: 0.85, color: 'rgba(214,141,96,0.32)' },
    night: false, particles: 'pollen',
  },
  night: {
    sky: ['#18241C', '#131E17', '#0E1712'],
    line: 'rgba(196,214,186,0.28)', shadow: 'rgba(0,0,0,0.35)',
    glow: null, night: true, particles: 'fireflies', moon: true,
  },
};

export const GROW_DURATION = [5200, 5600, 4200, 7200]; // ms per archetype

// ---------------------------------------------------------------------------
// Shared plant painter. Assumes ctx is translated to the plant base and
// scaled by k (so geometry units map to screen consistently).

function drawPlant(ctx, plant, opts, k, night) {
  const outline = night ? 'rgba(214,230,204,0.30)' : 'rgba(33,45,29,0.42)';
  const petalEdge = night ? 'rgba(230,238,222,0.35)' : 'rgba(38,48,32,0.34)';
  const thin = 0.9 / k;
  const glowBlooms = night && plant.stats.blooms > 0 && plant.stats.blooms <= 40;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  traverse(plant, opts, {
    stem(x0, y0, cx, cy, x1, y1, w, color) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.lineWidth = w;
      ctx.strokeStyle = color;
      ctx.stroke();
    },
    leaf(x, y, ang, g, lf) {
      const s = lf.size * g;
      if (s < 0.6) return;
      const w = s * lf.aspect;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(w, -s * 0.3, w * 0.92, -s * 0.74, 0, -s);
      ctx.bezierCurveTo(-w * 0.92, -s * 0.74, -w, -s * 0.3, 0, 0);
      ctx.fillStyle = lf.fill;
      ctx.fill();
      ctx.lineWidth = thin;
      ctx.strokeStyle = outline;
      ctx.stroke();
      if (s > 6) {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.14);
        ctx.lineTo(0, -s * 0.82);
        ctx.lineWidth = thin * 0.8;
        ctx.strokeStyle = lf.edge;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
    flower(x, y, ang, g, fl) {
      const s = fl.size * (g < 1 ? g * (1 + 0.16 * Math.sin(g * Math.PI)) : 1);
      if (s < 1) return;
      ctx.save();
      ctx.translate(x, y);
      if (glowBlooms) {
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.3);
        halo.addColorStop(0, fl.colors.inner.replace('hsl', 'hsla').replace(')', ' / 0.30)'));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, s * 2.3, 0, TAU);
        ctx.fill();
      }
      ctx.rotate(fl.rot);
      const petal = (len, wid, fill) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(wid, -len * 0.36, wid * 0.82, -len * 0.82, 0, -len);
        ctx.bezierCurveTo(-wid * 0.82, -len * 0.82, -wid, -len * 0.36, 0, 0);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = thin;
        ctx.strokeStyle = petalEdge;
        ctx.stroke();
      };
      const n = fl.petals;
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.rotate((i / n) * TAU);
        petal(s, s * 0.4, fl.colors.petal);
        ctx.restore();
      }
      const n2 = Math.max(4, n - 2);
      for (let i = 0; i < n2; i++) {
        ctx.save(); ctx.rotate((i / n2) * TAU + Math.PI / n);
        petal(s * 0.55, s * 0.26, fl.colors.inner);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.17, 0, TAU);
      ctx.fillStyle = fl.colors.center;
      ctx.fill();
      const dots = Math.min(7, 3 + (n % 5));
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * TAU + 0.6;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * s * 0.1, Math.sin(a) * s * 0.1, s * 0.045, 0, TAU);
        ctx.fillStyle = fl.colors.dot;
        ctx.fill();
      }
      ctx.restore();
    },
    plume(x, y, ang, g, pl) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = pl.color;
      const step = pl.size * 1.35 * g;
      for (let i = 0; i < pl.n; i++) {
        const off = (i % 2 ? 1 : -1) * pl.size * 0.55;
        ctx.beginPath();
        ctx.ellipse((i + 0.6) * step, off, pl.size * 1.05 * g, pl.size * 0.5 * g,
          off > 0 ? 0.5 : -0.5, 0, TAU);
        ctx.fill();
      }
      ctx.lineWidth = thin;
      ctx.strokeStyle = outline;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo((pl.n + 0.6) * step, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  });
}

// ---------------------------------------------------------------------------
// Stage

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.plant = null;
    this.env = ENVS.noon;
    this.envName = 'noon';
    this.wind = 0.45;
    this.reduced = false;
    this.growStart = 0;
    this.growDur = 6000;
    this.gt = 0;
    this.scale = 1;
    this.baseX = 0;
    this.groundY = 0;
    this.baseline = [];
    this.particles = [];
    this.lastT = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.w = Math.max(2, r.width);
    this.h = Math.max(2, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.groundY = this.h * 0.865;
    this.baseX = this.w / 2;
    this.makeBaseline();
    this.fit();
    this.seedParticles();
  }

  makeBaseline() {
    const pts = [];
    const n = Math.ceil(this.w / 14);
    for (let i = 0; i <= n; i++) {
      pts.push([(i / n) * this.w, this.groundY + Math.sin(i * 1.7) * 1.1 + Math.sin(i * 0.53) * 0.8]);
    }
    this.baseline = pts;
  }

  fit() {
    if (!this.plant) return;
    const b = computeBounds(this.plant);
    const sH = (this.h * 0.62) / Math.max(1, b.height);
    const sW = (this.w * 0.42) / Math.max(1, b.halfW);
    this.scale = Math.min(sH, sW);
    this.shadowR = b.halfW * this.scale * 0.85 + 34;
  }

  setPlant(plant, { grow = true } = {}) {
    this.plant = plant;
    this.growDur = this.reduced ? 1100 : GROW_DURATION[plant.arch];
    this.growStart = grow ? performance.now() : -1e9;
    this.fit();
  }

  regrow() {
    if (!this.plant) return;
    this.growStart = performance.now();
  }

  finishGrowth() { this.growStart = -1e9; }

  setEnv(name) {
    this.envName = name;
    this.env = ENVS[name] || ENVS.noon;
    this.seedParticles();
  }

  seedParticles() {
    const kind = this.reduced ? null : this.env.particles;
    this.particles = [];
    if (kind === 'pollen') {
      for (let i = 0; i < 14; i++) {
        this.particles.push({
          kind, x: Math.random() * this.w, y: this.h * (0.2 + Math.random() * 0.6),
          phase: Math.random() * TAU, r: 0.9 + Math.random() * 0.9, drift: 0.6 + Math.random() * 0.8,
        });
      }
    } else if (kind === 'fireflies') {
      for (let i = 0; i < 4; i++) {
        this.particles.push({
          kind, x: Math.random() * this.w, y: this.h * (0.35 + Math.random() * 0.4),
          phase: Math.random() * TAU, r: 2.2,
        });
      }
    }
  }

  render(now) {
    const t = now / 1000;
    const dt = clamp(t - this.lastT, 0, 0.05);
    this.lastT = t;
    const { ctx, w, h, env } = this;

    this.gt = clamp((now - this.growStart) / this.growDur, 0, 1);
    const gust = Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.7 + 1.3) * 0.4;
    const gust2 = 0.5 + 0.5 * Math.sin(t * 0.9 + 2.0);
    const wind = this.reduced ? this.wind * 0.25 : this.wind;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, env.sky[0]);
    sky.addColorStop(0.55, env.sky[1]);
    sky.addColorStop(1, env.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (env.moon) {
      const mx = w * 0.79, my = h * 0.18, mr = Math.min(30, w * 0.04);
      const halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 4);
      halo.addColorStop(0, 'rgba(226,232,205,0.16)');
      halo.addColorStop(1, 'rgba(226,232,205,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fillStyle = 'rgba(233,236,214,0.92)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mx - mr * 0.32, my - mr * 0.18, mr * 0.16, 0, TAU);
      ctx.arc(mx + mr * 0.22, my + mr * 0.3, mr * 0.11, 0, TAU);
      ctx.fillStyle = 'rgba(200,206,182,0.5)';
      ctx.fill();
    }
    if (env.glow) {
      const g = env.glow;
      const rg = ctx.createRadialGradient(w * g.x, h * g.y, 0, w * g.x, h * g.y, h * g.r);
      rg.addColorStop(0, g.color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }

    // Ground shadow + baseline
    if (this.plant) {
      ctx.save();
      ctx.translate(this.baseX, this.groundY + 5);
      ctx.scale(1, 0.2);
      const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, this.shadowR);
      sh.addColorStop(0, env.shadow);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(0, 0, this.shadowR, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    this.baseline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineWidth = 1;
    ctx.strokeStyle = env.line;
    ctx.stroke();

    // Plant
    if (this.plant) {
      ctx.save();
      ctx.translate(this.baseX, this.groundY);
      ctx.scale(this.scale, this.scale);
      drawPlant(ctx, this.plant,
        { gt: this.gt, time: t, wind, gust, gust2 },
        this.scale, env.night);
      ctx.restore();
    }

    // Particles
    for (const p of this.particles) {
      if (p.kind === 'pollen') {
        p.x += dt * (7 + 30 * wind * (0.5 + 0.5 * gust)) * (gust >= 0 ? 1 : 0.4);
        if (p.x > w + 8) p.x = -8;
        const y = p.y + Math.sin(t * 0.6 * p.drift + p.phase) * 13;
        ctx.beginPath();
        ctx.arc(p.x, y, p.r, 0, TAU);
        ctx.fillStyle = env.night ? 'rgba(220,230,205,0.2)' : 'rgba(46,58,40,0.17)';
        ctx.fill();
      } else {
        p.x += Math.sin(t * 0.31 + p.phase) * dt * 26;
        p.y += Math.cos(t * 0.23 + p.phase * 1.7) * dt * 18;
        p.x = clamp(p.x, 10, w - 10);
        p.y = clamp(p.y, h * 0.2, this.groundY - 20);
        const blink = Math.pow(Math.max(0, Math.sin(t * 0.8 + p.phase)), 3);
        if (blink > 0.02) {
          const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7);
          fg.addColorStop(0, `rgba(219,233,164,${0.75 * blink})`);
          fg.addColorStop(1, 'rgba(219,233,164,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Thumbnails for the greenhouse

export function renderThumbnail(plant, size = 280) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F5F0E2';
  ctx.fillRect(0, 0, size, size);

  const b = computeBounds(plant);
  const k = Math.min((size * 0.72) / Math.max(1, b.height), (size * 0.4) / Math.max(1, b.halfW));
  const groundY = size * 0.88;

  ctx.save();
  ctx.translate(size / 2, groundY + 4);
  ctx.scale(1, 0.2);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, b.halfW * k * 0.85 + 18);
  sh.addColorStop(0, 'rgba(50,60,42,0.16)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, b.halfW * k * 0.85 + 18, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(54,66,46,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size * 0.08, groundY);
  ctx.lineTo(size * 0.92, groundY);
  ctx.stroke();

  ctx.save();
  ctx.translate(size / 2, groundY);
  ctx.scale(k, k);
  drawPlant(ctx, plant, { gt: 1, wind: 0 }, k, false);
  ctx.restore();

  try { return c.toDataURL('image/webp', 0.82); }
  catch { return c.toDataURL('image/png'); }
}
