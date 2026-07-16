// Genome: 24 genes, one byte each. Encoded as a base64url-style seed code
// with a version byte and checksum. DOM-free.

import { hashString, makeRng } from './rng.js';

export const GENE_NAMES = [
  'archetype',      // 0..3 (fern, herb, grass, sapling)
  'vigor',          // overall size / energy
  'depth',          // recursion depth
  'branchAngle',
  'angleJitter',
  'lengthDecay',
  'branchiness',
  'curvature',      // 0 droop .. 128 straight .. 255 upward tropism
  'widthBase',
  'taper',
  'leafSize',
  'leafDensity',
  'leafAspect',     // 0 narrow .. 255 round
  'leafHue',
  'leafHueSpread',
  'leafSat',
  'leafLight',
  'stemHue',
  'flowerAmount',
  'flowerHue',
  'petalCount',
  'flowerSize',
  'stiffness',      // wind resistance
  'lean',           // base tilt
];

export const GENE_COUNT = GENE_NAMES.length;
const VERSION = 1;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ALPHA_MAP = (() => {
  const m = {};
  for (let i = 0; i < ALPHABET.length; i++) m[ALPHABET[i]] = i;
  return m;
})();

function bytesToCode(bytes) {
  let bits = 0, acc = 0, out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += ALPHABET[(acc >> bits) & 63];
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (6 - bits)) & 63];
  return out;
}

function codeToBytes(code) {
  let bits = 0, acc = 0;
  const out = [];
  for (const ch of code) {
    const v = ALPHA_MAP[ch];
    if (v === undefined) return null;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return out;
}

function checksum(genes) {
  let s = VERSION * 7;
  for (let i = 0; i < genes.length; i++) s = (s + genes[i] * (i + 3)) % 256;
  return s;
}

export function encodeGenome(genes) {
  const bytes = [VERSION, ...genes, checksum(genes)];
  return bytesToCode(bytes);
}

// Returns gene array or null. Tolerant of spacing/dots users may paste.
export function decodeGenome(code) {
  if (typeof code !== 'string') return null;
  const clean = code.replace(/[^A-Za-z0-9\-_]/g, '');
  const bytes = codeToBytes(clean);
  if (!bytes || bytes.length < GENE_COUNT + 2) return null;
  if (bytes[0] !== VERSION) return null;
  const genes = bytes.slice(1, 1 + GENE_COUNT);
  const chk = bytes[1 + GENE_COUNT];
  if (chk !== checksum(genes)) return null;
  return genes;
}

export function randomGenome(rng = makeRng((Math.random() * 2 ** 32) >>> 0)) {
  const g = new Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) g[i] = Math.floor(rng() * 256);
  return g;
}

export function geneIndex(name) {
  return GENE_NAMES.indexOf(name);
}

export function getGene(genes, name) {
  return genes[geneIndex(name)];
}

// Normalized 0..1
export function gn(genes, name) {
  return genes[geneIndex(name)] / 255;
}

export function archetypeOf(genes) {
  return Math.min(3, Math.floor(getGene(genes, 'archetype') / 64));
}

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));

// Small random perturbation of a handful of genes. Archetype preserved.
export function mutateGenome(genes, rng) {
  const out = genes.slice();
  const n = rng.int(3, 6);
  const archIdx = geneIndex('archetype');
  for (let k = 0; k < n; k++) {
    let i = rng.int(0, GENE_COUNT - 1);
    if (i === archIdx) i = (i + 1) % GENE_COUNT;
    out[i] = clampByte(out[i] + rng.range(-46, 46));
  }
  return out;
}

// Crossover: per-gene pick from either parent, light mutation.
// Archetype is inherited from a parent (rare 4% sport mutation).
export function breedGenomes(a, b, rng) {
  const child = new Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) {
    child[i] = rng() < 0.5 ? a[i] : b[i];
    if (rng() < 0.16) child[i] = clampByte(child[i] + rng.range(-26, 26));
  }
  const archIdx = geneIndex('archetype');
  if (rng() < 0.04) {
    child[archIdx] = rng.int(0, 3) * 64 + 20;
  } else {
    child[archIdx] = rng() < 0.5 ? a[archIdx] : b[archIdx];
  }
  return child;
}

// ---------------------------------------------------------------------------
// Naming: a pseudo-Latin binomial derived from the genome.

const GENUS_A = ['Vel', 'Auri', 'Cala', 'Thal', 'Sil', 'Ombra', 'Peri', 'Luci',
  'Ferr', 'Myri', 'Nym', 'Vio', 'Cora', 'Alba', 'Ery', 'Sela', 'Ondu', 'Vesp',
  'Lumi', 'Bry', 'Hel', 'Zephy'];
const GENUS_B = ['dra', 'thys', 'mena', 'lora', 'phylla', 'cantha', 'rix',
  'gora', 'nella', 'spira', 'dora', 'mira', 'valis', 'thera', 'sella', 'padium'];

const EPITHET_GENERIC = ['communis', 'mirabilis', 'sylvestris', 'serena',
  'vulgaris', 'peregrina', 'modesta', 'insolita'];

export function makeName(genes) {
  const code = encodeGenome(genes);
  const rng = makeRng(hashString('name:' + code));
  const genus = rng.pick(GENUS_A) + rng.pick(GENUS_B);

  const arch = archetypeOf(genes);
  const candidates = [];
  const add = (w) => candidates.push(w);

  if (gn(genes, 'stiffness') < 0.3) add('tremula');
  if (gn(genes, 'stiffness') > 0.78) add('rigida');
  if (gn(genes, 'vigor') > 0.8) add('excelsa');
  if (gn(genes, 'vigor') < 0.2) add('minima');
  if (gn(genes, 'flowerAmount') > 0.72 && arch !== 2) add('multiflora');
  if (gn(genes, 'petalCount') > 0.8 && arch === 1) add('stellata');
  if (gn(genes, 'curvature') < 0.28) add('pendula');
  if (gn(genes, 'curvature') > 0.78) add('erecta');
  if (gn(genes, 'leafLight') < 0.3) add('obscura');
  if (gn(genes, 'leafLight') > 0.75) add('pallida');
  if (gn(genes, 'leafAspect') > 0.75) add('rotundifolia');
  if (gn(genes, 'leafAspect') < 0.22) add('angustifolia');
  if (gn(genes, 'leafHue') > 0.72) add('aurata');
  if (gn(genes, 'branchiness') > 0.75 && arch === 3) add('ramosa');
  if (arch === 0) add('plumosa');
  if (arch === 2) add('gracilis');

  const epithet = candidates.length
    ? candidates[Math.floor(rng() * candidates.length)]
    : rng.pick(EPITHET_GENERIC);

  return `${genus} ${epithet}`;
}

// Stable 4-digit accession number derived from the seed code.
export function accessionNumber(genes) {
  const code = encodeGenome(genes);
  return 1000 + (hashString('acc:' + code) % 9000);
}
