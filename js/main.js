import { makeRng } from './rng.js';
import { randomGenome, decodeGenome, mutateGenome, breedGenomes } from './genome.js';
import { buildPlant } from './plant.js';
import { Stage, renderThumbnail } from './render.js';
import {
  toast, updateSpecimenPanel, setCopyFeedback,
  loadStore, saveStore, CAPACITY, initGreenhouse,
} from './ui.js';

const $ = (sel) => document.querySelector(sel);
const freshRng = () => makeRng((Math.random() * 2 ** 32) >>> 0);

// ---------------------------------------------------------------------------
// Paper grain overlay (generated once, applied via CSS background)

(function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const img = g.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.random() * 20;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 26;
  }
  g.putImageData(img, 0, 0);
  $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

// ---------------------------------------------------------------------------
// State

const stage = new Stage($('#stage-canvas'));
const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
stage.reduced = reducedMq.matches;
reducedMq.addEventListener?.('change', (e) => {
  stage.reduced = e.matches;
  stage.seedParticles();
});

let plant = null;

function adopt(genes, { grow = true, silent = false, note = null } = {}) {
  plant = buildPlant(genes);
  stage.setPlant(plant, { grow });
  updateSpecimenPanel(plant);
  try {
    history.replaceState(null, '', `?seed=${plant.code}`);
  } catch { /* no-op in sandboxed contexts */ }
  if (note && !silent) toast(note);
  return plant;
}

function sow() { adopt(randomGenome(freshRng())); }

// ---------------------------------------------------------------------------
// Greenhouse

const greenhouse = initGreenhouse({
  onLoadCode(code) {
    const genes = decodeGenome(code);
    if (genes) adopt(genes);
  },
  onGerminate(codeA, codeB) {
    const a = decodeGenome(codeA);
    const b = decodeGenome(codeB);
    if (!a || !b) return;
    adopt(breedGenomes(a, b, freshRng()), { note: 'Hybrid germinated' });
  },
});

function press() {
  if (!plant) return;
  const items = loadStore();
  if (items.some((x) => x.code === plant.code)) {
    toast('This specimen is already pressed');
    return;
  }
  if (items.length >= CAPACITY) {
    toast('The greenhouse is full — compost a specimen first');
    return;
  }
  items.unshift({
    code: plant.code,
    name: plant.name,
    num: plant.num,
    thumb: renderThumbnail(plant),
    at: Date.now(),
  });
  if (saveStore(items)) {
    greenhouse.refreshCount();
    toast('Specimen pressed into the greenhouse');
  }
}

// ---------------------------------------------------------------------------
// Controls

$('#btn-sow').addEventListener('click', sow);
$('#btn-regrow').addEventListener('click', () => stage.regrow());
$('#btn-mutate').addEventListener('click', () => {
  if (!plant) return;
  adopt(mutateGenome(plant.genes, freshRng()));
});
$('#btn-press').addEventListener('click', press);
$('#btn-greenhouse').addEventListener('click', () => greenhouse.toggle());

$('#copy-code').addEventListener('click', async () => {
  if (!plant) return;
  try {
    await navigator.clipboard.writeText(plant.code);
    setCopyFeedback();
    toast('Seed code copied');
  } catch {
    toast('Copy failed — select the code manually');
  }
});

const seedInput = $('#seed-input');
function growFromInput() {
  const genes = decodeGenome(seedInput.value);
  if (!genes) {
    toast('Invalid seed code — check for missing characters');
    seedInput.classList.add('invalid');
    setTimeout(() => seedInput.classList.remove('invalid'), 900);
    return;
  }
  seedInput.value = '';
  adopt(genes);
}
$('#btn-grow-seed').addEventListener('click', growFromInput);
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') growFromInput();
});

// Environment
document.querySelectorAll('#env-picker button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#env-picker button').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    stage.setEnv(btn.dataset.env);
    document.body.dataset.env = btn.dataset.env;
  });
});

const windSlider = $('#wind');
windSlider.addEventListener('input', () => {
  stage.wind = windSlider.value / 100;
});
stage.wind = windSlider.value / 100;

// Keyboard
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' && greenhouse.isOpen()) { greenhouse.close(); return; }
  if (k === 'n') sow();
  else if (k === 'r') stage.regrow();
  else if (k === 'm') $('#btn-mutate').click();
  else if (k === 's') press();
  else if (k === 'g') greenhouse.toggle();
});

// ---------------------------------------------------------------------------
// Boot

window.addEventListener('resize', () => stage.resize());

const urlSeed = new URLSearchParams(location.search).get('seed');
const urlGenes = urlSeed ? decodeGenome(urlSeed) : null;
if (urlGenes) adopt(urlGenes);
else {
  sow();
  if (urlSeed) toast('That seed code did not take — sowing a fresh one');
}

function loop(now) {
  stage.render(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Debug / test hooks
window.__sylva = {
  load: (code) => { const g = decodeGenome(code); if (g) adopt(g); return !!g; },
  sow,
  finish: () => stage.finishGrowth(),
  setEnv: (n) => { stage.setEnv(n); document.body.dataset.env = n; },
  code: () => plant?.code,
  stats: () => plant?.stats,
};
