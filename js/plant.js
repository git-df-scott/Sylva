// Plant construction. Turns a genome into a precomputed tree of segments,
// leaves and blooms, plus a shared geometric traversal used by the renderer,
// the bounds pass and thumbnails. DOM-free.

import { hashString, makeRng } from './rng.js';
import { encodeGenome, gn, archetypeOf, makeName, accessionNumber } from './genome.js';

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;
const MAX_SEGMENTS = 2400;
const GROW_SPAN = 0.84; // portion of the growth clock used by stems

const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${Math.round(s)}% ${Math.round(l)}%)`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const ARCHETYPE_NAMES = ['Fern', 'Flowering herb', 'Grass tuft', 'Sapling'];

// ---------------------------------------------------------------------------
// Derived parameters

function deriveParams(genes) {
  const arch = archetypeOf(genes);
  return {
    arch,
    vigor: lerp(0.6, 1.35, gn(genes, 'vigor')),
    depthT: gn(genes, 'depth'),
    branchAngle: lerp(0.22, 0.85, gn(genes, 'branchAngle')),
    jitter: gn(genes, 'angleJitter') * 0.26,
    decay: lerp(0.62, 0.9, gn(genes, 'lengthDecay')),
    branchiness: gn(genes, 'branchiness'),
    curv: (gn(genes, 'curvature') - 0.5) * 2, // -1 droop .. +1 upward
    widthBase: lerp(2.6, 13, gn(genes, 'widthBase')),
    taper: lerp(0.5, 0.82, gn(genes, 'taper')),
    leafSize: lerp(9, 30, gn(genes, 'leafSize')),
    leafDensity: gn(genes, 'leafDensity'),
    leafAspect: lerp(0.22, 0.85, gn(genes, 'leafAspect')),
    stiffness: gn(genes, 'stiffness'),
    lean: (gn(genes, 'lean') - 0.5) * 0.24,
    flowerAmount: gn(genes, 'flowerAmount'),
    petals: 4 + Math.round(gn(genes, 'petalCount') * 9),
    flowerSize: lerp(9, 24, gn(genes, 'flowerSize')),
  };
}

function makePalette(genes, rng) {
  const arch = archetypeOf(genes);
  // Leaves: amber -> yellow-green -> deep green -> blue-green
  let leafHue = lerp(32, 165, gn(genes, 'leafHue'));
  if (arch === 0) leafHue = lerp(95, 152, gn(genes, 'leafHue')); // ferns stay green
  const leafSat = lerp(30, 62, gn(genes, 'leafSat'));
  const leafLight = lerp(28, 56, gn(genes, 'leafLight'));
  const spread = gn(genes, 'leafHueSpread') * 22;

  const stemHue = lerp(22, 118, gn(genes, 'stemHue'));
  const stemSat = lerp(22, 40, gn(genes, 'leafSat'));
  const stemLight = lerp(22, 36, gn(genes, 'leafLight'));

  // Flowers: curated bands so blooms never read as foliage.
  const fg = Math.round(gn(genes, 'flowerHue') * 255);
  const BANDS = [[336, 372], [12, 44], [44, 60], [192, 228], [256, 300], [300, 336]];
  const band = BANDS[Math.min(5, Math.floor(fg / 43))];
  const fHue = lerp(band[0], band[1], (fg % 43) / 42) % 360;
  const fSat = lerp(56, 80, gn(genes, 'leafSat'));
  const fLight = lerp(56, 70, gn(genes, 'flowerSize'));

  return {
    leaf: () => {
      const h = leafHue + rng.range(-spread, spread);
      const l = clamp(leafLight + rng.range(-5, 6), 22, 62);
      return {
        fill: hsl(h, leafSat, l),
        edge: hsl(h, leafSat + 6, clamp(l - 15, 12, 50)),
      };
    },
    stem: (depthNorm) => hsl(
      lerp(stemHue, leafHue, depthNorm * 0.55),
      lerp(stemSat, leafSat * 0.8, depthNorm * 0.5),
      clamp(lerp(stemLight, leafLight * 0.85, depthNorm * 0.6), 18, 46)
    ),
    flower: () => ({
      petal: hsl(fHue + rng.range(-6, 6), fSat, fLight),
      inner: hsl(fHue, clamp(fSat - 10, 30, 90), clamp(fLight + 12, 40, 86)),
      center: hsl((fHue + 52) % 360, 62, 58),
      dot: hsl((fHue + 40) % 360, 55, 34),
    }),
    plume: () => hsl(lerp(leafHue, 47, 0.7) + rng.range(-4, 4), 42, rng.range(56, 66)),
    accentHue: fHue,
  };
}

// ---------------------------------------------------------------------------
// Node factory

function makeCtx(genes) {
  const code = encodeGenome(genes);
  const rng = makeRng(hashString('plant:' + code));
  return {
    genes, code, rng,
    P: deriveParams(genes),
    pal: makePalette(genes, rng),
    count: 0,
    leafCount: 0,
    flowerCount: 0,
  };
}

function seg(ctx, props) {
  ctx.count++;
  return Object.assign({
    angle: 0, bend: 0, len: 10, width: 1,
    pathStart: 0, birthOffset: 0,
    birth: 0, dur: 0.05, phase: ctx.rng() * TAU, windAmp: 0,
    color: '#333', leaves: [], flower: null, plume: null, children: [],
  }, props);
}

function addLeaf(ctx, s, props) {
  ctx.leafCount++;
  const c = ctx.pal.leaf();
  s.leaves.push(Object.assign({
    t: 0.7, side: 1, size: 12, spread: 1.0, aspect: 0.5,
    fill: c.fill, edge: c.edge,
    birth: 0, phase: ctx.rng() * TAU,
  }, props));
}

function addFlower(ctx, s, props) {
  ctx.flowerCount++;
  s.flower = Object.assign({
    petals: 5, size: 12, rot: ctx.rng() * TAU,
    colors: ctx.pal.flower(),
    birth: 0, phase: ctx.rng() * TAU,
  }, props);
}

// ---------------------------------------------------------------------------
// Archetype builders. Each returns an array of root segments.
// absAng is tracked during build so tropism (bend) can react to orientation.

function tropismBend(P, absAng, k = 1) {
  const dev = absAng - UP; // 0 when vertical
  if (P.curv >= 0) return clamp(-dev * P.curv * 0.5 * k, -0.5, 0.5);
  const out = dev >= 0 ? 1 : -1;
  return -P.curv * 0.2 * out * k; // droop outward
}

function buildSapling(ctx) {
  const { P, rng } = ctx;
  let depth = 4 + Math.round(P.depthT * 4);
  const bf = 2 + P.branchiness * 0.9;
  while (depth > 4 && Math.pow(bf, depth) > 1500) depth--;
  const maxDepth = depth;

  const grow = (parent, d, len, width, pathStart, absAng) => {
    if (ctx.count > MAX_SEGMENTS) return;
    const depthNorm = 1 - d / maxDepth;
    const isTrunk = d >= maxDepth - 1;
    const bend = tropismBend(P, absAng, isTrunk ? 0.4 : 1) + rng.range(-0.04, 0.04);
    const s = seg(ctx, {
      angle: parent ? 0 : 0, len, width,
      bend, pathStart,
      color: ctx.pal.stem(depthNorm),
    });
    const endAbs = absAng + bend;
    const endPath = pathStart + len;

    if (d <= 0) {
      // tip: leaf cluster, maybe blossom
      const n = 2 + Math.round(P.leafDensity * 2.5);
      for (let i = 0; i < n; i++) {
        if (P.flowerAmount > 0.7 && rng() < P.flowerAmount * 0.55) {
          if (!s.flower) addFlower(ctx, s, { petals: 5, size: P.flowerSize * 0.62 });
          else addLeaf(ctx, s, tipLeaf(ctx, i, n));
        } else {
          addLeaf(ctx, s, tipLeaf(ctx, i, n));
        }
      }
      return s;
    }

    // leaves begin appearing on outer branches
    if (d <= 2) {
      const n = Math.round(P.leafDensity * 2.2);
      for (let i = 0; i < n; i++) {
        addLeaf(ctx, s, {
          t: rng.range(0.4, 0.95), side: rng.sign(),
          size: P.leafSize * rng.range(0.5, 0.8),
          spread: rng.range(0.7, 1.2), aspect: P.leafAspect,
        });
      }
    }

    let kids = 2;
    if (rng() < P.branchiness * 0.7) kids = 3;
    if (d < maxDepth - 1 && rng() < 0.18) kids = 1;
    const spread = P.branchAngle * (kids === 1 ? 0.3 : 1);
    const taper = isTrunk ? Math.max(P.taper, 0.78) : P.taper;
    for (let k = 0; k < kids; k++) {
      const t = kids === 1 ? 0 : k / (kids - 1) - 0.5;
      const a = t * 2 * spread + rng.range(-P.jitter, P.jitter);
      const child = grow(null, d - 1,
        len * P.decay * rng.range(0.85, 1.05),
        Math.max(0.6, width * taper),
        endPath, endAbs + a);
      if (child) { child.angle = a; s.children.push(child); }
    }
    return s;
  };

  const tipLeaf = (ctx2, i, n) => ({
    t: 0.55 + 0.45 * (i / Math.max(1, n - 1)), side: i % 2 ? 1 : -1,
    size: P.leafSize * ctx2.rng.range(0.55, 0.85),
    spread: ctx2.rng.range(0.6, 1.1), aspect: P.leafAspect,
  });

  const trunkLen = 70 * P.vigor;
  const root = grow(null, maxDepth, trunkLen, P.widthBase * 1.5, 0, UP + P.lean);
  root.angle = UP + P.lean;
  return [root];
}

function buildHerb(ctx) {
  const { P, rng } = ctx;
  const nodes = 4 + Math.round(P.depthT * 3);
  const segLen = 26 * P.vigor;
  const roots = [];

  const lateral = (baseAbs, pathStart, scale, forceFlower) => {
    const n = 2 + Math.round(rng() * 1.4);
    let head = null, tail = null, abs = baseAbs, path = pathStart;
    for (let i = 0; i < n; i++) {
      const bend = tropismBend(P, abs, 0.8) + rng.range(-0.05, 0.05);
      const s = seg(ctx, {
        len: segLen * scale * Math.pow(P.decay, i) * 0.8,
        width: Math.max(0.7, P.widthBase * 0.4 * Math.pow(P.taper, i)),
        bend, pathStart: path,
        color: ctx.pal.stem(0.4 + 0.5 * (i / n)),
      });
      if (rng() < P.leafDensity * 0.8) {
        addLeaf(ctx, s, {
          t: rng.range(0.5, 0.9), side: rng.sign(),
          size: P.leafSize * rng.range(0.45, 0.7),
          spread: rng.range(0.8, 1.3), aspect: P.leafAspect,
        });
      }
      abs += bend; path += s.len;
      if (tail) { s.angle = rng.range(-0.12, 0.12); tail.children.push(s); }
      else head = s;
      tail = s;
    }
    if (forceFlower || rng() < P.flowerAmount) {
      addFlower(ctx, tail, { petals: P.petals, size: P.flowerSize * rng.range(0.7, 0.95) });
    }
    return head;
  };

  let abs = UP + P.lean, path = 0, prev = null, first = null;
  for (let i = 0; i < nodes; i++) {
    const bend = tropismBend(P, abs, 0.6) + rng.range(-0.045, 0.045);
    const s = seg(ctx, {
      angle: prev ? rng.range(-0.06, 0.06) : abs,
      len: segLen * Math.pow(0.94, i),
      width: Math.max(0.9, P.widthBase * 0.55 * Math.pow(P.taper, i * 0.6)),
      bend, pathStart: path,
      color: ctx.pal.stem(0.25 + 0.6 * (i / nodes)),
    });
    // paired leaves at each node
    if (i > 0) {
      const size = P.leafSize * lerp(1.0, 0.5, i / nodes);
      for (const side of [-1, 1]) {
        if (rng() < 0.35 + P.leafDensity * 0.65) {
          addLeaf(ctx, s, {
            t: rng.range(0.1, 0.3), side,
            size: size * rng.range(0.8, 1.05),
            spread: rng.range(0.9, 1.35), aspect: P.leafAspect,
          });
        }
      }
      // lateral branch
      if (i < nodes - 1 && rng() < P.branchiness * (0.85 - (i / nodes) * 0.4)) {
        const side = rng.sign();
        const a = side * (P.branchAngle + rng.range(-P.jitter, P.jitter));
        const br = lateral(abs + bend + a, path + s.len, lerp(0.9, 0.5, i / nodes), false);
        if (br) { br.angle = a; s.children.push(br); }
      }
    }
    abs += bend; path += s.len;
    if (prev) prev.children.push(s); else first = s;
    prev = s;
  }
  addFlower(ctx, prev, { petals: P.petals, size: P.flowerSize }); // apex always blooms
  roots.push(first);
  return roots;
}

function buildGrass(ctx) {
  const { P, rng } = ctx;
  const blades = 8 + Math.round(P.branchiness * 9 + P.vigor * 3);
  const roots = [];
  for (let b = 0; b < blades; b++) {
    const pos = blades === 1 ? 0 : (b / (blades - 1)) * 2 - 1; // -1..1 fan position
    const nSegs = 6 + Math.round(P.depthT * 4);
    const arcDir = pos === 0 ? rng.sign() : Math.sign(pos);
    const totalArc = arcDir * lerp(0.6, 1.9, (1 - (P.curv + 1) / 2)) * rng.range(0.75, 1.15);
    const len0 = 15 * P.vigor * (1 - Math.abs(pos) * 0.32) * rng.range(0.85, 1.1);
    const baseA = UP + P.lean + pos * 0.42 + rng.range(-P.jitter, P.jitter) * 0.6;
    const off = rng() * 0.3;

    let prev = null, first = null, path = 0;
    for (let i = 0; i < nSegs; i++) {
      const w = (i / (nSegs - 1));
      const bend = totalArc * (0.4 + 1.3 * w * w) / nSegs;
      const s = seg(ctx, {
        angle: prev ? 0 : baseA,
        len: len0 * lerp(1, 0.75, w),
        width: Math.max(0.5, lerp(1.6, 3.4, gn(ctx.genes, 'widthBase')) * (1 - w * 0.85)),
        bend, pathStart: path, birthOffset: off,
        color: ctx.pal.stem(0.35 + 0.55 * w),
      });
      path += s.len;
      if (prev) prev.children.push(s); else first = s;
      prev = s;
    }
    if (P.flowerAmount > 0.35 && Math.abs(pos) < 0.6 && rng() < P.flowerAmount) {
      prev.plume = {
        n: 6 + Math.round(rng() * 5),
        size: lerp(2.1, 3.9, P.flowerAmount),
        color: ctx.pal.plume(),
        birth: 0, phase: rng() * TAU,
      };
      ctx.flowerCount++;
    }
    roots.push(first);
  }
  return roots;
}

function buildFern(ctx) {
  const { P, rng } = ctx;
  const fronds = 4 + Math.round(P.branchiness * 3);
  const roots = [];
  for (let f = 0; f < fronds; f++) {
    const pos = fronds === 1 ? 0 : (f / (fronds - 1)) * 2 - 1;
    const side = pos === 0 ? rng.sign() : Math.sign(pos);
    const nSegs = 10 + Math.round(P.depthT * 6);
    const arc = side * lerp(0.5, 1.25, (1 - (P.curv + 1) / 2))
      * (0.55 + Math.abs(pos) * 0.55) * rng.range(0.85, 1.1);
    const len0 = 15 * P.vigor * (1 - Math.abs(pos) * 0.24);
    const baseA = UP + P.lean + pos * 0.26 + rng.range(-P.jitter, P.jitter) * 0.4;
    const off = rng() * 0.22;

    let prev = null, first = null, path = 0;
    for (let i = 0; i < nSegs; i++) {
      const w = i / (nSegs - 1);
      const s = seg(ctx, {
        angle: prev ? 0 : baseA,
        len: len0 * lerp(1, 0.62, w),
        width: Math.max(0.6, P.widthBase * 0.3 * (1 - w * 0.8)),
        bend: arc * (0.3 + 1.5 * w * w) / nSegs,
        pathStart: path, birthOffset: off,
        color: ctx.pal.stem(0.3 + 0.6 * w),
      });
      // pinnae: dense paired leaflets, sized on a raised-sine profile
      if (i >= 1) {
        const profile = 0.32 + 0.68 * Math.sin(Math.PI * clamp(w * 1.12, 0, 1));
        const per = P.leafDensity > 0.35 ? 2 : 1;
        for (let p = 0; p < per; p++) {
          const t = per === 1 ? 0.6 : 0.3 + p * 0.48;
          for (const sd of [-1, 1]) {
            addLeaf(ctx, s, {
              t, side: sd,
              size: P.leafSize * 0.66 * profile * rng.range(0.9, 1.08),
              spread: rng.range(1.08, 1.28),
              aspect: clamp(P.leafAspect * 0.45, 0.13, 0.3),
            });
          }
        }
      }
      path += s.len;
      if (prev) prev.children.push(s); else first = s;
      prev = s;
    }
    roots.push(first);
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Post-pass: growth timing + wind amplitudes

const WIND_BASE = [0.02, 0.014, 0.034, 0.010]; // per archetype

function finalize(ctx, roots) {
  let maxPath = 1;
  const walk = (s, fn) => { fn(s); s.children.forEach((c) => walk(c, fn)); };
  roots.forEach((r) => walk(r, (s) => { maxPath = Math.max(maxPath, s.pathStart + s.len); }));

  const base = WIND_BASE[ctx.P.arch] * (1.3 - ctx.P.stiffness);
  roots.forEach((r) => walk(r, (s) => {
    const dn = clamp((s.pathStart + s.len * 0.5) / maxPath, 0, 1);
    s.birth = clamp((s.pathStart / maxPath) * GROW_SPAN + s.birthOffset * 0.12 + ctx.rng() * 0.015, 0, 0.9);
    s.dur = Math.max(0.02, (s.len / maxPath) * GROW_SPAN);
    s.windAmp = base * Math.pow(dn, 1.3);
    for (const lf of s.leaves) lf.birth = clamp(s.birth + s.dur * lf.t + 0.01, 0, 0.94);
    if (s.flower) s.flower.birth = clamp(s.birth + s.dur + 0.03, 0, 0.9);
    if (s.plume) s.plume.birth = clamp(s.birth + s.dur + 0.02, 0, 0.9);
  }));

  return { roots, maxPath, count: ctx.count };
}

// ---------------------------------------------------------------------------

const BUILDERS = [buildFern, buildHerb, buildGrass, buildSapling];

export function buildPlant(genes) {
  const ctx = makeCtx(genes);
  const roots = BUILDERS[ctx.P.arch](ctx);
  const tree = finalize(ctx, roots);
  return {
    genes: genes.slice(),
    code: ctx.code,
    name: makeName(genes),
    num: accessionNumber(genes),
    arch: ctx.P.arch,
    archName: ARCHETYPE_NAMES[ctx.P.arch],
    accentHue: ctx.pal.accentHue,
    tree,
    stats: { segments: ctx.count, leaves: ctx.leafCount, blooms: ctx.flowerCount },
  };
}

// ---------------------------------------------------------------------------
// Shared traversal. Base of the plant is at (0,0), up is -y, unscaled units.
// opts: { gt, time, wind, gust, gust2 }   emit: { stem, leaf, flower, plume }

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function traverse(plant, opts, emit) {
  const { gt = 1, time = 0, wind = 0, gust = 0, gust2 = 0 } = opts;

  const walkSeg = (s, x, y, ang) => {
    const g = smooth((gt - s.birth) / s.dur);
    if (g <= 0) return;

    const windOff = wind * s.windAmp * (gust * 0.8 + gust2 * 0.45 * Math.sin(time * 2.6 + s.phase));
    const a0 = ang + s.angle + windOff;
    const a1 = a0 + s.bend;
    const mid = a0 + s.bend * 0.5;
    const len = s.len * g;
    const ex = x + Math.cos(mid) * len;
    const ey = y + Math.sin(mid) * len;
    const cx = x + Math.cos(a0) * len * 0.5;
    const cy = y + Math.sin(a0) * len * 0.5;
    const w = s.width * (0.35 + 0.65 * g);

    emit.stem(x, y, cx, cy, ex, ey, w, s.color, s);

    for (const lf of s.leaves) {
      const lg = smooth((gt - lf.birth) / 0.07);
      if (lg <= 0) continue;
      const t = lf.t;
      const it = 1 - t;
      const px = it * it * x + 2 * it * t * cx + t * t * ex;
      const py = it * it * y + 2 * it * t * cy + t * t * ey;
      const flutter = wind * 0.09 * Math.sin(time * 5.2 + lf.phase) * (0.4 + 0.6 * gust2);
      const la = (a0 + s.bend * t) + lf.side * lf.spread + flutter;
      emit.leaf(px, py, la, lg, lf);
    }

    if (s.flower) {
      const fg = smooth((gt - s.flower.birth) / 0.1);
      if (fg > 0) {
        const sway = wind * 0.05 * Math.sin(time * 1.8 + s.flower.phase);
        emit.flower(ex, ey, a1 + sway, fg, s.flower);
      }
    }
    if (s.plume) {
      const pg = smooth((gt - s.plume.birth) / 0.1);
      if (pg > 0) emit.plume(ex, ey, a1, pg, s.plume);
    }

    for (const c of s.children) walkSeg(c, ex, ey, a1);
  };

  for (const r of plant.tree.roots) walkSeg(r, 0, 0, 0);
}

// Bounds at full growth, no wind. Used to fit the plant to the stage.
export function computeBounds(plant) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  const grow = (x, y, r) => {
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r);
  };
  traverse(plant, { gt: 1, wind: 0 }, {
    stem: (x0, y0, cx, cy, x1, y1, w) => { grow(x0, y0, w); grow(x1, y1, w); },
    leaf: (x, y, a, g, lf) => grow(x, y, lf.size * 1.05),
    flower: (x, y, a, g, fl) => grow(x, y, fl.size * 1.15),
    plume: (x, y, a, g, pl) => grow(x, y, pl.n * pl.size * 0.9),
  });
  return { minX, maxX, minY, maxY, height: -minY, halfW: Math.max(Math.abs(minX), Math.abs(maxX)) };
}
