// FACE · skin check-ins, trends, skincare products, grooming, weekly review, data & privacy.
import { S } from '../state.js';
import { $, esc, uid, dkey, addDays, parseKey, downloadText, blobToBase64, fmt, r1, num } from '../util.js';
import { reg, regChg, nav, rerender } from '../core.js';
import { sheet, closeSheet, toast, confirmBox } from '../ui.js';
import { F, saveFace, flushFace, putPhoto, getPhoto, photoKeys, delPhoto, wipeFace, replaceFace, faceDefaults } from './store.js';
import { I, SCALES, SCALE_NAMES, lbl, AREAS, areaName, fOpen, fBack, backBtn, fmtShort, fmtLong, mondayOf, daysBetween, range, routineStats, routineCount, productEvents, suggestions, sortedCheckins, weekContext, scaleChips, latestSkin } from './common.js';
import { contextBetween, sideName } from './photos.js';

/* =================== SKIN CHECK-IN (about 30 seconds) =================== */
let sd = null;
const blank = () => ({ date: dkey(), breakouts: null, count: '', areas: [], redness: null, irritation: null, tender: null, marks: null, puffiness: null, note: '' });
export function startSkin(id) {
  const e = id && F.skin.find(s => s.id === id);
  sd = e ? { ...blank(), ...e, count: e.count ?? '', areas: [...(e.areas || [])] } : blank();
  fOpen('skinlog');
}
function areaMap() {
  const on = a => sd.areas.includes(a) ? ' on' : '';
  return `<div class="fx-facemap"><svg viewBox="0 0 220 260" role="group" aria-label="Facial areas, mirror view">
    <path class="fx-fo" d="M110 14c52 0 80 38 80 92 0 70-36 136-80 136S30 176 30 106c0-54 28-92 80-92z"/>
    <path class="fx-area${on('forehead')}" data-act="face.area" data-a="forehead" d="M44 70c8-34 34-50 66-50s58 16 66 50c-20-8-42-12-66-12s-46 4-66 12z"/>
    <path class="fx-area${on('nose')}" data-act="face.area" data-a="nose" d="M98 92h24l8 62c-6 6-34 6-40 0z"/>
    <path class="fx-area${on('lcheek')}" data-act="face.area" data-a="lcheek" d="M40 100c14-6 34-8 50-4l-4 66c-16 4-32-2-42-12-4-16-6-34-4-50z"/>
    <path class="fx-area${on('rcheek')}" data-act="face.area" data-a="rcheek" d="M180 100c-14-6-34-8-50-4l4 66c16 4 32-2 42-12 4-16 6-34 4-50z"/>
    <path class="fx-area${on('chin')}" data-act="face.area" data-a="chin" d="M86 204c14 8 34 8 48 0l-2 26c-14 10-30 10-44 0z"/>
    <path class="fx-area${on('jaw')}" data-act="face.area" data-a="jaw" d="M46 160c10 10 24 16 40 16v26c-20-2-34-16-40-42zM174 160c-10 10-24 16-40 16v26c20-2 34-16 40-42z"/>
  </svg><div class="fx-maplbl">${AREAS.map(([a, n]) => `<button class="fx-chip${on(a)}" data-act="face.area" data-a="${a}" aria-pressed="${sd.areas.includes(a)}">${n}</button>`).join('')}</div>
  <p class="fx-fine">Mirror view: your left cheek is on the left, as you'd see it in a mirror.</p></div>`;
}
export function skinLogView() {
  if (!sd) sd = blank();
  const q = k => `<div class="fx-q"><span>${SCALE_NAMES[k]}</span>${scaleChips(k, sd[k], k)}</div>`;
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">${sd.id ? 'Edit entry' : 'All fields optional'}</span><h1>Skin check-in</h1><p>Tap what applies. Tap a choice again to clear it.</p></header>
  <section class="fx-card">
    <label class="field" style="margin-top:0"><span>Date</span><input type="date" value="${sd.date}" max="${dkey()}" data-chg="face.sfield" data-k="date"></label>
    ${q('breakouts')}
    <details class="fx-more" ${sd.count !== '' ? 'open' : ''}><summary>Add a count (optional)</summary><label class="field"><span>New breakouts counted by hand</span><input type="number" inputmode="numeric" min="0" value="${sd.count}" data-chg="face.sfield" data-k="count" placeholder="Leave empty if you didn't count"></label></details>
    ${q('irritation')}${q('tender')}${q('redness')}${q('marks')}${q('puffiness')}
  </section>
  <section class="fx-card"><header class="fx-head"><h2>Where</h2><span class="fx-meta">Optional</span></header>${areaMap()}</section>
  <section class="fx-card"><label class="field" style="margin-top:0"><span>Notes (optional)</span><textarea rows="2" data-chg="face.sfield" data-k="note" placeholder="Anything new: product, razor, sunburn, sleep…">${esc(sd.note)}</textarea></label></section>
  <p class="fx-fine">Active breakouts, irritation and healing marks are tracked separately, so a fading mark is never counted as a new spot.</p>
  <button class="btn full big" data-act="face.saveskin">${sd.id ? 'Save changes' : 'Save check-in'}</button>
  ${sd.id ? `<button class="btn danger full" data-act="face.delskin" data-id="${sd.id}">Delete entry</button>` : ''}
  </div>`;
}
reg('face.scalepick', el => {
  const k = el.dataset.id, v = +el.dataset.v;
  if (nav.sub.face === 'skinlog') { sd[k] = sd[k] === v ? null : v; el.parentElement.querySelectorAll('button').forEach((b, i) => { const on = sd[k] === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
});
reg('face.area', el => { const a = el.dataset.a; sd.areas = sd.areas.includes(a) ? sd.areas.filter(x => x !== a) : [...sd.areas, a];
  document.querySelectorAll(`[data-a="${a}"]`).forEach(n => { n.classList.toggle('on', sd.areas.includes(a)); if (n.tagName === 'BUTTON') n.setAttribute('aria-pressed', sd.areas.includes(a)); }); });
regChg('face.sfield', el => { if (sd) sd[el.dataset.k] = el.value; });
reg('face.saveskin', () => {
  const ta = document.querySelector('[data-k="note"]'); if (ta) sd.note = ta.value;
  const cnt = document.querySelector('[data-k="count"]'); if (cnt) sd.count = cnt.value;
  const any = ['breakouts', 'redness', 'irritation', 'tender', 'marks', 'puffiness'].some(k => sd[k] != null) || sd.areas.length || sd.note.trim() || sd.count !== '';
  if (!any) return toast('Pick at least one thing to log.');
  const count = sd.count === '' || sd.count == null ? null : Math.max(0, Math.round(num(sd.count)));
  const rec = { id: sd.id || 's_' + uid(), date: sd.date || dkey(), t: Date.now(), breakouts: sd.breakouts, count, countSrc: count == null ? null : 'manual', areas: sd.areas,
    redness: sd.redness, irritation: sd.irritation, tender: sd.tender, marks: sd.marks, puffiness: sd.puffiness, note: sd.note.trim() };
  const i = F.skin.findIndex(s => s.id === rec.id); if (i >= 0) F.skin[i] = rec; else F.skin.push(rec);
  sd = null; saveFace(); fBack(); toast('Skin check-in saved');
});
reg('face.delskin', async el => {
  if (!(await confirmBox('Delete entry', 'Delete this skin check-in?', 'Delete', true))) return;
  F.skin = F.skin.filter(s => s.id !== el.dataset.id); sd = null; saveFace(); fBack(); toast('Deleted');
});

/* =================== TRENDS =================== */
let span = 28;
const latestOn = k => F.skin.filter(s => s.date === k).sort((a, b) => (b.t || 0) - (a.t || 0))[0];
function trendChart(days) {
  const W = 320, L = 74, rowH = 24, n = days.length, cw = (W - L - 4) / n;
  const rows = [['breakouts', 'Breakouts'], ['irritation', 'Irritation'], ['tender', 'Tender'], ['redness', 'Redness'], ['marks', 'Marks'], ['puffiness', 'Puffiness']];
  let y = 18, g = '';
  const x = i => L + i * cw;
  // markers: photo check-ins and product changes
  const cks = new Set(F.checkins.map(c => c.date)), ev = productEvents(days[0], days[n - 1]);
  g += `<text x="0" y="12" class="fx-cl">Events</text>`;
  days.forEach((k, i) => { if (cks.has(k)) g += `<circle cx="${x(i) + cw / 2}" cy="8" r="${Math.min(3.2, cw / 2.2)}" class="fx-cam"/>`; });
  ev.forEach(e => { const i = days.indexOf(e.d); if (i < 0) return; const cx = x(i) + cw / 2; g += e.kind === 'start' ? `<path d="M${cx - 3.5},15 L${cx},8 L${cx + 3.5},15Z" class="fx-ev"/>` : `<path d="M${cx - 3.5},8 L${cx},15 L${cx + 3.5},8Z" class="fx-ev stop"/>`; });
  rows.forEach(([k, name]) => {
    y += rowH;
    g += `<text x="0" y="${y - 7}" class="fx-cl">${name}</text><line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="fx-cg"/>`;
    days.forEach((d, i) => {
      const e = latestOn(d), v = e?.[k];
      if (v == null) return;   // gap: not logged
      const h = v === 0 ? 1.5 : (v / 3) * (rowH - 6);
      g += `<rect x="${(x(i) + cw * 0.15).toFixed(1)}" y="${(y - h).toFixed(1)}" width="${Math.max(1.2, cw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1" class="${v === 0 ? 'fx-z' : 'fx-b'}"/>`;
    });
  });
  // routine completion
  y += rowH;
  g += `<text x="0" y="${y - 7}" class="fx-cl">Routine</text><line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="fx-cg"/>`;
  days.forEach((d, i) => { const c = ['am', 'pm'].map(s => routineCount(d, s)), tot = c[0].total + c[1].total, done = c[0].done + c[1].done, marked = done + c[0].skipped + c[1].skipped;
    if (!tot || !marked) return; const h = Math.max(1.5, done / tot * (rowH - 6));
    g += `<rect x="${(x(i) + cw * 0.15).toFixed(1)}" y="${(y - h).toFixed(1)}" width="${Math.max(1.2, cw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1" class="fx-r"/>`; });
  y += 14;
  g += `<text x="${L}" y="${y}" class="fx-cl">${fmtShort(days[0])}</text><text x="${W}" y="${y}" text-anchor="end" class="fx-cl">${fmtShort(days[n - 1])}</text>`;
  return `<svg class="fx-chart" viewBox="0 0 ${W} ${y + 4}" role="img" aria-label="Skin and routine trend, ${n} days">${g}</svg>`;
}
export function trendsView() {
  const today = dkey(), days = range(addDays(today, -(span - 1)), today);
  const logged = new Set(F.skin.filter(s => s.date >= days[0]).map(s => s.date)).size;
  const counts = F.skin.filter(s => s.date >= days[0] && s.count != null).sort((a, b) => a.date.localeCompare(b.date));
  const st = routineStats(days[0], today), ev = productEvents(days[0], today);
  const entries = [...F.skin].sort((a, b) => (b.date + (b.t || 0)).localeCompare(a.date + (a.t || 0))).slice(0, 30);
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Skin & routine</span><h1>Trends</h1><p>Self-reported entries. Days without a check-in are gaps, not clear skin.</p></header>
  <div class="fx-seg">${[[7, '7 days'], [28, '4 weeks'], [84, '12 weeks']].map(([v, l]) => `<button class="${span === v ? 'on' : ''}" data-act="face.span" data-v="${v}">${l}</button>`).join('')}</div>
  <section class="fx-card"><header class="fx-head"><h2>${span === 7 ? 'This week' : span === 28 ? 'Four weeks' : 'Twelve weeks'}</h2><span class="fx-meta">${logged} of ${days.length} days logged</span></header>
    ${logged >= 2 ? trendChart(days) : `<p class="fx-empty">Not enough check-ins in this range yet. Two or more make a trend.</p>`}
    <div class="fx-legend"><span><i class="b"></i>Logged level (taller = more)</span><span><i class="z"></i>Logged as none</span><span><i class="c"></i>Photo check-in</span><span><i class="e"></i>Product started / stopped</span></div>
    ${st.tot ? `<p class="fx-fine">Routine: ${st.done} of ${st.tot} scheduled steps marked done${st.unmarked ? `, ${st.unmarked} not marked` : ''}.</p>` : ''}
    ${counts.length ? `<p class="fx-fine">Manual breakout counts (entered by hand): ${counts.map(s => `${s.count} on ${fmtShort(s.date)}`).join(' · ')}.</p>` : ''}
    ${ev.length ? `<p class="fx-fine">Product changes: ${ev.map(e => `${esc(e.p.name)} ${e.kind === 'start' ? 'started' : 'stopped'} ${fmtShort(e.d)}`).join(' · ')}. Timing next to symptoms doesn't show cause.</p>` : ''}
  </section>
  <section class="fx-card"><header class="fx-head"><h2>Entries</h2><button class="fx-link" data-act="face.skin">Log</button></header>
    ${entries.length ? entries.map(s => `<button class="fx-entry" data-act="face.editskin" data-id="${s.id}"><span class="fx-ed">${fmtShort(s.date)}</span>
      <span class="fx-et">${[['breakouts', 'Breakouts'], ['irritation', 'Irritation'], ['tender', 'Tender'], ['marks', 'Marks'], ['puffiness', 'Puffiness']].filter(([k]) => s[k] != null).map(([k, n]) => `${n}: <b>${lbl(k, s[k]).toLowerCase()}</b>`).join(' · ') || 'Notes only'}
      ${s.areas?.length ? `<small>${s.areas.map(areaName).join(', ')}</small>` : ''}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span>${I.chev}</button>`).join('') : '<p class="fx-empty">No entries yet.</p>'}
  </section></div>`;
}
reg('face.span', el => { span = +el.dataset.v; rerender(); });
reg('face.editskin', el => startSkin(el.dataset.id));

/* =================== PRODUCTS =================== */
const DOW1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const schedTxt = p => `${p.slots.map(s => s === 'am' ? 'Morning' : 'Evening').join(' + ')}${p.days?.length && p.days.length < 7 ? ' · ' + p.days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ') : ' · every day'}`;
export function productsView() {
  const today = dkey();
  const active = F.products.filter(p => !p.paused && (!p.stop || p.stop >= today)), paused = F.products.filter(p => p.paused && (!p.stop || p.stop >= today)), stopped = F.products.filter(p => p.stop && p.stop < today);
  const card = p => `<button class="fx-prod" data-act="face.editprod" data-id="${p.id}"><span class="fx-tt"><b>${esc(p.name)}${p.paused ? ' <span class="badge">Paused</span>' : ''}</b>
    <small>${esc([p.active, p.strength].filter(Boolean).join(' · ') || 'No active ingredient recorded')}</small><small>${schedTxt(p)} · since ${p.start ? fmtShort(p.start) : '—'}${p.stop ? ' · until ' + fmtShort(p.stop) : ''}</small>
    ${p.selfStarted ? `<small class="fx-gold">Started on your own · worth reviewing with a clinician</small>` : ''}</span>${I.chev}</button>`;
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Skincare</span><h1>Products</h1><p>Your own products and schedule. Nothing is pre-filled or recommended.</p></header>
  <button class="btn full" data-act="face.newprod">${I.plus}Add product</button>
  <section class="fx-card"><header class="fx-head"><h2>In use</h2><span class="fx-meta">${active.length}</span></header>${active.map(card).join('') || '<p class="fx-empty">No products yet. Add what you actually use, with the date you started.</p>'}</section>
  ${paused.length ? `<section class="fx-card"><header class="fx-head"><h2>Paused</h2></header>${paused.map(card).join('')}</section>` : ''}
  ${stopped.length ? `<section class="fx-card"><header class="fx-head"><h2>Stopped</h2></header>${stopped.map(card).join('')}</section>` : ''}
  <p class="fx-fine">This app doesn't combine active ingredients or tell you to start, stop or change a prescription. Product start and stop dates appear on your skin trends so you can review timing with a pharmacist or clinician.</p>
  </div>`;
}
function prodForm(p = {}) {
  const days = p.days?.length ? p.days : [0, 1, 2, 3, 4, 5, 6], slots = p.slots || ['pm'];
  sheet(p.id ? 'Edit product' : 'Add product', `
    <label class="field"><span>Name</span><input id="pf-n" value="${esc(p.name || '')}" placeholder="e.g. Gentle cleanser"></label>
    <div class="grid2"><label class="field"><span>Active ingredient (optional)</span><input id="pf-a" value="${esc(p.active || '')}"></label>
    <label class="field"><span>Strength (optional)</span><input id="pf-s" value="${esc(p.strength || '')}" placeholder="e.g. 2.5%"></label></div>
    <label class="field"><span>How you use it</span><input id="pf-h" value="${esc(p.how || '')}" placeholder="e.g. pea-size, after cleansing"></label>
    <div class="field"><span>When</span><div class="fx-chips">${[['am', 'Morning'], ['pm', 'Evening']].map(([k, l]) => `<label class="fx-chip chk"><input type="checkbox" class="pf-slot" value="${k}" ${slots.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
    <div class="field"><span>Days</span><div class="fx-days">${DOW1.map((d, i) => `<label><input type="checkbox" class="pf-day" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div></div>
    <div class="grid2"><label class="field"><span>Started</span><input id="pf-start" type="date" value="${p.start || dkey()}"></label>
    <label class="field"><span>Stopped (optional)</span><input id="pf-stop" type="date" value="${p.stop || ''}"></label></div>
    <label class="row check"><input type="checkbox" id="pf-self" ${p.selfStarted ? 'checked' : ''}><span class="grow">I started this on my own (not prescribed)</span></label>
    <label class="row check"><input type="checkbox" id="pf-pause" ${p.paused ? 'checked' : ''}><span class="grow">Paused for now</span></label>
    <label class="field"><span>Notes</span><input id="pf-notes" value="${esc(p.notes || '')}"></label>
    <button class="btn full big mt" data-act="face.saveprod" data-id="${p.id || ''}">Save</button>
    ${p.id ? `<button class="btn danger full mt" data-act="face.delprod" data-id="${p.id}">Delete product</button>` : ''}`);
}
reg('face.newprod', () => prodForm());
reg('face.editprod', el => prodForm(F.products.find(p => p.id === el.dataset.id)));
reg('face.saveprod', el => {
  const name = $('#pf-n').value.trim(); if (!name) return toast('Enter a name.');
  const slots = [...document.querySelectorAll('.pf-slot:checked')].map(x => x.value); if (!slots.length) return toast('Pick morning, evening or both.');
  let days = [...document.querySelectorAll('.pf-day:checked')].map(x => +x.value); if (!days.length) return toast('Pick at least one day.'); if (days.length === 7) days = null;
  const stop = $('#pf-stop').value || null, start = $('#pf-start').value || dkey();
  if (stop && stop < start) return toast('Stop date is before the start date.');
  const rec = { id: el.dataset.id || 'pr_' + uid(), name, active: $('#pf-a').value.trim(), strength: $('#pf-s').value.trim(), how: $('#pf-h').value.trim(), slots, days, start, stop,
    selfStarted: $('#pf-self').checked, paused: $('#pf-pause').checked, notes: $('#pf-notes').value.trim() };
  const i = F.products.findIndex(p => p.id === rec.id); if (i >= 0) F.products[i] = rec; else F.products.push(rec);
  saveFace(); closeSheet(); rerender(); toast('Saved');
});
reg('face.delprod', async el => {
  if (!(await confirmBox('Delete product', 'Delete this product and its schedule? If you stopped using it, setting a stop date keeps it on your timeline instead.', 'Delete', true))) return;
  F.products = F.products.filter(p => p.id !== el.dataset.id); saveFace(); closeSheet(); rerender();
});

/* =================== GROOMING =================== */
const GROOM_SUGGEST = [['Brow tidy', 14, 'Strays only, see the guide below.'], ['Shave or tidy facial hair', 3, ''], ['Lip balm', 1, ''], ['Nose and ear hair trim', 14, ''], ['Change pillowcase', 7, ''], ['Replace razor blade', 10, '']];
const GUIDES = [
  ['brow', I.brow, 'Eyebrow cleanup', ['Brush brows up with a clean spoolie in good, even light.', 'Only remove hairs that are clearly separate from the brow: between the brows and a few strays underneath.', 'Pluck one hair at a time in the direction it grows. Step back from the mirror often and compare sides.', 'Leave the top edge and the tail alone. Overplucked hairs can take months to grow back, sometimes thinner.', 'Trim long hairs that poke out after brushing up, rather than plucking them.', 'Skip spots that are irritated, broken or have an active breakout.']],
  ['shave', I.razor, 'Shaving and facial-hair tidying', ['Shave after a warm shower, or soften the hair with warm water for a minute or two.', 'Use a sharp blade and a gentle gel or cream. Light pressure, short strokes.', 'Going with the grain causes less irritation. Against the grain is closer but rougher on skin.', 'Shave around active breakouts. Don\'t shave over them.', 'Rinse with cool water and use an unscented moisturizer if your skin feels tight.', 'Change or rinse blades regularly. Dull blades drag and irritate.', 'Trimming to a short, even length is an option on days your skin is irritated.']],
  ['lips', I.lips, 'Lip care', ['Use a plain, fragrance-free balm or petroleum jelly, especially before bed and outdoors.', 'A balm with SPF helps outdoors on the job.', 'Avoid licking or picking dry lips.', 'Cracks at the corners or soreness that lasts more than a couple of weeks is worth showing a pharmacist or doctor.']],
];
export function groomingView() {
  const today = dkey(), on = F.grooming;
  const due = g => g.last ? daysBetween(g.last, today) - g.every : 0;
  const recent = latestSkin(), flare = recent && daysBetween(recent.date, today) <= 3 && (recent.irritation >= 1 || recent.tender >= 1 || recent.breakouts >= 2);
  const missing = GROOM_SUGGEST.filter(([n]) => !on.some(g => g.name === n));
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Small tasks</span><h1>Grooming</h1><p>Optional reminders with sensible frequencies. Nothing here is required.</p></header>
  <section class="fx-card"><header class="fx-head"><h2>Your tasks</h2><button class="fx-link" data-act="face.newgroom">Add</button></header>
    ${on.length ? on.map(g => { const d = due(g); return `<div class="fx-groom${g.on ? '' : ' off'}"><button class="fx-tt fx-plain" data-act="face.editgroom" data-id="${g.id}"><b>${esc(g.name)}</b><small>${!g.on ? 'Off' : d >= 0 ? (d === 0 ? 'Due today' : `Due ${d} day${d > 1 ? 's' : ''} ago`) : `In ${-d} day${d < -1 ? 's' : ''}`} · every ${g.every === 1 ? 'day' : g.every + ' days'}${g.last ? ' · last ' + fmtShort(g.last) : ''}</small></button>
      ${g.on ? `<button class="btn sm ${d >= 0 ? '' : 'ghost'}" data-act="face.groomdone" data-id="${g.id}">Done</button>` : ''}</div>`; }).join('') : '<p class="fx-empty">No tasks yet. Add one below or make your own.</p>'}
    ${missing.length ? `<div class="fx-sub">Quick add</div><div class="fx-chips">${missing.map(([n, e]) => `<button class="fx-chip" data-act="face.quickgroom" data-n="${esc(n)}" data-e="${e}">+ ${esc(n)} <i>every ${e === 1 ? 'day' : e + ' d'}</i></button>`).join('')}</div>` : ''}
  </section>
  ${GUIDES.map(([k, ic, t, items]) => `<details class="fx-card fx-guide"><summary><span>${ic}</span><b>${t}</b>${I.chev}</summary><ul class="fx-sum">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}
  <section class="fx-card"><header class="fx-head"><h2>Gua sha</h2><label class="fx-toggle"><input type="checkbox" ${F.settings.guaSha ? 'checked' : ''} data-chg="face.guasha"><span>Track</span></label></header>
    <p class="fx-empty" style="margin-bottom:8px">A smooth tool glided over the face with oil or moisturizer. Some people like it as a relaxing routine and it may briefly reduce puffiness. It isn't an acne treatment, it won't permanently reshape your face, and it won't sharpen your jaw.</p>
    <ul class="fx-sum"><li>Light pressure, always on a slick surface. Never scrape dry skin.</li><li>Skip active breakouts, broken, irritated or sunburned skin.</li><li>Clean the tool after each use.</li><li>Stop if you notice bruising, burning or more redness afterward.</li></ul>
    ${F.settings.guaSha && flare ? `<div class="fx-warn">You logged ${[recent.irritation >= 1 && 'irritation', recent.tender >= 1 && 'tender bumps', recent.breakouts >= 2 && 'breakouts'].filter(Boolean).join(', ')} on ${fmtShort(recent.date)}. Skip those areas, or skip today. This is a reminder, not medical advice.</div>` : ''}
  </section></div>`;
}
function groomForm(g = {}) {
  sheet(g.id ? 'Edit task' : 'New task', `<label class="field"><span>Task</span><input id="gf-n" value="${esc(g.name || '')}" placeholder="e.g. Brow tidy"></label>
    <div class="field"><span>Every</span><div class="fx-chips">${[[1, 'Day'], [3, '3 days'], [7, 'Week'], [14, '2 weeks'], [30, 'Month']].map(([v, l]) => `<button class="fx-chip${(g.every || 7) === v ? ' on' : ''}" data-act="face.gevery" data-v="${v}">${l}</button>`).join('')}</div>
    <input id="gf-e" type="number" inputmode="numeric" min="1" value="${g.every || 7}" aria-label="Days between" class="mt"></div>
    <label class="field"><span>Note</span><input id="gf-note" value="${esc(g.note || '')}"></label>
    ${g.id ? `<label class="row check"><input type="checkbox" id="gf-on" ${g.on ? 'checked' : ''}><span class="grow">Reminder on</span></label>` : ''}
    <button class="btn full big mt" data-act="face.savegroom" data-id="${g.id || ''}">Save</button>
    ${g.id ? `<button class="btn danger full mt" data-act="face.delgroom" data-id="${g.id}">Delete task</button>` : ''}`);
}
reg('face.gevery', el => { $('#gf-e').value = el.dataset.v; el.parentElement.querySelectorAll('.fx-chip').forEach(b => b.classList.toggle('on', b === el)); });
reg('face.newgroom', () => groomForm());
reg('face.editgroom', el => groomForm(F.grooming.find(g => g.id === el.dataset.id)));
reg('face.quickgroom', el => { F.grooming.push({ id: 'g_' + uid(), name: el.dataset.n, every: +el.dataset.e, last: null, note: '', on: true }); saveFace(); rerender(); toast('Task added'); });
reg('face.savegroom', el => {
  const name = $('#gf-n').value.trim(); if (!name) return toast('Enter a task.');
  const every = Math.max(1, Math.round(num($('#gf-e').value) || 7));
  const g = F.grooming.find(x => x.id === el.dataset.id);
  if (g) Object.assign(g, { name, every, note: $('#gf-note').value.trim(), on: $('#gf-on').checked });
  else F.grooming.push({ id: 'g_' + uid(), name, every, last: null, note: $('#gf-note').value.trim(), on: true });
  saveFace(); closeSheet(); rerender(); toast('Saved');
});
reg('face.delgroom', el => { F.grooming = F.grooming.filter(g => g.id !== el.dataset.id); saveFace(); closeSheet(); rerender(); });
regChg('face.guasha', el => {
  F.settings.guaSha = el.checked;
  if (el.checked && !F.grooming.some(g => g.guasha)) F.grooming.push({ id: 'g_' + uid(), name: 'Gua sha (optional)', every: 2, last: null, note: 'Light pressure, on a slick surface. Skip irritated areas.', on: true, guasha: true });
  if (!el.checked) F.grooming = F.grooming.filter(g => !g.guasha);
  saveFace(); rerender();
});

/* =================== WEEKLY REVIEW =================== */
let revWeek = null;
function buildReview(mon) {
  const end = addDays(mon, 6) < dkey() ? addDays(mon, 6) : dkey();
  const sk = F.skin.filter(s => s.date >= mon && s.date <= end), cks = F.checkins.filter(c => c.date >= mon && c.date <= end);
  const recorded = [`Skin check-ins: ${sk.length}${sk.length ? ` (${sk.map(s => fmtShort(s.date)).join(', ')})` : ''}.`, ...contextBetween(mon, end).slice(sk.length ? 1 : 1)];
  recorded.unshift(cks.length ? `Weekly photos taken ${cks.map(c => fmtShort(c.date)).join(', ')}.` : 'No weekly photos this week.');
  const an = F.analyses.filter(a => cks.some(c => c.id === a.b)).sort((x, y) => y.at - x.at)[0];
  const visible = an ? { from: an, lines: [an.result.summary, ...an.result.observations.filter(o => o.change !== 'not assessable').map(o => `${o.area}: ${o.change}. ${o.detail}`)] } : null;
  const limits = [];
  if (sk.length < 2) limits.push('Fewer than two skin check-ins, so the week is hard to read.');
  limits.push('Scales are your own ratings, not measurements.');
  if (an) limits.push(...an.result.limitations);
  else if (cks.length) limits.push('No photo analysis was saved for this week. You can run one from Compare.');
  const unlogged = range(mon, end).filter(k => !(S.days[k]?.food || []).length).length;
  if (unlogged) limits.push(`${unlogged} day${unlogged > 1 ? 's' : ''} with no food entries. That's missing data, not low intake.`);
  return { id: 'rv_' + uid(), week: mon, at: Date.now(), recorded, visible, limits, steps: suggestions().map(s => ({ t: s.t, d: s.d, uncertain: !!s.uncertain })) };
}
export function reviewView() {
  const mon = revWeek || mondayOf(), weeks = [0, 1, 2, 3].map(n => addDays(mondayOf(), -7 * n));
  const saved = F.reviews.filter(r => r.week === mon).sort((a, b) => b.at - a.at)[0];
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Week of ${fmtShort(mon)}</span><h1>Weekly review</h1><p>Built from your records on this phone. It doesn't use AI credits.</p></header>
  <div class="fx-seg">${weeks.map((w, i) => `<button class="${w === mon ? 'on' : ''}" data-act="face.revweek" data-w="${w}">${i === 0 ? 'This week' : i === 1 ? 'Last week' : fmtShort(w)}</button>`).join('')}</div>
  ${saved ? `<section class="fx-card"><header class="fx-head"><h2>What was recorded</h2><span class="fx-meta">Saved ${new Date(saved.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></header><ul class="fx-sum">${saved.recorded.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>
    <section class="fx-card"><header class="fx-head"><h2>Possible visible changes</h2>${saved.visible ? '<span class="badge">AI</span>' : ''}</header>
      ${saved.visible ? `<ul class="fx-sum">${saved.visible.lines.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p class="fx-fine">From the saved analysis of ${fmtShort(F.checkins.find(c => c.id === saved.visible.from.a)?.date || saved.week)} vs ${fmtShort(F.checkins.find(c => c.id === saved.visible.from.b)?.date || saved.week)}.</p>` : `<p class="fx-empty" style="margin:0">No photo analysis for this week. "No clear change" is also a normal result.</p>`}</section>
    <section class="fx-card"><header class="fx-head"><h2>Limitations</h2></header><ul class="fx-sum">${saved.limits.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>
    <section class="fx-card"><header class="fx-head"><h2>Next steps</h2><span class="fx-meta">Up to three</span></header>
      ${saved.steps.length ? `<ol class="fx-steps">${saved.steps.map(s => `<li><b>${esc(s.t)}</b>${s.uncertain ? ' <span class="badge">Uncertain</span>' : ''}<span>${s.d}</span></li>`).join('')}</ol>` : '<p class="fx-empty" style="margin:0">Nothing to change. Keep logging the way you are.</p>'}</section>
    <button class="btn ghost full" data-act="face.genreview" data-w="${mon}">Regenerate from current records</button>`
  : `<section class="fx-card"><p class="fx-empty">Generate a short review of what you recorded this week: skin, routine, photos and context from Fuel, Training and Recovery, with up to three next steps.</p>
      <button class="btn full" data-act="face.genreview" data-w="${mon}">Generate review</button></section>`}
  </div>`;
}
reg('face.revweek', el => { revWeek = el.dataset.w; rerender(); });
reg('face.genreview', el => { const r = buildReview(el.dataset.w); F.reviews = F.reviews.filter(x => x.week !== r.week); F.reviews.push(r); saveFace(); rerender(); toast('Review saved'); });

/* =================== DATA & PRIVACY =================== */
export function dataView() {
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Face</span><h1>Data & privacy</h1><p>Where your photos and skin records live.</p></header>
  <section class="fx-card"><header class="fx-head"><h2>On this phone only</h2><span class="fx-ic">${I.shield}</span></header>
    <ul class="fx-sum"><li>Photos, skin check-ins, products and analyses are stored in this browser's storage on this device.</li>
    <li>They are not synced to your account and not included in the main backup or Drive backup.</li>
    <li>Clearing Chrome's site data, uninstalling the app or losing the phone removes them. Export a file regularly to keep a copy.</li>
    <li>Photos only leave the phone when you tap Analyze, after a screen that lists exactly what is sent.</li></ul>
    <p class="fx-fine" id="fx-usage">Checking storage…</p></section>
  <section class="fx-card"><header class="fx-head"><h2>Export & import</h2></header>
    <p class="fx-empty">The export file includes records, photos and saved analyses. It can be large. Keep it somewhere private.</p>
    <div class="btnrow"><button class="btn" data-act="face.export">Export file</button><label class="btn ghost">Import file<input type="file" accept="application/json,.json" hidden data-chg="face.import"></label></div>
    <p class="fx-fine">Importing checks the file first and shows what it contains before replacing anything.</p></section>
  <section class="fx-card"><header class="fx-head"><h2>Delete</h2></header>
    <p class="fx-empty">Delete single photos or check-ins from the Timeline. To remove everything in Face, including photos, use reset. The rest of The System isn't touched.</p>
    <button class="btn danger full" data-act="face.reset">Reset Face module</button></section></div>`;
}
export async function mountData(root) {
  const el = root.querySelector('#fx-usage'); if (!el) return;
  const n = (await photoKeys()).length;
  let usage = '';
  try { const e = await navigator.storage?.estimate?.(); if (e) usage = ` Browser storage used by this app: about ${e.usage < 1048576 ? fmt(e.usage / 1024) + ' KB' : r1(e.usage / 1048576) + ' MB'}.`; } catch { }
  el.textContent = `${n} photo${n === 1 ? '' : 's'} stored.${usage}`;
}
reg('face.export', async () => {
  toast('Preparing export…');
  const photos = {};
  for (const id of await photoKeys()) { const b = await getPhoto(id); if (b) photos[id] = { type: b.type || 'image/jpeg', data: await blobToBase64(b) }; }
  await flushFace();
  downloadText(`the-system-face-${dkey()}.json`, JSON.stringify({ app: 'the-system-face', v: 1, exportedAt: new Date().toISOString(), face: JSON.parse(JSON.stringify(F)), photos }));
  toast('Export downloaded');
});
export function validateImport(d) {
  if (!d || d.app !== 'the-system-face' || d.v !== 1 || !d.face || typeof d.face !== 'object') return 'This isn’t a Face export from The System.';
  for (const k of ['checkins', 'skin', 'products', 'grooming', 'analyses']) if (d.face[k] != null && !Array.isArray(d.face[k])) return `The file’s “${k}” section is damaged.`;
  const ids = new Set(Object.keys(d.photos || {}));
  const missing = (d.face.checkins || []).flatMap(c => Object.values(c.photos || {}).filter(Boolean)).filter(id => !ids.has(id));
  if (missing.length) return `The file is missing ${missing.length} photo${missing.length > 1 ? 's' : ''} its check-ins refer to.`;
  for (const p of Object.values(d.photos || {})) if (!p || typeof p.data !== 'string') return 'A photo in the file is damaged.';
  return null;
}
regChg('face.import', async el => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  let d; try { d = JSON.parse(await f.text()); } catch { return toast('That file isn’t readable JSON.'); }
  const err = validateImport(d); if (err) return toast(err);
  const fc = d.face;
  if (!(await confirmBox('Replace Face data?', `The file has <b>${(fc.checkins || []).length}</b> photo check-ins (${Object.keys(d.photos || {}).length} photos), <b>${(fc.skin || []).length}</b> skin entries, <b>${(fc.products || []).length}</b> products and <b>${(fc.analyses || []).length}</b> saved analyses.<br><br>This replaces the Face data on this phone. The rest of The System isn't changed.`, 'Replace', true))) return;
  await wipeFace();
  for (const [id, p] of Object.entries(d.photos || {})) { const bin = Uint8Array.from(atob(p.data), c => c.charCodeAt(0)); await putPhoto(new Blob([bin], { type: p.type || 'image/jpeg' }), id); }
  replaceFace(fc); await flushFace(); rerender(); toast('Face data imported');
});
reg('face.reset', async () => {
  if (!(await confirmBox('Reset Face?', 'This deletes all Face photos, skin check-ins, products, grooming tasks, analyses and reviews on this phone. Export first if you want a copy.', 'Continue', true))) return;
  if (!(await confirmBox('Are you sure?', 'This can’t be undone. Your food, water, training and other records stay as they are.', 'Delete Face data', true))) return;
  await wipeFace(); nav.sub.face = null; rerender(); toast('Face module reset');
});
