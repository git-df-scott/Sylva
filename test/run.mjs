import { makeRng, hashString } from '../js/rng.js';
import {
  GENE_COUNT, encodeGenome, decodeGenome, randomGenome,
  mutateGenome, breedGenomes, makeName, accessionNumber, archetypeOf,
} from '../js/genome.js';
import { buildPlant, computeBounds, traverse } from '../js/plant.js';

let failures = 0;
const ok = (cond, msg) => {
  if (!cond) { failures++; console.error('FAIL:', msg); }
};

// 1. Determinism of RNG
{
  const a = makeRng(hashString('x')), b = makeRng(hashString('x'));
  ok(a() === b() && a() === b(), 'rng determinism');
}

// 2. Genome round-trip, 500 random genomes
{
  const rng = makeRng(42);
  for (let i = 0; i < 500; i++) {
    const g = randomGenome(rng);
    const code = encodeGenome(g);
    const back = decodeGenome(code);
    ok(back && back.length === GENE_COUNT, `roundtrip length i=${i}`);
    ok(back && back.every((v, j) => v === g[j]), `roundtrip equality i=${i}`);
    ok(decodeGenome(code.replace(/[\s]/g, '') + '') !== null, 'clean decode');
  }
}

// 3. Corruption is rejected
{
  const g = randomGenome(makeRng(7));
  const code = encodeGenome(g);
  const flip = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
  let rejected = 0;
  for (let i = 0; i < code.length; i++) {
    const bad = flip(code, i, code[i] === 'A' ? 'B' : 'A');
    if (decodeGenome(bad) === null) rejected++;
  }
  ok(rejected >= code.length - 2, `corruption detection (${rejected}/${code.length})`);
  ok(decodeGenome('not a code') === null, 'garbage rejected');
  ok(decodeGenome('') === null, 'empty rejected');
  ok(decodeGenome(code.slice(0, 10)) === null, 'truncated rejected');
  // pasted with junk formatting still parses
  const spaced = code.match(/.{1,6}/g).join(' \u00B7 ');
  ok(decodeGenome(spaced)?.every((v, j) => v === g[j]), 'tolerant paste decode');
}

// 4. Breeding and mutation produce valid genomes
{
  const rng = makeRng(99);
  for (let i = 0; i < 200; i++) {
    const a = randomGenome(rng), b = randomGenome(rng);
    const c = breedGenomes(a, b, rng);
    ok(c.length === GENE_COUNT && c.every((v) => v >= 0 && v <= 255 && Number.isInteger(v)),
      `breed validity i=${i}`);
    ok(decodeGenome(encodeGenome(c)) !== null, `breed encodable i=${i}`);
    const m = mutateGenome(a, rng);
    ok(m.every((v) => v >= 0 && v <= 255 && Number.isInteger(v)), `mutate validity i=${i}`);
    ok(archetypeOf(m) === archetypeOf(a), `mutate preserves archetype i=${i}`);
  }
}

// 5. Plant builds: budgets, determinism, bounds, all archetypes incl. extremes
{
  const rng = makeRng(2026);
  const seen = [0, 0, 0, 0];
  let maxSegs = 0;
  for (let i = 0; i < 160; i++) {
    const g = randomGenome(rng);
    if (i < 8) g[0] = (i % 4) * 64 + 10; // force each archetype early
    if (i >= 8 && i < 16) for (let j = 1; j < GENE_COUNT; j++) g[j] = 255; // extremes
    if (i >= 16 && i < 24) for (let j = 1; j < GENE_COUNT; j++) g[j] = 0;
    if (i >= 8 && i < 24) g[0] = (i % 4) * 64 + 10;
    const p = buildPlant(g);
    seen[p.arch]++;
    maxSegs = Math.max(maxSegs, p.stats.segments);
    ok(p.stats.segments > 3 && p.stats.segments <= 2600, `segment budget ${p.stats.segments} i=${i}`);
    const p2 = buildPlant(g);
    ok(p2.code === p.code && p2.stats.segments === p.stats.segments
      && p2.name === p.name, `plant determinism i=${i}`);
    const b = computeBounds(p);
    ok(Number.isFinite(b.height) && b.height > 5 && b.height < 5000,
      `bounds height ${b.height.toFixed(1)} i=${i}`);
    ok(b.halfW > 0 && b.halfW < 5000, `bounds width i=${i}`);
    if (p.arch === 1) ok(p.stats.blooms >= 1, `herb always blooms i=${i}`);
  }
  ok(seen.every((n) => n > 0), `all archetypes exercised ${JSON.stringify(seen)}`);
  console.log('max segments seen:', maxSegs, '| archetype spread:', seen.join('/'));
}

// 6. Traversal emits finite geometry at several growth stages
{
  const g = randomGenome(makeRng(5));
  const p = buildPlant(g);
  for (const gt of [0, 0.2, 0.5, 0.8, 1]) {
    let emits = 0, bad = 0;
    traverse(p, { gt, time: 3.2, wind: 0.6, gust: 0.8, gust2: 0.5 }, {
      stem: (...a) => { emits++; if (a.slice(0, 7).some((v) => !Number.isFinite(v))) bad++; },
      leaf: (x, y, a2, gg) => { emits++; if (![x, y, a2, gg].every(Number.isFinite)) bad++; },
      flower: (x, y) => { emits++; if (!Number.isFinite(x + y)) bad++; },
      plume: (x, y) => { emits++; if (!Number.isFinite(x + y)) bad++; },
    });
    ok(bad === 0, `finite geometry at gt=${gt}`);
    if (gt === 1) ok(emits >= p.stats.segments, 'full traversal emits all segments');
    if (gt === 0) ok(emits <= p.stats.segments, 'gt=0 emits little');
  }
}

// 7. Names and accession numbers
{
  const rng = makeRng(11);
  for (let i = 0; i < 100; i++) {
    const g = randomGenome(rng);
    const n = makeName(g);
    ok(/^[A-Z][a-z]+ [a-z]+$/.test(n), `name format "${n}"`);
    ok(n === makeName(g), 'name determinism');
    const acc = accessionNumber(g);
    ok(acc >= 1000 && acc <= 9999, 'accession range');
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll tests passed.');
