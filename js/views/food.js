// FOOD: daily log, quick log, photo AI, barcode, manual, My Meals (create/edit/delete/AI), shopping list.
import { S, day, save } from '../state.js';
import * as E from '../engine.js';
import { $, esc, uid, dkey, addDays, fmt, num, r1, pct, niceDate, timeStr, shrinkImage, blobToBase64 } from '../util.js';
import { reg, regChg, nav, rerender, go, ACT } from '../core.js';
import { notice, confirmBox, sheet, closeSheet, toast, busy } from '../ui.js';
import * as AI from '../ai.js';
import * as BC from '../barcode.js';
import { takePhoto } from '../camera.js';
import * as H from '../data/health-data.js';
import * as Body from './body.js';
import { waterPanel } from '../water.js';

// Which meal slot an entry belongs to (pre/post-workout are judged against your training time)
export function guessMeal(d = new Date()) {
  const [th, tm] = String(S.health?.profile?.trainAt || '07:00').split(':').map(Number);
  const now = d.getHours() * 60 + d.getMinutes(), train = th * 60 + (tm || 0);
  if (now >= train - 120 && now < train) return 'pre';
  if (now >= train && now < train + 150) return 'post';
  const h = d.getHours();
  return h < 10 ? 'b' : h < 15 ? 'l' : h < 20 ? 'd' : 's';
}
const slotOf = e => e.meal || guessMeal(new Date(e.t));
const slotName = k => (H.MEAL_SLOTS.find(m => m[0] === k) || [, 'Other'])[1];

const TAGS = ['Breakfast', 'Pre-gym', 'Post-gym', 'Lunch', 'Dinner', 'Snack', 'Shake'];
const ICON = {
  photo: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  barcode: '<svg viewBox="0 0 24 24"><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
};

// ---------- Peanut / allergen check ----------
export function allergenHit(text) {
  const t = String(text || '').toLowerCase();
  return S.settings.allergens.find(a => a && t.includes(a.toLowerCase())) || null;
}
const mealText = m => [m.name, ...(m.ingredients || []).map(i => i.item)].join(' ');
const mealHasAllergen = m => (m.peanut && peanutOn()) || allergenHit(mealText(m));

const peanutOn = () => S.settings.allergens.some(a => /peanut/i.test(a));
async function allergenGate(flag, name) {
  if (flag === 'peanut' || flag === true) flag = peanutOn() ? 'peanut' : null;
  if (!flag) return true;
  const word = typeof flag === 'string' ? flag : 'peanut';
  return confirmBox('Allergen warning', `<b>${esc(name)}</b> may contain <b>${esc(word)}</b>.<br>Log it anyway?`, 'Log anyway', true);
}

// ---------- Logging ----------
// Every entry keeps its per-unit "base" macros and an amount, so it can be resized later.
// mode 'serving': amount = servings (or portions); mode 'gram': amount = grams, base is per 100 g.
export async function logEntry(entry, flag) {
  if (!(await allergenGate(flag, entry.name))) return false;
  const mode = entry.mode || 'serving';
  const amount = num(entry.amount) || (mode === 'gram' ? 100 : 1);
  const base = entry.base || { kcal: num(entry.kcal), p: num(entry.p), c: num(entry.c), f: num(entry.f) };
  const e = { id: uid(), t: Date.now(), name: entry.name, src: entry.src || 'manual', mode, amount, base,
    container: entry.container || null, servingG: entry.servingG || null,
    meal: (nav.foodMeal && Date.now() - nav.foodMeal.t < 600000 ? nav.foodMeal.m : null) || entry.meal || guessMeal() };
  nav.foodMeal = null;
  applyAmount(e);
  day().food.push(e);
  save(); E.sync(); rerender();
  toast(`Logged ${e.name}${amountLabel(e) ? ' ' + amountLabel(e) : ''} · ${e.kcal} kcal`, { label: 'Change amount', run: () => amountSheet(e.id) });
  return true;
}

function factorOf(e) { return e.mode === 'gram' ? e.amount / 100 : e.amount; }
function applyAmount(e) {
  const k = factorOf(e);
  e.kcal = Math.round(e.base.kcal * k); e.p = r1(e.base.p * k); e.c = r1(e.base.c * k); e.f = r1(e.base.f * k);
}
const frac = n => ({ 0.25: '¼', 0.5: '½', 0.75: '¾', 1.5: '1½', 2.5: '2½' }[n] || String(r1(n)));
export function amountLabel(e) {
  if (!e.base) return '';
  if (e.mode === 'gram') return e.container && Math.abs(e.amount - e.container) < 0.5 ? '· whole container' : `· ${Math.round(e.amount)} g`;
  if (e.container && Math.abs(e.amount - e.container) < 0.01) return '· whole container';
  return e.amount === 1 ? '' : `×${frac(e.amount)}`;
}

// Amount picker: quick chips + whole container + custom
export function amountSheet(id) {
  const e = day().food.find(x => x.id === id);
  if (!e) return;
  if (!e.base) { e.base = { kcal: e.kcal, p: e.p, c: e.c, f: e.f }; e.mode = 'serving'; e.amount = 1; }
  const gram = e.mode === 'gram';
  const chips = gram
    ? [...new Set([50, 100, 150, 200, e.servingG].filter(Boolean).map(Math.round))].map(g => [g, `${g} g`])
    : [[0.25, '¼'], [0.5, '½'], [1, '1'], [1.5, '1½'], [2, '2'], [3, '3']];
  if (e.container) chips.push([e.container, 'Whole container']);
  sheet('How much?', `
    <div class="rt">${esc(e.name)}</div>
    <div class="rs">${gram ? 'Per 100 g' : e.src === 'meal' || e.src === 'barcode' ? 'Per serving' : 'Per portion'}: ${fmt(e.base.kcal)} kcal · ${r1(e.base.p)}g P</div>
    <div class="amtchips">${chips.map(([v, l]) => `<button class="amtchip${Math.abs(v - e.amount) < 0.01 ? ' on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
    <label class="field"><span>${gram ? 'Grams' : 'Servings'} (exact)</span>
      <input id="amt-in" type="number" inputmode="decimal" step="${gram ? 5 : 0.25}" value="${r1(e.amount)}"></label>
    ${!e.container ? `<label class="field"><span>${gram ? 'Grams' : 'Servings'} in a whole container (optional, remembered)</span>
      <input id="amt-cont" type="number" inputmode="decimal" placeholder="e.g. ${gram ? '907' : '4'}"></label>` : ''}
    <div class="amtprev" id="amt-prev"></div>
    <button class="btn full mt" id="amt-save">Save</button>
    <div class="sub mt">Meal</div>
    <div class="chipgrid">${H.MEAL_SLOTS.map(([k, n]) => `<button class="pill${slotOf(e) === k ? ' on' : ''}" data-act="food.setmeal" data-id="${e.id}" data-m="${k}">${n}</button>`).join('')}</div>`, {
    onMount: card => {
      const inp = card.querySelector('#amt-in'), prev = card.querySelector('#amt-prev');
      const show = () => { const t = { ...e, amount: num(inp.value) }; applyAmount(t);
        prev.innerHTML = `<b>${fmt(t.kcal)}</b> kcal · <b>${r1(t.p)}</b>g P · ${r1(t.c)}C · ${r1(t.f)}F`; };
      card.querySelectorAll('.amtchip').forEach(b => b.onclick = () => {
        inp.value = b.dataset.v; card.querySelectorAll('.amtchip').forEach(x => x.classList.toggle('on', x === b)); show(); });
      inp.oninput = show; show();
      card.querySelector('#amt-save').onclick = () => {
        const v = num(inp.value); if (v <= 0) return toast('Enter an amount.');
        const cont = num(card.querySelector('#amt-cont')?.value);
        if (cont > 0) {
          e.container = cont;
          const m = e.mealId && S.meals.find(x => x.id === e.mealId);
          if (m && !gram) m.container = cont;   // remember on the saved meal
        }
        e.amount = v; applyAmount(e);
        save(); E.sync(); closeSheet(); rerender(); toast(`Updated · ${e.kcal} kcal`);
      };
    },
  });
}
reg('food.amount', el => amountSheet(el.dataset.id));

export async function logMeal(id, servings = 1) {
  const m = S.meals.find(x => x.id === id);
  if (!m) return;
  const s = num(servings) || 1;
  const ok = await logEntry({ name: m.name, base: { kcal: m.kcal, p: m.p, c: m.c, f: m.f }, amount: s, mode: 'serving', container: m.container || null, src: 'meal', meal: H.TAG_TO_SLOT[m.tag] }, mealHasAllergen(m));
  if (ok) { const e = day().food[day().food.length - 1]; e.mealId = m.id; save(); }
  return ok;
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
    <div class="chips">${pinned.length ? pinned.map(mealChip).join('') : `<div class="empty">Pin meals in Fuel → My Meals to log them in one tap.</div>`}</div>
    ${toolsRow()}`;
}
const mealChip = m => `<button class="chip" data-act="food.quick" data-id="${m.id}">
  <div><div class="t">${esc(m.name)}${mealHasAllergen(m) ? ' <span class="badge red">Peanut</span>' : ''}</div>
  <div class="m">${esc(m.tag)} · ${fmt(m.kcal)} kcal · ${r1(m.p)}P / ${r1(m.c)}C / ${r1(m.f)}F${m.estimate ? ' · <i>est.</i>' : ''}</div></div>
  <div class="add">+</div></button>`;
const toolsRow = () => `<div class="tools">
  <button class="btn ghost" data-act="food.search">${ICON.search}Search</button>
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
    <button class="tile tool" data-act="food.search">${ICON.search}<span class="tname">Search foods</span></button>
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
    ${[['today', 'Log'], ['meals', 'Meals'], ['plan', 'Plan'], ['shop', 'Shop']].map(([k, l]) =>
      `<button class="${sub === k ? 'on' : ''}" data-act="food.sub" data-k="${k}">${l}</button>`).join('')}</div>`;
  return `<div class="wrap">${seg}${sub === 'meals' ? mealsView() : sub === 'shop' ? shopView() : sub === 'plan' ? planView() : todayView()}</div>`;
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
    ${H.MEAL_SLOTS.map(([slot, label]) => {
      const es = entries.filter(e => slotOf(e) === slot);
      if (!es.length && !editable) return '';
      const kc = es.reduce((a, e) => a + e.kcal, 0), pr = es.reduce((a, e) => a + e.p, 0);
      return `<div class="mealhead"><div class="grow"><b>${label}</b><small>${es.length ? `${fmt(kc)} kcal · ${r1(pr)} g protein` : 'nothing yet'}</small></div>
        ${editable ? `<button class="iconbtn" data-act="food.addto" data-m="${slot}" aria-label="Add food to ${label}">+</button>` : ''}</div>
        ${es.map(e => `<div class="row">
          <button class="grow entrybtn" ${editable ? `data-act="food.amount" data-id="${e.id}"` : 'disabled'}><div class="rt">${esc(e.name)} <span class="amt">${esc(amountLabel(e))}</span></div>
            <div class="rs">${timeStr(e.t)} · ${fmt(e.kcal)} kcal · ${r1(e.p)}P / ${r1(e.c)}C / ${r1(e.f)}F${editable ? ' · <u>change</u>' : ''}</div></button>
          ${editable ? `<button class="iconbtn red" data-act="food.del" data-id="${e.id}" aria-label="Remove">×</button>` : ''}</div>`).join('')}`;
    }).join('')}
    ${!entries.length && !editable ? `<div class="empty">Nothing was logged this day.</div>` : ''}
    ${!editable ? `<div class="note">Past days are read-only. Penalties for them are already settled.</div>` : ''}
  </section>

  ${waterPanel(k, editable)}`;
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
  takePhoto({ title: 'Scan plate', hint: 'Fit the whole plate in the frame, from above.' }).then(b => b && onPhoto(b));
});
function needKey() {
  notice({ title: 'Gemini key needed', html: `<div class="msg sm">Photo scan and the AI meal builder use Google’s free Gemini tier. Add your key in <b>Profile → Settings</b>. It takes about two minutes, and SETUP.md has the steps.</div>`,
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
  const peanut = (res.containsPeanut && peanutOn()) || items.some(i => allergenHit(i.name));
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
  await logEntry({ name: name.slice(0, 60), base: sum, amount: 1, src: 'photo' }, el.dataset.peanut ? 'peanut' : null);
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
  const wasPeanut = (product.peanut && peanutOn()) || allergenHit(product.name);
  out.innerHTML = `
    ${wasPeanut ? `<div class="alert">This product lists <b>peanut</b> (or traces).</div>` : ''}
    <div class="rt mt">${esc(product.name)}</div><div class="rs">${esc(product.brand)}${product.servingSize ? ` · serving ${esc(product.servingSize)}` : ''}</div>
    <div class="amtchips">${bcChips(useServ).map(([v, l]) => `<button class="amtchip${l === (useServ ? '1' : '') ? ' on' : ''}" data-bcv="${v}">${l}</button>`).join('')}</div>
    <div class="inline">
      <label class="field grow"><span>${useServ ? 'Servings' : 'Grams'}</span>
        <input id="bc-amt" type="number" inputmode="decimal" value="${useServ ? 1 : product.servingG || 100}" step="${useServ ? 0.25 : 5}"></label>
    </div>
    <div class="bcmacro" id="bc-macro"></div>
    <div class="btnrow mt"><button class="btn ghost" data-act="food.bcsave">Save as meal</button><button class="btn" data-act="food.bclog">Log</button></div>`;
  const upd = () => { const m = bcMacros(); $('#bc-macro').textContent = `${fmt(m.kcal)} kcal · ${r1(m.p)}P / ${r1(m.c)}C / ${r1(m.f)}F`; };
  $('#bc-amt').oninput = upd; upd();
  out.querySelectorAll('[data-bcv]').forEach(btn => btn.onclick = () => {
    $('#bc-amt').value = btn.dataset.bcv; out.querySelectorAll('[data-bcv]').forEach(x => x.classList.toggle('on', x === btn)); upd(); });
}
function bcContainer(useServ) {
  if (!product.packageG) return null;
  if (!useServ) return product.packageG;
  return product.servingG ? r1(product.packageG / product.servingG) : null;
}
function bcChips(useServ) {
  const c = bcContainer(useServ), label = product.packageLabel ? `Whole container (${product.packageLabel})` : 'Whole container';
  const list = useServ ? [[0.5, '½'], [1, '1'], [1.5, '1½'], [2, '2'], [3, '3']]
    : [...new Set([50, 100, product.servingG, 200].filter(Boolean).map(Math.round))].map(g => [g, `${g} g`]);
  if (c) list.push([c, label]);
  return list;
}
function bcMacros() {
  const amt = num($('#bc-amt')?.value);
  const base = product.perServing || product.per100, factor = product.perServing ? amt : amt / 100;
  return { kcal: base.kcal * factor, p: base.p * factor, c: base.c * factor, f: base.f * factor };
}
const bcName = () => { const amt = num($('#bc-amt').value); return `${product.name}${product.perServing ? (amt !== 1 ? ` ×${r1(amt)}` : '') : ` (${r1(amt)} g)`}`; };
reg('food.bclog', async () => {
  const useServ = !!product.perServing, flag = product.peanut ? 'peanut' : allergenHit(product.name);
  const base = product.perServing || product.per100;
  const entry = { name: product.name, base: { kcal: base.kcal, p: base.p, c: base.c, f: base.f }, mode: useServ ? 'serving' : 'gram',
    amount: num($('#bc-amt').value), container: bcContainer(useServ), servingG: product.servingG, src: 'barcode' };
  closeSheet();
  await logEntry(entry, flag);
});
reg('food.bcsave', () => {
  const m = bcMacros();
  S.meals.push({ id: uid(), name: bcName(), tag: 'Snack', kcal: Math.round(m.kcal), p: r1(m.p), c: r1(m.c), f: r1(m.f), servings: 1,
    ingredients: [{ item: product.name, qty: 1, unit: '' }], pinned: false, estimate: false, peanut: product.peanut, prep: { on: false, batches: 1 },
    container: product.perServing ? bcContainer(true) : null });
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
    ${fromAI?.peanut && peanutOn() ? `<div class="alert">The AI flagged <b>peanut</b> in this recipe.</div>` : ''}
    <label class="field"><span>Name</span><input id="me-name" value="${esc(m.name)}"></label>
    <div class="grid2">
      <label class="field"><span>Type</span><select id="me-tag">${TAGS.map(t => `<option ${t === m.tag ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Batch makes (servings)</span><input id="me-serv" type="number" inputmode="numeric" min="1" value="${m.servings || 1}"></label>
    </div>
    <label class="field"><span>Servings in a whole container (optional, e.g. a yogurt tub = 4)</span>
      <input id="me-cont" type="number" inputmode="decimal" value="${m.container || ''}" placeholder="Leave empty if not packaged"></label>
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
          pinned: card.querySelector('#me-pin').checked, estimate: !!fromAI, peanut: !!fromAI?.peanut,
          container: num(card.querySelector('#me-cont').value) || null };
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

// ---------- Meal slots ----------
reg('food.addto', el => { nav.foodMeal = { m: el.dataset.m, t: Date.now() }; ACT['food.quicksheet'](); });
reg('food.setmeal', el => { const e = day().food.find(x => x.id === el.dataset.id); if (e) { e.meal = el.dataset.m; save(); } closeSheet(); rerender(); toast(`Moved to ${slotName(el.dataset.m)}`); });

// ---------- Food search (built-in list, your foods, Open Food Facts) ----------
let FQ = { q: '', online: null, loading: false, list: [] }, picked = null;
const lc = s => String(s || '').toLowerCase();
function foodList() {
  const q = lc(FQ.q).trim(), toks = q.split(/\s+/).filter(Boolean);
  const recent = S.health.recentFoods || [], pool = [...(S.health.customFoods || []), ...H.FOODS];
  let list = q ? pool.filter(f => toks.every(t => lc(f.n).includes(t))) : [...recent, ...H.FOODS.filter(f => !recent.some(r => r.n === f.n))];
  if (FQ.online) list = [...list, ...FQ.online];
  FQ.list = list.slice(0, 60);
  return `${!q && recent.length ? '<div class="sub">Recent first</div>' : ''}
    ${FQ.list.map((f, i) => `<button class="row btnrowitem" data-act="food.pick" data-i="${i}"><div class="grow"><div class="rt sm">${esc(f.n)}${(f.peanut && peanutOn()) || allergenHit(f.n) ? ' <span class="badge red">Allergen</span>' : ''}</div><div class="rs">${esc(f.sv)} · ${r1(f.p)}P / ${r1(f.c)}C / ${r1(f.f)}F</div></div><b>${fmt(f.kcal)}</b></button>`).join('') || '<div class="empty">No matches in the built-in list.</div>'}
    ${q.length >= 3 ? `<button class="btn ghost full mt" data-act="food.searchonline">${FQ.loading ? 'Searching…' : `Search online for “${esc(FQ.q)}”`}</button>` : ''}
    <button class="btn ghost full mt" data-act="food.newfood">+ Create a food</button>`;
}
reg('food.search', () => {
  FQ = { q: '', online: null, loading: false, list: [] };
  sheet('Search foods', `<input id="fs-q" type="search" placeholder="e.g. rice, chicken, bagel" autocomplete="off" aria-label="Search foods"><div id="fs-list" class="mt">${foodList()}</div>`, {
    onMount: card => { const i = card.querySelector('#fs-q'); i.oninput = () => { FQ.q = i.value; FQ.online = null; card.querySelector('#fs-list').innerHTML = foodList(); }; },
  });
});
reg('food.searchonline', async () => {
  if (FQ.loading) return; FQ.loading = true; const box = $('#fs-list'); if (box) box.innerHTML = foodList();
  try {
    const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(FQ.q)}&search_simple=1&json=1&page_size=20&fields=product_name,brands,nutriments,serving_quantity,allergens_tags,traces_tags`);
    const j = await r.json();
    FQ.online = (j.products || []).map(p => {
      const n = p.nutriments || {}; let k100 = n['energy-kcal_100g']; if (k100 == null && n.energy_100g != null) k100 = n.energy_100g / 4.184;
      if (k100 == null || !p.product_name) return null;
      const g = parseFloat(p.serving_quantity) || 100, k = g / 100;
      return { n: p.product_name + (p.brands ? ` (${p.brands.split(',')[0]})` : ''), sv: `${Math.round(g)} g`, g, kcal: Math.round(k100 * k), p: r1((n.proteins_100g || 0) * k), c: r1((n.carbohydrates_100g || 0) * k), f: r1((n.fat_100g || 0) * k),
        peanut: [...(p.allergens_tags || []), ...(p.traces_tags || [])].some(t => /peanut/.test(t)) };
    }).filter(Boolean);
    if (!FQ.online.length) toast('Nothing found online.');
  } catch { toast('Online search is busy. Try again, or use Barcode.'); }
  FQ.loading = false; const b2 = $('#fs-list'); if (b2) b2.innerHTML = foodList();
});
function qtySheet(f) {
  picked = f;
  sheet(f.n, `<div class="rs">1 serving = ${esc(f.sv)} · ${fmt(f.kcal)} kcal · ${r1(f.p)}P / ${r1(f.c)}C / ${r1(f.f)}F</div>
    ${f.id === 'massshake' ? `<div class="note">${esc(H.MASS_SHAKE_NOTE)}</div>` : ''}
    <div class="amtchips">${[[0.5, '½'], [1, '1'], [1.5, '1½'], [2, '2'], [3, '3']].map(([q, l]) => `<button class="amtchip${q === 1 ? ' on' : ''}" data-act="food.qty" data-q="${q}">${l}</button>`).join('')}</div>
    <label class="field"><span>Servings</span><input id="fq-n" type="number" inputmode="decimal" step="0.25" value="1"></label>
    ${f.g ? `<label class="field"><span>Or grams</span><input id="fq-g" type="number" inputmode="decimal" placeholder="${f.g}"></label>` : ''}
    <button class="btn full big mt" data-act="food.picklog">Log it</button>`, {
    onMount: card => { const g = card.querySelector('#fq-g'); if (g) g.oninput = () => { const v = num(g.value); if (v) card.querySelector('#fq-n').value = r1(v / f.g * 100) / 100; }; },
  });
}
reg('food.pick', el => qtySheet(FQ.list[+el.dataset.i]));
reg('food.qty', el => { $('#fq-n').value = el.dataset.q; document.querySelectorAll('.amtchip').forEach(x => x.classList.toggle('on', x === el)); });
reg('food.picklog', async () => {
  const f = picked, q = num($('#fq-n').value); if (!q) return toast('Enter servings.');
  S.health.recentFoods = [{ ...f }, ...(S.health.recentFoods || []).filter(x => x.n !== f.n)].slice(0, 25);
  closeSheet();
  await logEntry({ name: f.n, base: { kcal: f.kcal, p: f.p, c: f.c, f: f.f }, amount: q, mode: 'serving', src: 'db' }, f.peanut ? 'peanut' : allergenHit(f.n));
});
reg('food.newfood', () => sheet('Create a food', `<label class="field"><span>Name</span><input id="nf-n"></label><label class="field"><span>Serving size</span><input id="nf-sv" placeholder="e.g. 1 cup"></label>
  <div class="grid4"><label class="field"><span>Kcal</span><input id="nf-k" type="number" inputmode="decimal"></label><label class="field"><span>Protein</span><input id="nf-p" type="number" inputmode="decimal"></label>
  <label class="field"><span>Carbs</span><input id="nf-c" type="number" inputmode="decimal"></label><label class="field"><span>Fat</span><input id="nf-f" type="number" inputmode="decimal"></label></div>
  <button class="btn full mt" data-act="food.newfoodgo">Save food</button>`));
reg('food.newfoodgo', () => {
  const n = $('#nf-n').value.trim(), k = num($('#nf-k').value); if (!n || !k) return toast('Name and calories are required.');
  const f = { id: 'c_' + uid(), n, sv: $('#nf-sv').value.trim() || '1 serving', kcal: k, p: num($('#nf-p').value), c: num($('#nf-c').value), f: num($('#nf-f').value) };
  S.health.customFoods = [f, ...(S.health.customFoods || [])]; save(); qtySheet(f);
});

// ---------- Plan: self-adjusting calorie target, sample day, tips ----------
const dayGap = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
export function tdeeCalc() {
  const p = S.health.profile, W = Body.curWeight(), lbmKg = W * (1 - p.bf / 100) * 0.45359237;
  const bmr = 370 + 21.6 * lbmKg, formula = bmr * p.activity;     // Katch-McArdle × activity
  const end = addDays(dkey(), -1), start = addDays(end, -20);
  let sum = 0, n = 0; for (let k = start; k <= end; k = addDays(k, 1)) { const t = E.totals(k).kcal; if (t >= 1000) { sum += t; n++; } }
  const tr = Body.trendSeries().filter(x => x.k >= start && x.k <= end), wi = S.weights.filter(w => w.date >= start && w.date <= end).length;
  let obs = null;
  if (n >= 7 && wi >= 5 && tr.length >= 10) { const a = tr[0], b = tr[tr.length - 1]; obs = sum / n - (b.t - a.t) * 3500 / Math.max(1, dayGap(a.k, b.k)); }
  const conf = obs == null ? 0 : Math.min(1, n / 21) * Math.min(1, wi / 12);
  return { bmr, formula, obs, conf, est: obs == null ? formula : conf * obs + (1 - conf) * formula, n, wi };
}
export function recTargets(tdee) {
  const p = S.health.profile, r5 = x => Math.round(x / 5) * 5;
  const kcal = Math.round((tdee + p.goalRate * 500) / 25) * 25, pr = r5(Body.curWeight() * p.proteinPerLb), f = r5(kcal * p.fatPct / 100 / 9);
  return { kcal, p: pr, c: r5((kcal - pr * 4 - f * 9) / 4), f };
}
const goalText = r => r > 0 ? `gain <b>+${r} lb/week</b>` : r < 0 ? `lose <b>${-r} lb/week</b>` : '<b>maintain</b> your weight';
// A sample meal that names an ingredient on your allergy list (e.g. almonds) is never offered as allergy-compatible.
function sampleConflict(m) { for (const [id] of m.items) { const f = H.FOODS.find(x => x.id === id); const hit = f && allergenHit(f.n); if (hit) return f.n.toLowerCase(); } return null; }
function planView() {
  const T = S.settings.targets, Ex = tdeeCalc(), R = recTargets(Ex.est), diff = R.kcal - T.kcal, p = S.health.profile, bulking = p.goalRate > 0;
  const F = id => H.FOODS.find(f => f.id === id);
  let all = 0, allP = 0;
  const meals = H.SAMPLE_DAY.map((m, i) => {
    const kc = m.items.reduce((a, [id, q]) => a + F(id).kcal * q, 0), pr = m.items.reduce((a, [id, q]) => a + F(id).p * q, 0); all += kc; allP += pr;
    const hit = sampleConflict(m);
    return `<div class="row"><div class="grow"><div class="rt sm">${slotName(m.meal)}${hit ? ` <span class="badge red">Contains ${esc(hit)}</span>` : ''}</div><div class="rs">${m.items.map(([id, q]) => `${q !== 1 ? q + '× ' : ''}${esc(F(id).n)}`).join(', ')}</div><div class="rs">${fmt(kc)} kcal · ${r1(pr)} g protein${hit ? ' · conflicts with your allergy list, not recommended' : ''}</div></div>${hit ? '' : `<button class="btn ghost sm" data-act="food.logsample" data-i="${i}">Log</button>`}</div>`;
  });
  const PR = S.settings.planRange;
  return `<section class="panel"><div class="ptitle"><span>Calorie target</span></div>
    ${PR ? `<div class="donebox" style="margin:0 0 12px">Your meal plan's starting range: <b>${fmt(PR.lo)}–${fmt(PR.hi)} kcal</b>/day. Your target stays at ${fmt(T.kcal)} kcal unless you change it. The range is a starting point, not a guaranteed surplus: your weight trend tells you if it's working.</div>` : ''}
    <div class="bigline"><div><b>${fmt(T.kcal)}</b><span> kcal now</span></div><div><b>${fmt(Ex.est)}</b><span> burned / day (est.)</span></div></div>
    <div class="note" style="margin-top:0">${Ex.obs == null ? `This is a formula estimate from your lean mass (${r1(Body.curWeight() * (1 - p.bf / 100))} lb) and activity. After <b>7+ days of food logs and 5+ weigh-ins</b>, it learns your real burn from your weight trend. So far: ${Ex.n} days logged, ${Ex.wi} weigh-ins.` : `Learned from ${Ex.n} logged days and ${Ex.wi} weigh-ins (${Math.round(Ex.conf * 100)}% confidence). Your real data says you burn about ${fmt(Ex.obs)} kcal/day.`}</div>
    ${Math.abs(diff) >= 50 || R.p !== T.p ? `<div class="donebox">To ${goalText(p.goalRate)}: <b>${fmt(R.kcal)} kcal</b> (${diff >= 0 ? '+' : ''}${fmt(diff)}) · ${R.p} g protein · ${R.c} g carbs · ${R.f} g fat</div>
      <button class="btn full mt" data-act="food.applytargets">Use these targets</button><div class="note">This also changes what your daily nutrition quest asks for.</div>` : `<div class="donebox">Your targets match your goal to ${goalText(p.goalRate)}.</div>`}
    <div class="note">Goal, body fat %, activity and protein are in Profile → Settings → Body & plan.</div></section>
  ${bulking ? `<section class="panel"><div class="ptitle"><span>Sample bulking day</span></div><div class="note" style="margin-top:0">Checked against your allergy list by food name only, so always check real ingredient labels. About <b>${fmt(all)} kcal</b> and ${r1(allP)} g protein. Tap Log to add a meal to that slot today.</div>${meals.join('')}</section>
  <section class="panel"><div class="ptitle"><span>Mass shake</span></div><div class="rt sm">1,148 kcal · 83 g protein · peanut-free</div><div class="note">${esc(H.MASS_SHAKE_NOTE)}</div>
    <button class="btn ghost full mt" data-act="food.saveshake">Save to My Meals</button></section>
  <section class="panel"><div class="ptitle"><span>Hard-gainer tips</span></div>
    <p class="para">• <b>Drink calories.</b> Whole milk and the mass shake are the easiest wins when you're not hungry.</p>
    <p class="para">• <b>Eat every 3–4 hours.</b> 4–6 meals, each with about ${Math.round(Body.curWeight() * 0.45359237 * 0.4 / 5) * 5} g protein (0.4 g/kg).</p>
    <p class="para">• <b>Add fat to meals.</b> One tablespoon of olive oil is 120 kcal you won't notice.</p>
    <p class="para">• <b>Load carbs around training.</b> Rice, bagels, oats and fruit power more sets.</p>
    <p class="para">• <b>Cut back on bulky veggies</b> if they fill you up too much. Keep some for your health.</p>
    <p class="para">• <b>Trust the trend, not the mirror.</b> Aim for +${p.goalRate} lb/week on the trend line in Health → Weight & body.</p></section>` : ''}`;
}
reg('food.applytargets', async () => {
  const R = recTargets(tdeeCalc().est), T = S.settings.targets;
  if (!(await confirmBox('Update targets', `Set your daily targets to <b>${fmt(R.kcal)} kcal</b>, ${R.p} g protein, ${R.c} g carbs and ${R.f} g fat?`, 'Update'))) return;
  Object.assign(T, R); save(); E.sync(); rerender(); toast('Targets updated');
});
reg('food.logsample', async el => {
  const m = H.SAMPLE_DAY[+el.dataset.i], F = id => H.FOODS.find(f => f.id === id);
  if (sampleConflict(m)) return toast('This sample meal conflicts with your allergy list.');
  const t = m.items.reduce((a, [id, q]) => { const f = F(id); a.kcal += f.kcal * q; a.p += f.p * q; a.c += f.c * q; a.f += f.f * q; return a; }, { kcal: 0, p: 0, c: 0, f: 0 });
  await logEntry({ name: `${slotName(m.meal)} (sample)`, base: t, amount: 1, src: 'plan', meal: m.meal }, null);
});
reg('food.saveshake', () => {
  if (S.meals.some(m => m.name === 'Mass shake')) return toast('Already in My Meals.');
  S.meals.push({ id: uid(), name: 'Mass shake', tag: 'Shake', kcal: 1148, p: 83, c: 118, f: 42, servings: 1, pinned: true, estimate: false, prep: { on: false, batches: 5 },
    ingredients: [{ item: 'Whole milk', qty: 2, unit: 'cup' }, { item: 'Whey protein', qty: 2, unit: 'scoop' }, { item: 'Oats (dry)', qty: 1, unit: 'cup' }, { item: 'Banana', qty: 1, unit: '' }, { item: 'Sunflower seed butter', qty: 2, unit: 'tbsp' }] });
  save(); toast('Saved and pinned to Quick Log');
});