// DOM layer: toasts, specimen panel, greenhouse overlay + storage.

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Toasts

let toastTimer = null;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------------------------------------------------------------------------
// Specimen panel

export function updateSpecimenPanel(plant) {
  const name = $('#specimen-name');
  name.classList.remove('swap');
  void name.offsetWidth; // restart animation
  name.textContent = plant.name;
  name.classList.add('swap');

  $('#specimen-meta').textContent = `No. ${plant.num} \u00B7 ${plant.archName}`;
  $('#seed-code').textContent = plant.code;
  $('#caption').innerHTML =
    `<span class="cap-num">No. ${plant.num}</span><span class="cap-name">${plant.name}</span>`;
}

export function setCopyFeedback() {
  const btn = $('#copy-code');
  btn.classList.add('done');
  setTimeout(() => btn.classList.remove('done'), 1400);
}

// ---------------------------------------------------------------------------
// Greenhouse store

const KEY = 'sylva.greenhouse.v1';
export const CAPACITY = 48;

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveStore(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch {
    toast('Could not save — browser storage is unavailable or full');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Greenhouse overlay

export function initGreenhouse(hooks) {
  const overlay = $('#greenhouse');
  const grid = $('#gh-grid');
  const emptyEl = $('#gh-empty');
  const crossBtn = $('#gh-cross');
  const germBtn = $('#gh-germinate');
  const hint = $('#gh-hint');

  let selecting = false;
  let picked = []; // codes in pick order

  const setCount = () => {
    const n = loadStore().length;
    $('#gh-count').textContent = n;
    $('#gh-title-count').textContent = n ? `${n} specimen${n === 1 ? '' : 's'}` : '';
  };

  function render() {
    const items = loadStore();
    grid.innerHTML = '';
    emptyEl.hidden = items.length > 0;
    crossBtn.disabled = items.length < 2;

    items.forEach((it, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'gh-card';
      card.style.animationDelay = `${Math.min(idx, 14) * 24}ms`;
      card.dataset.code = it.code;
      const pickIdx = picked.indexOf(it.code);
      if (pickIdx >= 0) {
        card.classList.add('picked');
        card.dataset.parent = pickIdx === 0 ? 'A' : 'B';
      }
      card.innerHTML = `
        <span class="gh-thumb"><img alt="" src="${it.thumb}"></span>
        <span class="gh-name">${it.name}</span>
        <span class="gh-meta">No. ${it.num}</span>
        <span class="gh-del" role="button" aria-label="Compost specimen" title="Compost specimen">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.gh-del')) {
          const rest = loadStore().filter((x) => x.code !== it.code);
          saveStore(rest);
          picked = picked.filter((c) => c !== it.code);
          render();
          toast('Specimen composted');
          return;
        }
        if (selecting) {
          const i = picked.indexOf(it.code);
          if (i >= 0) picked.splice(i, 1);
          else if (picked.length < 2) picked.push(it.code);
          render();
        } else {
          hooks.onLoadCode(it.code);
          api.close();
        }
      });
      grid.appendChild(card);
    });

    germBtn.hidden = !selecting;
    germBtn.disabled = picked.length !== 2;
    hint.textContent = selecting
      ? (picked.length === 2
        ? 'Two parents chosen — germinate the cross.'
        : 'Choose two specimens to cross-pollinate.')
      : 'Select a specimen to grow it, or cross-pollinate two.';
    crossBtn.classList.toggle('active', selecting);
    crossBtn.textContent = selecting ? 'Cancel cross' : 'Cross-pollinate';
    setCount();
  }

  crossBtn.addEventListener('click', () => {
    selecting = !selecting;
    picked = [];
    render();
  });

  germBtn.addEventListener('click', () => {
    if (picked.length !== 2) return;
    const [a, b] = picked;
    selecting = false;
    picked = [];
    api.close();
    hooks.onGerminate(a, b);
  });

  $('#gh-close').addEventListener('click', () => api.close());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) api.close();
  });

  const api = {
    open() {
      selecting = false;
      picked = [];
      render();
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add('open'));
    },
    close() {
      overlay.classList.remove('open');
      setTimeout(() => { overlay.hidden = true; }, 260);
    },
    isOpen: () => !overlay.hidden,
    toggle() { overlay.hidden ? api.open() : api.close(); },
    refreshCount: setCount,
  };

  setCount();
  return api;
}
