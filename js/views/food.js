// FOOD: daily log, quick log, photo AI, barcode, manual, My Meals (create/edit/delete/AI), shopping list.
import { S, day, save } from '../state.js';
import * as E from '../engine.js';
import { $, esc, uid, dkey, addDays, fmt, num, r1, pct, niceDate, timeStr, shrinkImage, blobToBase64 } from '../util.js';
import { reg, regChg, nav, rerender, go } from '../core.js';
import { notice, confirmBox, sheet, closeSheet, toast, busy } from '../ui.js';
import * as AI from '../ai.js';
import * as BC from '../barcode.js';

const TAGS = ['Breakfast', 'Pre-gym', 'Post-gym', 'Lunch', 'Dinner', 'Snack', 'Shake'];
const ICON = {
  photo: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  barcode: '<svg viewBox="0 0 24 24"><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

// ---------- Peanut / allergen check ----------
export function allergenHit(text) {
  const t = String(text || '').toLowerCase();
  return S.settings.allergens.find(a => a && t.includes(a.toLowerCase())) || null;
}
const mealText = m => [m.name, ...(m.ingredients || []).map(i => i.item)].join(' ');
const mealHasAllergen = m => m.peanut || allergenHit(mealText(m));

async function allergenGate(flag, name) {
  if (!flag) return true;
  const word = typeof flag === 'string' ? flag : 'peanut';
  return confirmBox('Allergen warning', `<b>${esc(name)}</b> may contain <b>${esc(word)}</b>.<br>Log it anyway?`, 'Log anyway', true);
}

// ---------- Logging ----------
export async function logEntry(entry, flag) {
  if (!(await allergenGate(flag, entry.name))) return false;
  const e = { id: uid(), t: Date.now(), name: entry.name, kcal: Math.round(num(entry.kcal)), p: r1(entry.p), c: r1(entry.c), f: r1(entry.f), src: entry.src || 'manual' };
  day().food.push(e);
  save(); E.sync(); rerender();
  toast(`Logged ${e.name} · ${e.kcal} kcal · ${e.p}g protein`);
  return true;
}

export async function logMeal(id, servings = 1) {
  const m = S.meals.find(x => x.id === id);
  if (!m) return;
  const s = num(servings) || 1;
  return logEntry({ name: s === 1 ? m.name : `${m.name} ×${r1(s)}`, kcal: m.kcal * s, p: m.p * s, c: m.c * s, f: m.f * s, src: 'meal' }, mealHasAllergen(m));
}

// ---------- Shared quick log panel (also on Quests tab) ----------
export function macroBars(k = dkey()) {
  const t = E.totals(k), T = S.settings.targets;
  const cell = (lbl, v, goal, unit) => `<div class="macro"><div class="mlbl">${lbl}</div><div class="bar"><i style="width:${pct(v, goal)}%"></i></div>
    <div class="mval">${unit === 'kcal' ? fmt(v) : r1(v)}<span>/${fmt(goal)}${unit === 'kcal' ? '' : 'g'}</span></div></div>`;
  return `<div class="macros">${cell('Kcal', t.kcal, T.kcal, 'kcal')}${cell('Protein', t.p, T.p)}${cell('Carbs', t.c, T.c)}${cell('Fat', t.f, T.f)}</div>`;
}

export function quickLogHTML() {
  const pinned = S.meals.filter(m => m.pinned);
  return `${macroBars()}
    <div class="chips">${pinned.length ? pinned.map(mealChip).join('') : `<div class="empty">Pin meals in Food → My Meals to log them in one tap.</div>`}</div>
    ${toolsRow()}`;
}
const mealChip = m => `<button class="chip" data-act="food.quick" data-id="${m.id}">
  <div><div class="t">${esc(m.name)}${mealHasAllergen(m) ? ' <span class="badge red">Peanut</span>' : ''}</div>
  <div class="m">${esc(m.tag)} · ${fmt(m.kcal)} kcal · ${r1(m.p)}P / ${r1(m.c)}C / ${r1(m.f)}F${m.estimate ? ' · <i>est.</i>' : ''}</div></div>
  <div class="add">+</div></button>`;
const toolsRow = () => `<div class="tools">
  <button class="btn ghost" data-act="food.photo">${ICON.photo}Photo</button>
  <button class="btn ghost" data-act="food.barcode">${ICON.barcode}Barcode</button>
  <button class="btn ghost" data-act="food.manual">${ICON.plus}Manual</button></div>`;

reg('food.quick', el => { closeSheet(); logMeal(el.dataset.id); });

// Big tap tiles: pinned meals + scan/manual (home screen + quick sheet)
export function quickTilesHTML() {
  const pinned = S.meals.filter(m => m.pinned);
  return `<div class="tiles">
    ${pinned.map(m => `<button class="tile" data-act="food.quick" data-id="${m.id}">
      <span class="tplus">+</span>
      <span class="tname">${esc(m.name)}</span>
      <span class="tmeta">${fmt(m.kcal)} kcal · ${r1(m.p)}g P${mealHasAllergen(m) ? ' · <b class="red">PB</b>' : ''}</span></button>`).join('')}
    <button class="tile tool" data-act="food.photo">${ICON.photo}<span class="tname">Scan plate</span></button>
    <button class="tile tool" data-act="food.barcode">${ICON.barcode}<span class="tname">Barcode</span></button>
    <button class="tile tool" data-act="food.manual">${ICON.plus}<span class="tname">Manual</span></button>
  </div>`;
}
reg('food.quicksheet', () => sheet('Log food', `${macroBars()}${quickTilesHTML()}
  <button class="btn ghost full mt" data-act="food.frommeals">All my meals…</button>`));

// ---------- View ----------
export function render() {
  const sub = nav.sub.food;
  const seg = `<div class="seg">
    ${[['today', 'Log'], ['meals', 'My Meals'], ['shop', 'Shopping']].map(([k, l]) =>
      `<button class="${sub === k ? 'on' : ''}" data-act="food.sub" data-k="${k}">${l}</button>`).join('')}</div>`;
  return `<div class="wrap">${seg}${sub === 'meals' ? mealsView() : sub === 'shop' ? shopView() : todayView()}</div>`;
}
reg('food.sub', el => { nav.sub.food = el.dataset.k; rerender(); window.scrollTo(0, 0); });

function todayView() {
  const today = dkey(), k = nav.foodDate || today, editable = k === today;
  const d = S.days[k] || { food: [], water: 0 }, t = E.totals(k), T = S.settings.targets;
  const kLeft = Math.max(0, T.kcal - t.kcal), pLeft = Math.max(0, T.p - t.p);
  const entries = [...(d.food || [])].sort((a, b) => a.t - b.t);
  return `
  <section class="panel">
    <div class="datenav">
      <button class="iconbtn" data-act="food.day" data-n="-1" aria-label="Previous day">‹</button>
      <div class="ptitle inline"><span>${esc(niceDate(k))}</span></div>
      <button class="iconbtn" data-act="food.day" data-n="1" ${editable ? 'disabled' : ''} aria-label="Next day">›</button>
    </div>
    <div class="bigline"><div><b>${fmt(t.kcal)}</b><span> / ${fmt(T.kcal)} kcal</span></div><div><b>${r1(t.p)}</b><span> / ${T.p} g protein</span></div></div>
    ${macroBars(k)}
    <div class="note">${kLeft || pLeft ? `${fmt(kLeft)} kcal and ${r1(pLeft)} g protein to go.` : 'Targets hit for the day.'}</div>
  </section>

  ${editable ? `<section class="panel">
    <div class="ptitle"><span>Add food</span></div>
    <div class="chips">${S.meals.filter(m => m.pinned).map(mealChip).join('')}</div>
    <button class="btn ghost full mt" data-act="food.frommeals">All my meals…</button>
    ${toolsRow()}
  </section>` : ''}

  <section class="panel">
    <div class="ptitle"><span>Logged</span></div>
    ${entries.length ? entries.map(e => `<div class="row">
      <div class="grow"><div class="rt">${esc(e.name)}</div><div class="rs">${timeStr(e.t)} · ${fmt(e.kcal)} kcal · ${r1(e.p)}P / ${r1(e.c)}C / ${r1(e.f)}F</div></div>
      ${editable ? `<button class="iconbtn red" data-act="food.del" data-id="${e.id}" aria-label="Remove">×</button>` : ''}</div>`).join('')
      : `<div class="empty">${editable ? 'Nothing logged yet today.' : 'Nothing was logged this day.'}</div>`}
    ${!editable ? `<div class="note">Past days are read-only. Penalties for them are already settled.</div>` : ''}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Water</span></div>
    <div class="bigline"><div><b>${fmt(d.water || 0)}</b><span> / ${T.waterOz} oz</span></div></div>
    <div class="bar"><i style="width:${pct(d.water || 0, T.waterOz)}%"></i></div>
    ${editable ? `<div class="btnrow mt">
      <button class="btn ghost" data-act="food.water" data-n="-8">−8</button>
      <button class="btn ghost" data-act="food.water" data-n="8">+8</button>
      <button class="btn ghost" data-act="food.water" data-n="16">+16</button>
      <button class="btn" data-act="food.water" data-n="32">+32 oz</button></div>` : ''}
  </section>`;
}

reg('food.day', el => {
  const today = dkey(), cur = nav.foodDate || today, next = addDays(cur, +el.dataset.n);
  nav.foodDate = next >= today ? null : next;
  rerender();
});
reg('food.del', async el => {
  const d = day(), e = d.food.find(x => x.id === el.dataset.id);
  if (!e || !(await confirmBox('Remove entry', `Remove <b>${esc(e.name)}</b> from today?`, 'Remove', true))) return;
  d.food = d.food.filter(x => x.id !== e.id);
  save(); E.sync(); rerender();
});
reg('food.water', el => { const d = day(); d.water = Math.max(0, (d.water || 0) + +el.dataset.n); save(); rerender(); });

reg('food.frommeals', () => {
  sheet('Log from my meals', `
    ${S.meals.length ? S.meals.map(m => `<div class="row">
      <div class="grow"><div class="rt">${esc(m.name)}</div><div class="rs">${fmt(m.kcal)} kcal · ${r1(m.p)}g P per serving</div></div>
      <input class="sm" type="number" inputmode="decimal" step="0.5" min="0.25" value="1" id="sv-${m.id}" aria-label="Servings">
      <button class="btn sm" data-act="food.logsv" data-id="${m.id}">Log</button></div>`).join('') : '<div class="empty">No meals saved yet.</div>'}`);
});
reg('food.logsv', async el => {
  const v = num($(`#sv-${el.dataset.id}`)?.value) || 1;
  closeSheet();
  await logMeal(el.dataset.id, v);
});

// ---------- Manual entry ----------
reg('food.manual', () => {
  sheet('Manual entry', `
    <label class="field"><span>Food</span><input id="mn-name" placeholder="e.g. Chipotle bowl"></label>
    <div class="grid4">
      <label class="field"><span>Kcal</span><input id="mn-k" type="number" inputmode="decimal"></label>
      <label class="field"><span>Protein g</span><input id="mn-p" type="number" inputmode="decimal"></label>
      <label class="field"><span>Carbs g</span><input id="mn-c" type="number" inputmode="decimal"></label>
      <label class="field"><span>Fat g</span><input id="mn-f" type="number" inputmode="decimal"></label>
    </div>
    <label class="check"><input type="checkbox" id="mn-save"> Also save to My Meals</label>
    <button class="btn full mt" data-act="food.manualgo">Log it</button>`);
});
reg('food.manualgo', async () => {
  const name = $('#mn-name').value.trim() || 'Food';
  const m = { name, kcal: num($('#mn-k').value), p: num($('#mn-p').value), c: num($('#mn-c').value), f: num($('#mn-f').value) };
  if (!m.kcal && !m.p) return toast('Enter at least calories or protein.');
  if ($('#mn-save').checked) S.meals.push({ id: uid(), ...m, tag: 'Snack', servings: 1, ingredients: [], pinned: false, estimate: false, prep: { on: false, batches: 1 } });
  closeSheet();
  await logEntry({ ...m, src: 'manual' }, allergenHit(name));
});

// ---------- Photo AI ----------
reg('food.photo', () => {
  if (!AI.hasKey()) return needKey();
  $('#photo-input').click();
});
function needKey() {
  notice({ title: 'Gemini key needed', html: `<div class="msg sm">Photo scan and the AI meal builder use Google’s free Gemini tier. Add your key in <b>Status → Settings</b>. It takes about two minutes, and SETUP.md has the steps.</div>`,
    btn: 'Open settings', cancel: 'Later', onOk: () => go('settings') });
}

export async function onPhoto(file) {
  if (!file) return;
  sheet('Photo scan', busy('Reading your plate…'));
  let res;
  try {
    const blob = await shrinkImage(file, 1024);
    res = await AI.analyzePhoto(await blobToBase64(blob));
  } catch (e) {
    sheet('Photo scan', `<div class="msg sm">${esc(e.message)}</div><button class="btn full mt" data-act="food.manual">Log manually instead</button>`);
    return;
  }
  const match = res.matchMealId && S.meals.find(m => m.id === res.matchMealId);
  const items = res.items || [];
  const peanut = res.containsPeanut || items.some(i => allergenHit(i.name));
  sheet('Photo scan', `
    ${peanut ? `<div class="alert">Possible <b>peanut</b> detected. Check before eating.</div>` : ''}
    ${match ? `<div class="matchcard"><div>Looks like your <b>${esc(match.name)}</b>.</div>
      <button class="btn sm" data-act="food.photomatch" data-id="${match.id}">Use saved macros</button></div>` : ''}
    <div class="sub">Estimates · confidence ${esc(res.confidence || 'low')} · edit anything before logging</div>
    <div id="ph-items">${items.map((it, i) => `
      <div class="phitem">
        <label class="check"><input type="checkbox" checked data-i="${i}" class="ph-on"> <input class="ph-name" data-i="${i}" value="${esc(it.name)}"></label>
        <div class="rs">${esc(it.portion || '')}</div>
        <div class="grid4">
          ${[['kcal', 'Kcal'], ['protein', 'P'], ['carbs', 'C'], ['fat', 'F']].map(([f, l]) =>
            `<label class="field"><span>${l}</span><input type="number" inputmode="decimal" class="ph-${f}" data-i="${i}" value="${Math.round(num(it[f]))}"></label>`).join('')}
        </div></div>`).join('') || '<div class="empty">No food recognized. Try a closer, brighter photo.</div>'}
    </div>
    ${res.note ? `<div class="note">${esc(res.note)}</div>` : ''}
    ${items.length ? `<button class="btn full mt" data-act="food.photolog" data-peanut="${peanut ? 1 : ''}">Log selected</button>` : ''}`);
}
reg('food.photomatch', async el => { closeSheet(); await logMeal(el.dataset.id); });
reg('food.photolog', async el => {
  const card = $('#ph-items'), rows = [];
  card.querySelectorAll('.ph-on').forEach(cb => {
    if (!cb.checked) return;
    const i = cb.dataset.i, v = cls => num(card.querySelector(`.ph-${cls}[data-i="${i}"]`).value);
    rows.push({ name: card.querySelector(`.ph-name[data-i="${i}"]`).value || 'Food', kcal: v('kcal'), p: v('protein'), c: v('carbs'), f: v('fat') });
  });
  if (!rows.length) return toast('Nothing selected.');
  const sum = rows.reduce((a, r) => ({ kcal: a.kcal + r.kcal, p: a.p + r.p, c: a.c + r.c, f: a.f + r.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  const name = rows.length === 1 ? rows[0].name : rows.map(r => r.name).join(' + ');
  closeSheet();
  await logEntry({ name: name.slice(0, 60), ...sum, src: 'photo' }, el.dataset.peanut ? 'peanut' : null);
});

// ---------- Barcode ----------
let stopScan = null;
reg('food.barcode', () => {
  const live = BC.canScan();
  sheet('Scan barcode', `
    ${live ? `<div class="scanbox"><video id="bc-video" playsinline muted></video><div class="scanline"></div></div>
      <div class="note">Point the camera at the barcode.</div>` : `<div class="note">Live scanning isn’t available in this browser. Type the number under the barcode.</div>`}
    <div class="inline mt"><input id="bc-code" inputmode="numeric" placeholder="Barcode number"><button class="btn" data-act="food.bclookup">Look up</button></div>
    <div id="bc-result"></div>`, {
    onMount: async () => {
      if (!live) return;
      try { stopScan = await BC.startScan($('#bc-video'), code => { $('#bc-code').value = code; bcLookup(code); }); }
      catch { $('.scanbox')?.insertAdjacentHTML('afterend', '<div class="alert">Camera blocked. Allow camera access, or type the number.</div>'); }
    },
    onClose: () => { stopScan?.(); stopScan = null; },
  });
});
reg('food.bclookup', () => { const c = $('#bc-code').value.trim(); if (c) { stopScan?.(); bcLookup(c); } });

let product = null;
async function bcLookup(code) {
  const out = $('#bc-result');
  if (!out) return;
  out.innerHTML = busy('Looking it up…');
  try { product = await BC.lookup(code); }
  catch (e) { out.innerHTML = `<div class="alert">${esc(e.message)}</div>`; return; }
  if (!product || (!product.per100 && !product.perServing)) {
    out.innerHTML = `<div class="alert">Not found in Open Food Facts${product ? ' (no nutrition data)' : ''}. Use manual entry.</div>
      <button class="btn ghost full mt" data-act="food.manual">Manual entry</button>`;
    return;
  }
  const useServ = !!product.perServing;
  const wasPeanut = product.peanut || allergenHit(product.name);
  out.innerHTML = `
    ${wasPeanut ? `<div class="alert">This product lists <b>peanut</b> (or traces).</div>` : ''}
    <div class="rt mt">${esc(product.name)}</div><div class="rs">${esc(product.brand)}${product.servingSize ? ` · serving ${esc(product.servingSize)}` : ''}</div>
    <div class="inline mt">
      <label class="field grow"><span>${useServ ? 'Servings' : 'Grams'}</span>
        <input id="bc-amt" type="number" inputmode="decimal" value="${useServ ? 1 : product.servingG || 100}" step="${useServ ? 0.5 : 5}"></label>
    </div>
    <div class="bcmacro" id="bc-macro"></div>
    <div class="btnrow mt"><button class="btn ghost" data-act="food.bcsave">Save as meal</button><button class="btn" data-act="food.bclog">Log</button></div>`;
  const upd = () => { const m = bcMacros(); $('#bc-macro').textContent = `${fmt(m.kcal)} kcal · ${r1(m.p)}P / ${r1(m.c)}C / ${r1(m.f)}F`; };
  $('#bc-amt').oninput = upd; upd();
}
function bcMacros() {
  const amt = num($('#bc-amt')?.value);
  const base = product.perServing || product.per100, factor = product.perServing ? amt : amt / 100;
  return { kcal: base.kcal * factor, p: base.p * factor, c: base.c * factor, f: base.f * factor };
}
const bcName = () => { const amt = num($('#bc-amt').value); return `${product.name}${product.perServing ? (amt !== 1 ? ` ×${r1(amt)}` : '') : ` (${r1(amt)} g)`}`; };
reg('food.bclog', async () => {
  const m = bcMacros(), name = bcName(), flag = product.peanut ? 'peanut' : allergenHit(product.name);
  closeSheet();
  await logEntry({ name, ...m, src: 'barcode' }, flag);
});
reg('food.bcsave', () => {
  const m = bcMacros();
  S.meals.push({ id: uid(), name: bcName(), tag: 'Snack', kcal: Math.round(m.kcal), p: r1(m.p), c: r1(m.c), f: r1(m.f), servings: 1,
    ingredients: [{ item: product.name, qty: 1, unit: '' }], pinned: false, estimate: false, peanut: product.peanut, prep: { on: false, batches: 1 } });
  save(); toast('Saved to My Meals');
});

// ---------- My Meals ----------
function mealsView() {
  return `
  <section class="panel">
    <div class="btnrow"><button class="btn ghost" data-act="food.newmeal">+ New meal</button><button class="btn" data-act="food.aimeal">Build with AI</button></div>
    <div class="note">Pinned meals show up in Quick Log for one-tap logging. Macros are per serving.</div>
  </section>
  <section class="panel">
    <div class="ptitle"><span>My meals</span></div>
    ${S.meals.length ? S.meals.map(m => `<div class="mealrow">
      <div class="grow">
        <div class="rt">${esc(m.name)} ${m.estimate ? '<span class="badge">Estimate</span>' : ''} ${mealHasAllergen(m) ? '<span class="badge red">Peanut</span>' : ''}</div>
        <div class="rs">${esc(m.tag)} · ${fmt(m.kcal)} kcal · ${r1(m.p)}P / ${r1(m.c)}C / ${r1(m.f)}F${m.servings > 1 ? ` · batch makes ${m.servings}` : ''}</div>
      </div>
      <div class="mealacts">
        <button class="iconbtn ${m.pinned ? 'gold' : ''}" data-act="food.pin" data-id="${m.id}" aria-label="Pin">${m.pinned ? '★' : '☆'}</button>
        <button class="iconbtn" data-act="food.editmeal" data-id="${m.id}" aria-label="Edit">✎</button>
        <button class="iconbtn" data-act="food.dupmeal" data-id="${m.id}" aria-label="Duplicate">⧉</button>
        <button class="iconbtn red" data-act="food.delmeal" data-id="${m.id}" aria-label="Delete">×</button>
      </div></div>`).join('') : '<div class="empty">No meals yet.</div>'}
  </section>`;
}
reg('food.pin', el => { const m = S.meals.find(x => x.id === el.dataset.id); m.pinned = !m.pinned; save(); rerender(); });
reg('food.dupmeal', el => {
  const m = S.meals.find(x => x.id === el.dataset.id);
  S.meals.splice(S.meals.indexOf(m) + 1, 0, { ...JSON.parse(JSON.stringify(m)), id: uid(), name: m.name + ' (copy)', pinned: false });
  save(); rerender();
});
reg('food.delmeal', async el => {
  const m = S.meals.find(x => x.id === el.dataset.id);
  if (!(await confirmBox('Delete meal', `Delete <b>${esc(m.name)}</b>? Past log entries stay.`, 'Delete', true))) return;
  S.meals = S.meals.filter(x => x.id !== m.id);
  save(); rerender();
});
reg('food.newmeal', () => mealEditor(null));
reg('food.editmeal', el => mealEditor(S.meals.find(x => x.id === el.dataset.id)));

function ingRow(i = {}) {
  return `<div class="ingrow"><input class="ig-item" placeholder="Ingredient" value="${esc(i.item || '')}">
    <input class="ig-qty" type="number" inputmode="decimal" placeholder="Qty" value="${i.qty ?? ''}">
    <input class="ig-unit" placeholder="Unit" value="${esc(i.unit || '')}">
    <button class="iconbtn red ig-del" type="button" aria-label="Remove">×</button></div>`;
}

function mealEditor(meal, fromAI = null) {
  const m = meal || fromAI || { name: '', tag: 'Lunch', kcal: '', p: '', c: '', f: '', servings: 1, ingredients: [], pinned: true };
  const editing = !!meal;
  sheet(editing ? 'Edit meal' : fromAI ? 'Review AI meal' : 'New meal', `
    ${fromAI?.note ? `<div class="note">AI note: ${esc(fromAI.note)}</div>` : ''}
    ${fromAI?.peanut ? `<div class="alert">The AI flagged <b>peanut</b> in this recipe.</div>` : ''}
    <label class="field"><span>Name</span><input id="me-name" value="${esc(m.name)}"></label>
    <div class="grid2">
      <label class="field"><span>Type</span><select id="me-tag">${TAGS.map(t => `<option ${t === m.tag ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Batch makes (servings)</span><input id="me-serv" type="number" inputmode="numeric" min="1" value="${m.servings || 1}"></label>
    </div>
    ${editing ? `<label class="check"><input type="checkbox" id="me-scale" checked> If I change the batch size, recalculate per-serving macros</label>` : ''}
    <div class="sub mt">Per serving</div>
    <div class="grid4">
      <label class="field"><span>Kcal</span><input id="me-k" type="number" inputmode="decimal" value="${m.kcal}"></label>
      <label class="field"><span>Protein</span><input id="me-p" type="number" inputmode="decimal" value="${m.p}"></label>
      <label class="field"><span>Carbs</span><input id="me-c" type="number" inputmode="decimal" value="${m.c}"></label>
      <label class="field"><span>Fat</span><input id="me-f" type="number" inputmode="decimal" value="${m.f}"></label>
    </div>
    <div class="sub mt">Ingredients for the whole batch (used for the shopping list)</div>
    <div id="me-ings">${(m.ingredients || []).map(ingRow).join('')}</div>
    <button class="btn ghost sm mt" id="me-addig" type="button">+ Ingredient</button>
    <label class="check"><input type="checkbox" id="me-pin" ${m.pinned ? 'checked' : ''}> Pin to Quick Log</label>
    <button class="btn full mt" id="me-save">${editing ? 'Save changes' : 'Save meal'}</button>`, {
    onMount: card => {
      const box = card.querySelector('#me-ings');
      card.querySelector('#me-addig').onclick = () => box.insertAdjacentHTML('beforeend', ingRow());
      box.onclick = e => { if (e.target.classList.contains('ig-del')) e.target.closest('.ingrow').remove(); };
      card.querySelector('#me-save').onclick = () => {
        const name = card.querySelector('#me-name').value.trim();
        if (!name) return toast('Give the meal a name.');
        const servings = Math.max(1, Math.round(num(card.querySelector('#me-serv').value)) || 1);
        let k = num(card.querySelector('#me-k').value), p = num(card.querySelector('#me-p').value),
          c = num(card.querySelector('#me-c').value), f = num(card.querySelector('#me-f').value);
        if (editing && card.querySelector('#me-scale')?.checked && meal.servings && servings !== meal.servings
            && k === meal.kcal && p === meal.p && c === meal.c && f === meal.f) {
          const fac = meal.servings / servings; k *= fac; p *= fac; c *= fac; f *= fac;
        }
        const ingredients = [...box.querySelectorAll('.ingrow')].map(r => ({
          item: r.querySelector('.ig-item').value.trim(), qty: num(r.querySelector('.ig-qty').value), unit: r.querySelector('.ig-unit').value.trim(),
        })).filter(i => i.item);
        const data = { name, tag: card.querySelector('#me-tag').value, servings, kcal: Math.round(k), p: r1(p), c: r1(c), f: r1(f), ingredients,
          pinned: card.querySelector('#me-pin').checked, estimate: !!fromAI, peanut: !!fromAI?.peanut };
        if (editing) Object.assign(meal, data, { estimate: false, peanut: meal.peanut && data.peanut });
        else S.meals.push({ id: uid(), prep: { on: false, batches: 1 }, ...data });
        save(); closeSheet(); rerender();
        toast(editing ? 'Meal updated' : 'Meal saved');
      };
    },
  });
}

reg('food.aimeal', () => {
  if (!AI.hasKey()) return needKey();
  sheet('Build a meal with AI', `
    <div class="note">Describe the recipe with amounts and how many servings it makes. You’ll review everything before it’s saved.</div>
    <textarea id="ai-desc" rows="5" placeholder="Crockpot chicken pot pie: 3 lb chicken breast, 2 cans cream of chicken, 1 cup chicken broth, 1 cup cottage cheese, 8 oz cream cheese, 1 bag frozen mixed veg. Makes 6."></textarea>
    <button class="btn full mt" data-act="food.aigo">Calculate macros</button>`);
});
reg('food.aigo', async () => {
  const desc = $('#ai-desc').value.trim();
  if (desc.length < 8) return toast('Describe the recipe first.');
  sheet('Build a meal with AI', busy('Calculating macros…'));
  try {
    const r = await AI.buildMeal(desc);
    mealEditor(null, {
      name: r.name, tag: TAGS.includes(r.tag) ? r.tag : 'Lunch', servings: r.servings || 1,
      kcal: Math.round(r.perServing.kcal), p: r1(r.perServing.protein), c: r1(r.perServing.carbs), f: r1(r.perServing.fat),
      ingredients: r.ingredients || [], pinned: true, note: r.note, peanut: r.containsPeanut || allergenHit(desc),
    });
  } catch (e) {
    sheet('Build a meal with AI', `<div class="alert">${esc(e.message)}</div><button class="btn ghost full mt" data-act="food.newmeal">Enter it manually</button>`);
  }
});

// ---------- Shopping list ----------
function shoppingItems() {
  const map = new Map();
  S.meals.filter(m => m.prep?.on).forEach(m => {
    (m.ingredients || []).forEach(i => {
      const key = `${i.item.toLowerCase().trim()}|${(i.unit || '').toLowerCase().trim()}`;
      const cur = map.get(key) || { key, item: i.item, unit: i.unit || '', qty: 0, from: new Set() };
      cur.qty += num(i.qty) * (m.prep.batches || 1);
      cur.from.add(m.name);
      map.set(key, cur);
    });
  });
  return [...map.values()].sort((a, b) => a.item.localeCompare(b.item));
}
const qtyStr = i => i.qty ? (i.unit ? `${r1(i.qty)} ${i.unit}` : `×${r1(i.qty)}`) : '';

function shopView() {
  const items = shoppingItems(), ch = S.shopping.checked;
  return `
  <section class="panel">
    <div class="ptitle"><span>This week’s prep</span></div>
    <div class="note">Turn on what you’re making this week. Batches = how many times you make the recipe (e.g. eggs every weekday = 5).</div>
    ${S.meals.map(m => `<div class="row">
      <label class="check grow"><input type="checkbox" data-chg="food.prepon" data-id="${m.id}" ${m.prep?.on ? 'checked' : ''}> ${esc(m.name)}</label>
      <div class="stepper ${m.prep?.on ? '' : 'dim'}">
        <button class="iconbtn" data-act="food.batch" data-id="${m.id}" data-n="-1">−</button><b>${m.prep?.batches || 1}</b>
        <button class="iconbtn" data-act="food.batch" data-id="${m.id}" data-n="1">+</button></div></div>`).join('')}
  </section>
  <section class="panel">
    <div class="ptitle"><span>Shopping list</span></div>
    ${items.length ? items.map(i => `<label class="row check ${ch[i.key] ? 'struck' : ''}">
      <input type="checkbox" data-chg="food.shopcheck" data-key="${esc(i.key)}" ${ch[i.key] ? 'checked' : ''}>
      <span class="grow">${esc(i.item)}</span><span class="rs">${esc(qtyStr(i))}</span></label>`).join('')
      : '<div class="empty">Nothing yet. Turn on meals above that have ingredients.</div>'}
    <div class="sub mt">Extras</div>
    ${S.shopping.extras.map(x => `<div class="row ${x.checked ? 'struck' : ''}">
      <label class="check grow"><input type="checkbox" data-chg="food.extracheck" data-id="${x.id}" ${x.checked ? 'checked' : ''}> ${esc(x.item)}</label>
      <button class="iconbtn red" data-act="food.extradel" data-id="${x.id}">×</button></div>`).join('')}
    <div class="inline mt"><input id="shop-extra" placeholder="Add an item (protein powder, creatine…)"><button class="btn" data-act="food.extraadd">Add</button></div>
    <div class="btnrow mt"><button class="btn ghost" data-act="food.shopreset">New week (uncheck all)</button></div>
  </section>`;
}
regChg('food.prepon', el => { const m = S.meals.find(x => x.id === el.dataset.id); m.prep = { batches: 1, ...(m.prep || {}), on: el.checked }; save(); rerender(); });
reg('food.batch', el => { const m = S.meals.find(x => x.id === el.dataset.id); m.prep = m.prep || { on: true, batches: 1 }; m.prep.batches = Math.max(1, (m.prep.batches || 1) + +el.dataset.n); save(); rerender(); });
regChg('food.shopcheck', el => { S.shopping.checked[el.dataset.key] = el.checked; save(); rerender(); });
regChg('food.extracheck', el => { const x = S.shopping.extras.find(e => e.id === el.dataset.id); x.checked = el.checked; save(); rerender(); });
reg('food.extraadd', () => { const v = $('#shop-extra').value.trim(); if (!v) return; S.shopping.extras.push({ id: uid(), item: v, checked: false }); save(); rerender(); });
reg('food.extradel', el => { S.shopping.extras = S.shopping.extras.filter(x => x.id !== el.dataset.id); save(); rerender(); });
reg('food.shopreset', () => { S.shopping.checked = {}; S.shopping.extras.forEach(x => (x.checked = false)); save(); rerender(); toast('List reset for the new week'); });
