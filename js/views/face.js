// FACE (inside Health): dashboard + routing for weekly photos, skin check-ins, routine, grooming, trends, review.
// Food, water, training and sleep are read from The System's own records — never logged twice here.
import { esc, dkey, addDays, niceDate, fmt, r1 } from '../util.js';
import { reg, nav, rerender, go } from '../core.js';
import { toast } from '../ui.js';
import { F, saveFace, hydrateFace, isDev, faceStorageOK } from '../face/store.js';
import { I, SCALES, lbl, mondayOf, fmtShort, daysBetween, routineFor, stateOf, routineCount, routineStats, weekContext, latestSkin, sortedCheckins, fOpen, fBack, backBtn, suggestions } from '../face/common.js';
import * as Ph from '../face/photos.js';
import * as Sk from '../face/skin.js';
import { bottleOz } from '../water.js';

const SUBS = { capture: Ph.captureView, timeline: Ph.timelineView, compare: Ph.compareView, skinlog: Sk.skinLogView, trends: Sk.trendsView, products: Sk.productsView, grooming: Sk.groomingView, review: Sk.reviewView, data: Sk.dataView };

/* ---------- primary action ---------- */
function primaryAction() {
  const mon = mondayOf(), wk = F.checkins.find(c => c.date >= mon), last = latestSkin(), cks = sortedCheckins();
  if (!wk) return { act: 'face.photos', icon: I.camera, label: 'Take weekly photos', eyebrow: 'This week', title: 'Weekly photos', body: cks.length ? `Front and ${cks[cks.length - 1].side || 'left'} side. Match last time: ${lastConditions()}.` : 'A front and a side photo, once a week. That is all the photo work this needs.' };
  if (!last || daysBetween(last.date, dkey()) >= 3) return { act: 'face.skin', icon: '', label: 'Log skin check-in', eyebrow: 'About 30 seconds', title: 'Skin check-in', body: last ? `Last logged ${niceDate(last.date).toLowerCase()}. Breakouts, irritation and marks, all optional.` : 'Breakouts, irritation and marks. Every field is optional.' };
  return { act: 'face.review', icon: '', label: 'Review this week', eyebrow: 'Week of ' + fmtShort(mon), title: 'Weekly review', body: 'This week’s photos and a recent skin check-in are in. See what was recorded and what to adjust.' };
}
function lastConditions() {
  const c = [...sortedCheckins()].reverse().find(x => x.light || x.time);
  if (!c) return 'same spot, same light';
  return [c.light && c.light.toLowerCase() + ' light', c.time && 'around ' + Ph.hm12(c.time)].filter(Boolean).join(', ');
}

/* ---------- weekly summary (from records only) ---------- */
function weekSummary() {
  const mon = mondayOf(), sk = F.skin.filter(s => s.date >= mon), out = [];
  if (sk.length) {
    const b = sk.map(s => s.breakouts).filter(v => v != null), irr = sk.map(s => s.irritation).filter(v => v != null);
    out.push(`${sk.length} skin check-in${sk.length > 1 ? 's' : ''}. New breakouts: ${b.length ? [...new Set(b.map(v => SCALES.breakouts[v].toLowerCase()))].join(' / ') : 'not logged'}. Irritation: ${irr.length ? (Math.max(...irr) === 0 ? 'none' : 'up to ' + SCALES.irritation[Math.max(...irr)].toLowerCase()) : 'not logged'}.`);
  } else out.push('No skin check-ins yet this week.');
  if (F.products.length) { const st = routineStats(mon, dkey()); out.push(st.tot ? `Routine steps marked done: ${st.done} of ${st.tot}${st.unmarked ? ` (${st.unmarked} not marked)` : ''}.` : 'No routine steps were scheduled.'); }
  const wk = F.checkins.find(c => c.date >= mon);
  out.push(wk ? `Photos saved ${niceDate(wk.date).toLowerCase()}.` : 'Weekly photos not taken yet.');
  return out;
}

/* ---------- cards ---------- */
const metric = (key, val, note) => `<div class="fx-metric"><span>${key}</span><b class="${val === 'Not logged' ? 'nl' : ''}">${esc(val)}</b>${note ? `<small>${note}</small>` : ''}</div>`;
let viewSlot = null;
const curSlot = () => viewSlot || (new Date().getHours() < 14 ? 'am' : 'pm');
function taskRow(k, p, slot) {
  const st = stateOf(k, p, slot);
  return `<div class="fx-task ${st || ''}"><button class="fx-taskmain" data-act="face.task" data-id="${p.id}" data-s="${slot}" aria-pressed="${st === 'done'}" ${st === 'paused' ? 'disabled' : ''}>
    <span class="fx-box">${st === 'done' ? I.check : ''}</span><span class="fx-tt"><b>${esc(p.name)}</b><small>${st === 'paused' ? 'Paused' : esc([p.active, p.strength].filter(Boolean).join(' · ') || p.how || '')}</small></span></button>
    ${st === 'paused' ? '' : `<button class="fx-skip" data-act="face.skip" data-id="${p.id}" data-s="${slot}" aria-pressed="${st === 'skipped'}">${st === 'skipped' ? 'Skipped' : 'Skip'}</button>`}</div>`;
}
function routineCard() {
  const k = dkey(), slot = curSlot();
  if (!F.products.length) return `<section class="fx-card"><header class="fx-head"><h2>Skincare</h2></header>
    <p class="fx-empty">Add the products you actually use. Nothing is pre-filled, and nothing is combined for you.</p>
    <button class="btn ghost full" data-act="face.products">Add products</button></section>`;
  const am = routineCount(k, 'am'), pm = routineCount(k, 'pm'), list = routineFor(k, slot);
  const seg = (s, c, label, ic) => `<button class="fx-slot${s === slot ? ' on' : ''}" data-act="face.slot" data-s="${s}" aria-pressed="${s === slot}">${ic}<span>${label}</span><b>${c.total ? `${c.done}<i>/${c.total}</i>` : '—'}</b></button>`;
  return `<section class="fx-card"><header class="fx-head"><h2>Skincare</h2><button class="fx-link" data-act="face.products">Products</button></header>
    <div class="fx-slots">${seg('am', am, 'Morning', I.sun)}${seg('pm', pm, 'Evening', I.moon)}</div>
    <div class="fx-tasks">${list.length ? list.map(p => taskRow(k, p, slot)).join('') : `<p class="fx-empty" style="margin:10px 0 0">Nothing scheduled this ${slot === 'am' ? 'morning' : 'evening'}.</p>`}</div></section>`;
}
function skinCard() {
  const s = latestSkin(), mon = mondayOf();
  const strip = Array.from({ length: 7 }, (_, i) => { const k = addDays(mon, i);
    return `<i class="${F.skin.some(x => x.date === k) ? 'on' : ''}${k > dkey() ? ' fut' : ''}${k === dkey() ? ' today' : ''}" title="${fmtShort(k)}"></i>`; }).join('');
  return `<section class="fx-card"><header class="fx-head"><h2>Skin</h2><span class="fx-meta">${s ? 'Latest · ' + niceDate(s.date) : 'Not logged'}</span></header>
    ${s ? `<div class="fx-metrics">${metric('Breakouts', lbl('breakouts', s.breakouts), s.count != null ? `${s.count} counted by hand` : '')}${metric('Irritation', lbl('irritation', s.irritation))}${metric('Tender bumps', lbl('tender', s.tender))}${metric('Healing marks', lbl('marks', s.marks))}</div>`
      : `<p class="fx-empty">No skin check-ins yet. Log one now and the trend starts building from today.</p>`}
    <div class="fx-week"><span>Check-ins this week</span><div class="fx-dots">${strip}</div></div>
    <div class="btnrow"><button class="btn ghost" data-act="face.skin">Log check-in</button><button class="btn ghost" data-act="face.trends">${I.chart}Trends</button></div></section>`;
}
function photoCard() {
  const cks = sortedCheckins(), last = cks[cks.length - 1], base = cks[0], wk = F.checkins.find(c => c.date >= mondayOf());
  if (!last) return `<section class="fx-card"><header class="fx-head"><h2>Weekly photos</h2></header>
    <p class="fx-empty">Your first set becomes the baseline. Same light, distance and time each week keeps comparisons fair.</p>
    <button class="btn ghost full" data-act="face.photos">Take first photos</button></section>`;
  const thumb = (id, cap) => `<figure class="fx-thumb">${id ? `<img data-fphoto="${id}" alt="${cap}">` : '<div class="fx-noimg">—</div>'}<figcaption>${cap}</figcaption></figure>`;
  return `<section class="fx-card"><header class="fx-head"><h2>Weekly photos</h2><span class="fx-meta">${wk ? 'Done this week' : 'Due this week'}</span></header>
    <button class="fx-thumbs" data-act="face.timeline" aria-label="Open photo timeline">${thumb(last.photos.front, 'Front')}${thumb(last.photos.side, (last.side === 'right' ? 'Right' : 'Left') + ' side')}
      <span class="fx-thumbinfo"><b>${fmtShort(last.date)}</b><span>${cks.length === 1 ? 'Baseline' : 'Week ' + cks.length}</span>${cks.length > 1 ? `<span class="dim">Baseline ${fmtShort(base.date)}</span>` : ''}</span></button>
    <div class="btnrow"><button class="btn ghost" data-act="face.timeline">Timeline</button><button class="btn ghost" data-act="face.compare" ${cks.length < 2 ? 'disabled' : ''}>${I.compare}Compare</button></div></section>`;
}
function contextCard() {
  const c = weekContext(), n = c.days.length;
  const row = (ic, k, v, act, extra = '') => `<button class="fx-ctx" data-act="${act}" ${extra}><span class="fx-ic">${ic}</span><span class="fx-ck">${k}</span><span class="fx-cv">${v}</span>${I.chev}</button>`;
  return `<section class="fx-card"><header class="fx-head"><h2>This week's context</h2><span class="fx-meta">${n} day${n > 1 ? 's' : ''} so far</span></header>
    ${row(I.fork, 'Meals', c.food.length ? `Entries on ${c.food.length} of ${n} days` : 'Not logged', 'nav.go', 'data-tab="food"')}
    ${row(I.drop, 'Water', c.waterAvg != null ? `${fmt(c.waterAvg)} oz avg · ${r1(c.waterAvg / bottleOz())} bottle` : 'Not logged', 'water.sheet')}
    ${row(I.dumbbell, 'Training', c.sessions ? `${c.sessions} session${c.sessions > 1 ? 's' : ''}` : 'Not logged', 'h.open', 'data-v="training"')}
    ${row(I.moon, 'Sleep', c.sleepAvg != null ? `${r1(c.sleepAvg)} h avg · ${c.sleepN} check-in${c.sleepN > 1 ? 's' : ''}` : 'Optional · not logged', 'h.checkin')}
    <p class="fx-fine">Read from Fuel, Training and Recovery, so nothing is logged twice. A day with entries isn't assumed to be a complete day.</p></section>`;
}
function groomCard() {
  const on = F.grooming.filter(g => g.on);
  if (!on.length) return `<section class="fx-card"><header class="fx-head"><h2>Grooming</h2><button class="fx-link" data-act="face.grooming">Guides</button></header>
    <p class="fx-empty" style="margin:0">Optional reminders for brows, shaving, lip care and more. Add them only if they help.</p></section>`;
  const due = g => g.last ? daysBetween(g.last, dkey()) - g.every : 0;
  const rows = on.map(g => ({ g, d: due(g) })).sort((a, b) => b.d - a.d).slice(0, 3);
  return `<section class="fx-card"><header class="fx-head"><h2>Grooming</h2><button class="fx-link" data-act="face.grooming">All tasks</button></header>
    ${rows.map(({ g, d }) => `<div class="fx-groom"><span class="fx-tt"><b>${esc(g.name)}</b><small>${d >= 0 ? (d === 0 ? 'Due today' : `Due ${d} day${d > 1 ? 's' : ''} ago`) : `In ${-d} day${d < -1 ? 's' : ''}`} · every ${g.every === 1 ? 'day' : g.every + ' days'}</small></span>
      <button class="btn sm ${d >= 0 ? '' : 'ghost'}" data-act="face.groomdone" data-id="${g.id}">Done</button></div>`).join('')}</section>`;
}
function clinicianNote() {
  const s = suggestions().find(x => x.k === 'clinic');
  if (!s || Date.now() - (F.settings.clinicianSeen || 0) < 30 * 864e5) return '';
  return `<aside class="fx-quiet">${I.pulse}<div><b>${esc(s.t)}</b><span>${s.d}</span><button class="fx-link" data-act="face.clinicianok">Got it</button></div></aside>`;
}

export function dashboard() {
  const p = primaryAction(), mon = mondayOf(), cks = sortedCheckins();
  return `${backBtn('health')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Health${isDev ? ' · <em>Dev fixtures</em>' : ''}</span><h1>Face</h1><p>Week of ${fmtShort(mon)} · ${cks.length ? `${cks.length} weekly check-in${cks.length > 1 ? 's' : ''}` : 'getting started'}</p></header>
  ${!faceStorageOK ? `<div class="alert">This browser is blocking storage, so Face records won't be kept after you close the app.</div>` : ''}
  <section class="fx-hero"><span class="fx-eyebrow">${esc(p.eyebrow)}</span><h2>${esc(p.title)}</h2><p>${esc(p.body)}</p>
    <button class="btn full big" data-act="${p.act}">${p.icon}${esc(p.label)}</button></section>
  ${clinicianNote()}
  ${routineCard()}
  ${skinCard()}
  ${photoCard()}
  <section class="fx-card"><header class="fx-head"><h2>Week so far</h2><button class="fx-link" data-act="face.review">Full review</button></header>
    <ul class="fx-sum">${weekSummary().map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>
  ${contextCard()}
  ${groomCard()}
  <nav class="fx-tools" aria-label="Face tools">
    <button data-act="face.trends">${I.chart}<span>Trends</span></button><button data-act="face.products">${I.list}<span>Products</span></button>
    <button data-act="face.grooming">${I.razor}<span>Grooming</span></button><button data-act="face.data">${I.shield}<span>Data</span></button></nav>
  </div>`;
}

export function render() { const v = nav.sub.face; return v && SUBS[v] ? SUBS[v]() : dashboard(); }
export function mount(root) { hydrateFace(root); if (nav.sub.face === 'data') Sk.mountData(root); }

/* ---------- actions ---------- */
reg('face.slot', el => { viewSlot = el.dataset.s; rerender(); });
function setTask(id, slot, val) {
  const k = dkey(); F.routineLog[k] = F.routineLog[k] || {}; const key = id + '@' + slot;
  if (F.routineLog[k][key] === val) delete F.routineLog[k][key]; else F.routineLog[k][key] = val;
  viewSlot = slot; saveFace(); rerender();
}
reg('face.task', el => setTask(el.dataset.id, el.dataset.s, 'done'));
reg('face.skip', el => setTask(el.dataset.id, el.dataset.s, 'skipped'));
reg('face.groomdone', el => { const g = F.grooming.find(x => x.id === el.dataset.id); if (g) { g.last = dkey(); saveFace(); rerender(); toast(`${g.name} · done`); } });
reg('face.clinicianok', () => { F.settings.clinicianSeen = Date.now(); saveFace(); rerender(); });
reg('face.photos', () => Ph.startCapture());
reg('face.skin', () => Sk.startSkin());
reg('face.timeline', () => fOpen('timeline'));
reg('face.compare', () => Ph.openCompare());
reg('face.trends', () => fOpen('trends'));
reg('face.products', () => fOpen('products'));
reg('face.grooming', () => fOpen('grooming'));
reg('face.review', () => fOpen('review'));
reg('face.data', () => fOpen('data'));
