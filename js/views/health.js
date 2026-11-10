// HEALTH: training (sets this week, split, progress, history), recovery, pills & meds, symptoms, vitals,
// doctor visit prep, emergency card, news. Body, DEXA, labs, records and photos live in body.js.
import { S, save } from '../state.js';
import * as E from '../engine.js';
import { $, esc, uid, dkey, addDays, parseKey, DOW, fmt, num, r1, niceDate, lineChart } from '../util.js';
import { reg, regChg, nav, rerender } from '../core.js';
import { notice, confirmBox, sheet, closeSheet, toast, busy, sheetOpen } from '../ui.js';
import * as H from '../data/health-data.js';
import * as F from '../files.js';
import * as Body from './body.js';

const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const norm = s => String(s || '').trim().toLowerCase();
const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);
const HS = () => S.health;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
const fmtD = (k, o = { month: 'short', day: 'numeric', year: 'numeric' }) => parseKey(k).toLocaleDateString('en-US', o);

/* ---------- navigation inside Health ---------- */
export function open(v) { nav.sub.health = v; history.pushState({ hsub: v }, '', '#health'); rerender(); window.scrollTo(0, 0); }
reg('h.open', el => { closeSheet(); open(el.dataset.v); });
reg('h.back', () => { if (history.state?.hsub) history.back(); else { nav.sub.health = null; rerender(); } });
window.addEventListener('popstate', () => {
  if (sheetOpen()) { closeSheet(); if (nav.tab === 'health' && nav.sub.health) history.pushState({ hsub: nav.sub.health }, '', '#health'); return; }
  if (nav.tab === 'health' && nav.sub.health) { nav.sub.health = null; rerender(); window.scrollTo(0, 0); }
});

const TILES = [
  ['training', '🏋️', 'Training', 'Sets, split, progress, history'], ['pills', '💊', 'Pills & meds', 'Morning · pre-workout · night'],
  ['body', '⚖️', 'Weight & size', 'Weigh-ins, tape measurements'], ['dexa', '🦴', 'DEXA scans', 'Upload scans, lean vs fat'],
  ['labs', '🧪', 'Lab results', 'Bloodwork with flags'], ['records', '📁', 'Records', 'Photos & PDFs of reports'],
  ['symptoms', '🤒', 'Symptoms', 'Log how you feel'], ['vitals', '❤️', 'Sleep & vitals', 'Sleep, HRV, heart rate, BP'],
  ['photos', '📸', 'Progress photos', 'Side-by-side changes'], ['visit', '📋', 'Doctor visit prep', 'One-page summary'],
  ['emergency', '🚑', 'Emergency card', 'Allergies, meds, contact'], ['news', '📰', 'News & research', 'Newest studies'],
];

const SUB = {};
export function render() {
  const v = nav.sub.health;
  return `<div class="wrap">${v && SUB[v] ? `<button class="linkbtn back" data-act="h.back">‹ Health</button>${SUB[v]()}` : hub()}</div>`;
}
export function mount(root) { F.hydrate(root); if (nav.sub.health === 'news') maybeRefreshNews(); }

/* ================= HUB ================= */
function hub() {
  const k = dkey(), slot = currentSlot(), items = slotItems(slot), log = HS().stackLog[k] || {};
  const ck = HS().checkins[k];
  const flagged = Body.latestLabs().filter(l => l.flag !== 'ok').length;
  return `
  <div class="inline"><input id="h-search" placeholder="Search your health history" aria-label="Search your health history"><button class="btn" data-act="h.search">Search</button></div>
  ${trainingPanel(true)}
  <section class="panel"><div class="ptitle"><span>Recovery</span></div>${recoveryBody(ck, readiness(ck, k))}</section>
  <section class="panel"><div class="ptitle"><span>${H.SLOTS[slot]} pills</span></div>
    <div class="note" style="margin-top:-8px">${slotTime(slot)}</div>
    <div class="qlist mt">${items.map(it => pillRow(it, log)).join('') || '<div class="empty">Nothing scheduled right now.</div>'}</div>
    <button class="btn ghost full mt" data-act="h.open" data-v="pills">All pills & meds</button></section>
  ${flagged ? `<button class="banner gold" data-act="h.open" data-v="labs">🧪 ${flagged} lab value${flagged > 1 ? 's' : ''} outside the typical range · review</button>` : ''}
  <div class="htiles">${TILES.map(([v, ic, n, s]) => `<button class="htile" data-act="h.open" data-v="${v}"><span class="ic" aria-hidden="true">${ic}</span><b>${n}</b><span>${s}</span></button>`).join('')}</div>
  ${insights()}`;
}

/* ================= TRAINING ================= */
function todayCard() {
  const k = dkey(), wd = new Date().getDay(), key = S.settings.split[wd], tpl = key && S.templates[key];
  if (S.activeWorkout) return `<div class="bigline"><div><b>${esc(S.activeWorkout.name)}</b><span> · in progress</span></div></div><button class="btn full big" data-act="nav.go" data-tab="train">Resume session</button>`;
  const done = !!S.days[k]?.workoutDone;
  if (!tpl) return `<div class="bigline"><div><b>Rest day</b><span> · ${DOW[wd]}</span></div></div><div class="note" style="margin-top:0">Recovery is where you grow. Eat your targets and get to bed on time.</div><button class="btn ghost full mt" data-act="train.start">Train anyway</button>`;
  return `<div class="bigline"><div><b>${esc(tpl.name)}</b><span> · ${DOW[wd]}</span></div></div>
    <div class="note" style="margin-top:0">${tpl.exercises.length ? tpl.exercises.map(e => esc(e.name)).join(' · ') : 'No exercises saved for this day yet. Open Training to fill it.'}</div>
    ${done ? `<div class="donebox">Session complete. Quest cleared.</div><button class="btn ghost full mt" data-act="train.start" data-tpl="${key}">Log another session</button>`
      : `<button class="btn full big mt" data-act="train.start" data-tpl="${key}">Start ${esc(tpl.name)} session</button>`}`;
}
const mondayKey = () => { const k = dkey(); return addDays(k, -((parseKey(k).getDay() + 6) % 7)); };
function weekVolume() {
  const mon = mondayKey(), v = Object.fromEntries(Object.keys(H.MUSCLES).map(m => [m, 0])), unknown = new Map();
  const add = (name, n) => { if (!n) return; const c = H.classify(name, HS().exMuscles); if (!c) { unknown.set(name, (unknown.get(name) || 0) + n); return; } v[c.m] += n; c.s.forEach(m => { v[m] += n * 0.5; }); };
  S.workouts.filter(w => w.date >= mon).forEach(w => w.exercises.forEach(e => add(e.name, e.sets.length)));
  if (S.activeWorkout && S.activeWorkout.date >= mon) S.activeWorkout.exercises.forEach(e => add(e.name, e.sets.filter(s => s.done).length));
  return { v, unknown };
}
function volumeBars() {
  const { v, unknown } = weekVolume(), max = 24;
  return `${Object.keys(H.MUSCLES).map(m => {
    const [lo, hi] = H.VOL_TARGET[m] || H.VOL_TARGET.default, val = v[m];
    const col = val >= lo ? (val > hi ? 'var(--gold)' : 'var(--green)') : 'var(--muted)';
    return `<div class="vrow"><span>${H.MUSCLES[m]}</span><div class="vtrack"><div class="vband" style="left:${lo / max * 100}%;width:${(hi - lo) / max * 100}%"></div><div class="vfill" style="width:${clamp(val / max * 100, 0, 100)}%;background:${col}"></div></div><b>${val % 1 ? r1(val) : val}</b></div>`;
  }).join('')}
  <div class="note">Shaded band = target sets per week. Green = in range. Direct sets count 1, assisting sets ½. Week starts Monday.</div>
  ${unknown.size ? `<div class="alert">Not counted yet. Tap to pick the muscle: ${[...unknown.keys()].map(n => `<button class="pill" data-act="h.assign" data-name="${esc(n)}">${esc(n)}</button>`).join(' ')}</div>` : ''}`;
}
reg('h.assign', el => {
  const name = el.dataset.name;
  sheet(`Which muscle does “${name}” train?`, `<div class="chipgrid">${Object.entries(H.MUSCLES).map(([k, n]) => `<button class="pill" data-act="h.assigngo" data-name="${esc(name)}" data-m="${k}">${n}</button>`).join('')}</div>`);
});
reg('h.assigngo', el => { HS().exMuscles[norm(el.dataset.name)] = el.dataset.m; save(); closeSheet(); rerender(); toast('Saved'); });

function historyRows(n) {
  return S.workouts.length ? [...S.workouts].reverse().slice(0, n).map(w => {
    const sets = w.exercises.reduce((a, x) => a + x.sets.length, 0), vol = w.exercises.reduce((a, x) => a + x.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
    return `<button class="row btnrowitem" data-act="train.history" data-id="${w.id}"><div class="grow"><div class="rt sm">${esc(w.name)}</div>
      <div class="rs">${niceDate(w.date)} · ${sets} sets · ${fmt(vol)} lb</div></div><span class="rs">›</span></button>`;
  }).join('') : '<div class="empty">No sessions yet.</div>';
}
function trainingPanel(compact) {
  return `<section class="panel"><div class="ptitle"><span>Training</span></div>${todayCard()}</section>
  <section class="panel"><div class="ptitle"><span>Sets this week</span></div>${volumeBars()}</section>
  <section class="panel"><div class="ptitle"><span>History</span></div>${historyRows(compact ? 3 : 15)}
    ${compact ? `<button class="btn ghost full mt" data-act="h.open" data-v="training">Split, progress & full history</button>` : ''}</section>`;
}
SUB.training = () => {
  const wd = new Date().getDay();
  const empties = Object.entries(S.templates).filter(([k, t]) => !t.exercises.length && H.STARTER[k]);
  const names = [...new Set(S.workouts.flatMap(w => w.exercises.map(e => e.name)))].sort();
  const sel = nav.sub.trainEx && names.includes(nav.sub.trainEx) ? nav.sub.trainEx : names[0];
  const pts = sel ? S.workouts.filter(w => w.exercises.some(e => norm(e.name) === norm(sel))).map(w => {
    const ex = w.exercises.find(e => norm(e.name) === norm(sel));
    return { x: niceDate(w.date), y: r1(Math.max(...ex.sets.map(s => e1rm(s.w, s.r)))) };
  }).filter(p => p.y > 0).slice(-20) : [];
  return `${trainingPanel(false)}
  <section class="panel"><div class="ptitle"><span>Weekly split</span></div>
    ${[1, 2, 3, 4, 5, 6, 0].map(d => { const tk = S.settings.split[d], t = tk && S.templates[tk];
      return `<div class="row${d === wd ? ' cur' : ''}"><span class="dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}</span>
        <span class="grow rt sm">${t ? esc(t.name) : '<span class="muted">Rest</span>'}</span>
        ${t ? `<span class="rs">${t.exercises.length ? `${t.exercises.length} ex` : 'empty'}</span><button class="iconbtn" data-act="train.edittpl" data-tpl="${tk}" aria-label="Edit ${esc(t.name)}">✎</button>` : ''}</div>`; }).join('')}
    ${empties.length ? `<button class="btn full mt" data-act="h.fillstarter">Fill ${empties.map(([, t]) => esc(t.name)).join(', ')} with starter workouts</button><div class="note">Picked for a tall, long-limbed lifter. Edit them anytime with ✎.</div>` : ''}
    <div class="note">Change which day is which in Profile → Settings.</div></section>
  <section class="panel"><div class="ptitle"><span>Progress</span></div>
    ${names.length ? `<select data-chg="train.prog" aria-label="Exercise">${names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <div class="sub mt">Estimated 1-rep max (lb), best set each session</div>${lineChart(pts)}
      ${S.prs[norm(sel)] ? `<div class="note">Best: ${S.prs[norm(sel)].w} lb × ${S.prs[norm(sel)].r} on ${niceDate(S.prs[norm(sel)].date)}</div>` : ''}
      ${H.TIPS[norm(sel)] ? `<div class="note">💡 ${esc(H.TIPS[norm(sel)])}</div>` : ''}`
      : '<div class="empty">Finish a session to start tracking progress.</div>'}</section>
  <section class="panel"><div class="ptitle"><span>Why it works</span></div>${H.SCIENCE.map(([t, d]) => `<p class="para"><b>${t}.</b> <span class="muted">${d}</span></p>`).join('')}</section>`;
};
reg('h.fillstarter', async () => {
  const empties = Object.entries(S.templates).filter(([k, t]) => !t.exercises.length && H.STARTER[k]);
  if (!(await confirmBox('Fill empty days', `Add starter workouts to ${empties.map(([, t]) => `<b>${esc(t.name)}</b>`).join(', ')}? Days that already have exercises stay as they are.`, 'Fill them'))) return;
  empties.forEach(([k, t]) => { t.exercises = H.STARTER[k].map(x => ({ id: uid(), ...x })); });
  save(); rerender(); toast('Starter workouts added');
});

/* ================= RECOVERY ================= */
export function readiness(c, k) {
  if (!c) return null;
  const sl = clamp((c.sleep || 0) / 8.5, 0, 1) * 100;
  const q = ((c.sq || 3) - 1) / 4 * 100, so = (5 - (c.sore || 3)) / 4 * 100, en = ((c.energy || 3) - 1) / 4 * 100, st = (5 - (c.stress || 3)) / 4 * 100;
  let s = sl * 0.35 + q * 0.15 + so * 0.15 + en * 0.2 + st * 0.15;
  if (c.hrv) {
    const prev = []; for (let i = 1; i <= 7; i++) { const x = HS().checkins[addDays(k, -i)]; if (x?.hrv) prev.push(x.hrv); }
    if (prev.length >= 3) { const base = prev.reduce((a, b) => a + b, 0) / prev.length; s += clamp((c.hrv / base - 1) * 100, -15, 10); }
  }
  return Math.round(clamp(s, 0, 100));
}
const rdColor = r => r >= 75 ? 'var(--green)' : r >= 55 ? 'var(--gold)' : 'var(--red)';
function scoreRing(v) {
  const R = 44, C = 2 * Math.PI * R;
  return `<svg class="ring" viewBox="0 0 100 100" aria-label="Recovery ${v} of 100"><circle cx="50" cy="50" r="${R}" class="ring-bg"/><circle cx="50" cy="50" r="${R}" class="ring-fg" style="stroke:${rdColor(v)}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v / 100)}"/><text x="50" y="50" class="ring-num">${v}</text><text x="50" y="66" class="ring-lbl">OF 100</text></svg>`;
}
function recoveryBody(ck, rd) {
  if (!ck) return `<div class="note" style="margin-top:0">Answer 5 quick questions each morning to get a recovery score.</div><button class="btn full mt" data-act="h.checkin">Start check-in</button>`;
  const txt = rd >= 75 ? 'Green light. Push hard today.' : rd >= 55 ? 'Train as planned. Don’t chase records if the weights feel slow.' : 'Recovery is low. Do one less set per exercise, or rest today. Prioritize sleep and carbs.';
  return `<div class="todayhead">${scoreRing(rd)}<div class="todayinfo"><div class="para">${txt}</div>${ck.sleep < 7 ? `<div class="para red">You slept ${ck.sleep} h. Aim for 8+.</div>` : ''}<button class="linkbtn" data-act="h.checkin">Edit check-in</button></div></div>`;
}
const scale = (id, val, lo, hi) => `<div class="scale">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${val === n ? 'on' : ''}" data-act="h.scale" data-id="${id}" data-v="${n}">${n}</button>`).join('')}</div><div class="scale-l"><span>${lo}</span><span>${hi}</span></div><input type="hidden" id="${id}" value="${val || ''}">`;
reg('h.scale', el => { $('#' + el.dataset.id).value = el.dataset.v; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); });
reg('h.checkin', () => {
  const c = HS().checkins[dkey()] || {};
  sheet('Morning check-in', `
    <label class="field"><span>Hours slept</span><input id="ck-sleep" type="number" inputmode="decimal" step="0.25" value="${c.sleep ?? ''}" placeholder="8"></label>
    <div class="field"><span>Sleep quality</span>${scale('ck-sq', c.sq, 'Poor', 'Great')}</div>
    <div class="field"><span>Muscle soreness</span>${scale('ck-sore', c.sore, 'None', 'Very sore')}</div>
    <div class="field"><span>Energy</span>${scale('ck-energy', c.energy, 'Drained', 'Wired')}</div>
    <div class="field"><span>Stress</span>${scale('ck-stress', c.stress, 'Calm', 'Very high')}</div>
    <details class="mt"><summary class="linkbtn">From your watch (optional) ›</summary>
      <div class="grid2"><label class="field"><span>HRV (ms)</span><input id="ck-hrv" type="number" inputmode="numeric" value="${c.hrv ?? ''}"></label>
      <label class="field"><span>Resting HR</span><input id="ck-rhr" type="number" inputmode="numeric" value="${c.rhr ?? ''}"></label>
      <label class="field"><span>Steps yesterday</span><input id="ck-steps" type="number" inputmode="numeric" value="${c.steps ?? ''}"></label>
      <label class="field"><span>Blood pressure</span><input id="ck-bp" placeholder="120/80" value="${esc(c.bp || '')}"></label></div></details>
    <div class="note">Simple self-ratings track recovery as well as most wearables (Saw et al., 2016 review).</div>
    <button class="btn full big mt" data-act="h.checkingo">Save check-in</button>`);
});
reg('h.checkingo', () => {
  const g = id => { const v = $('#' + id).value; return v === '' ? null : num(v); };
  const c = { sleep: g('ck-sleep'), sq: g('ck-sq'), sore: g('ck-sore'), energy: g('ck-energy'), stress: g('ck-stress'), hrv: g('ck-hrv'), rhr: g('ck-rhr'), steps: g('ck-steps'), bp: $('#ck-bp').value.trim() };
  if (c.sleep == null || !c.sq || !c.sore || !c.energy || !c.stress) return toast('Answer all 5 questions.');
  HS().checkins[dkey()] = c; save(); closeSheet(); rerender(); toast('Check-in saved');
});

/* ================= PILLS ================= */
const toMin = hm => { const [h, m] = String(hm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fmtMin = m => { m = ((m % 1440) + 1440) % 1440; const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
function slotMin(k) {
  const p = HS().profile, train = toMin(p.trainAt);
  if (k === 'mid') return train - 45;
  if (k === 'am') return train < 600 ? train + 90 : toMin(p.wake) + 30;   // morning lifter: breakfast comes after the gym
  return toMin(S.settings.bedtime) - 45;
}
export const slotOrder = () => ['am', 'mid', 'pm'].sort((a, b) => slotMin(a) - slotMin(b));
export function slotTime(k) { return `${k === 'am' ? 'With breakfast' : k === 'mid' ? '30–60 min before training' : '30–60 min before bed'} · about ${fmtMin(slotMin(k))}`; }
export function currentSlot() { const now = new Date().getHours() * 60 + new Date().getMinutes(); return slotOrder().find(k => now < slotMin(k) + 120) || 'pm'; }
export const suppCtx = () => { const v = S.health.labs.filter(l => l.m === 'vitd').sort((a, b) => a.d < b.d ? -1 : 1).pop(); return { kg: Body.curWeight() * 0.45359237, vitd: v ? v.v : null }; };
const isOn = s => HS().stackOn[s.id] ?? s.on;
export function slotItems(slot) {
  const ctx = suppCtx();
  const items = H.SUPPS.filter(s => s.slots.includes(slot) && isOn(s)).map(s => ({ key: s.id + '@' + slot, id: s.id, n: s.n, dose: s.dose(ctx), tier: s.tier, custom: false }));
  HS().meds.filter(m => m.slot === slot).forEach(m => items.push({ key: m.id + '@' + slot, id: m.id, n: m.n, dose: m.dose, tier: m.kind === 'rx' ? 'Rx' : 'Mine', custom: true }));
  return items;
}
export function pillRow(it, log) {
  const on = !!log[it.key];
  return `<div class="qrow${on ? ' done' : ''}"><button class="qmain" data-act="h.pill" data-key="${it.key}" aria-pressed="${on}">
    <span class="box">${on ? CHECK : ''}</span><span class="qtext"><span class="qt">${esc(it.n)}</span><span class="qsub">${esc(it.dose)}</span></span>
    <span class="qval"><span class="badge ${it.tier[0] === 'A' ? 'gold' : ''}">${esc(it.tier)}</span></span></button>
    <button class="qside" data-act="${it.custom ? 'h.editmed' : 'h.suppinfo'}" data-id="${it.id}" aria-label="${it.custom ? 'Edit' : 'Why take this'}">${it.custom ? '✎' : 'i'}</button></div>`;
}
export function stackPct(days = 7) {
  let tot = 0, done = 0;
  for (let i = 0; i < days; i++) { const d = addDays(dkey(), -i), log = HS().stackLog[d] || {}; ['am', 'mid', 'pm'].forEach(sl => slotItems(sl).forEach(it => { tot++; if (log[it.key]) done++; })); }
  return tot ? Math.round(done / tot * 100) : 0;
}
reg('h.pill', el => { const d = dkey(), k = el.dataset.key; HS().stackLog[d] = HS().stackLog[d] || {}; HS().stackLog[d][k] = !HS().stackLog[d][k]; save(); rerender(); });
SUB.pills = () => {
  const log = HS().stackLog[dkey()] || {}, off = H.SUPPS.filter(s => !isOn(s)), ctx = suppCtx();
  return `<section class="panel"><div class="ptitle"><span>Pills & meds</span></div>
    <div class="grid3 stats3" style="margin-top:0;border-top:0;padding-top:0"><div><div class="k">7-day</div><div class="v">${stackPct(7)}%</div></div><div><div class="k">30-day</div><div class="v">${stackPct(30)}%</div></div><div><div class="k">Body</div><div class="v sm">${Math.round(ctx.kg)} kg</div></div></div>
    <div class="note">Doses are set for your body. Tap <b>i</b> to see the evidence. <b>A</b> = strong evidence, <b>B</b> = good, <b>C</b> = optional.</div>
    <button class="btn ghost full mt" data-act="h.addmed">+ Add my own medicine or supplement</button></section>
  ${slotOrder().map(sl => `<section class="panel"><div class="ptitle"><span>${H.SLOTS[sl]}</span></div><div class="note" style="margin-top:-8px">${slotTime(sl)}</div>
    <div class="qlist mt">${slotItems(sl).map(it => pillRow(it, log)).join('') || '<div class="empty">Nothing here.</div>'}</div></section>`).join('')}
  ${off.length ? `<section class="panel"><div class="ptitle"><span>Optional · off</span></div>${off.map(s => `<div class="row"><div class="grow"><div class="rt sm">${esc(s.n)} <span class="badge">${s.tier}</span></div><div class="rs">${esc(s.dose(ctx))} · ${H.SLOTS[s.slots[0]]}</div></div><button class="btn ghost sm" data-act="h.suppinfo" data-id="${s.id}">Info</button><button class="btn sm" data-act="h.supptoggle" data-id="${s.id}">Turn on</button></div>`).join('')}</section>` : ''}
  <section class="panel"><div class="ptitle"><span>Not worth your money</span></div>${H.SKIP_LIST.map(([n, d]) => `<p class="para"><b>${n}:</b> <span class="muted">${d}</span></p>`).join('')}</section>
  <div class="note center">This isn’t medical advice. Check with your doctor if you take prescriptions, and get bloodwork so doses like vitamin D match your levels. Choose third-party tested products (NSF Certified for Sport, Informed Sport, USP).</div>`;
};
reg('h.suppinfo', el => {
  const s = H.SUPPS.find(x => x.id === el.dataset.id); if (!s) return;
  sheet(s.n, `<div class="bigline"><div><b>${esc(s.dose(suppCtx()))}</b></div></div><div class="sub">${s.slots.map(x => H.SLOTS[x]).join(' + ')} · evidence ${s.tier}</div>
    <p class="para mt"><b>Why.</b> ${esc(s.why)}</p><p class="para"><b>How.</b> ${esc(s.how)}</p><p class="para"><b>Good to know.</b> ${esc(s.note)}</p><p class="para"><b>What to buy.</b> ${esc(s.buy)}</p>
    <button class="btn ${isOn(s) ? 'ghost' : ''} full mt" data-act="h.supptoggle" data-id="${s.id}">${isOn(s) ? 'Turn off' : 'Turn on'}</button>`);
});
reg('h.supptoggle', el => { const s = H.SUPPS.find(x => x.id === el.dataset.id); HS().stackOn[s.id] = !isOn(s); save(); closeSheet(); rerender(); toast(isOn(s) ? 'Added to your schedule' : 'Removed from your schedule'); });
function medForm(m = {}) {
  sheet(m.id ? 'Edit medicine' : 'Add medicine or supplement', `
    <label class="field"><span>Name</span><input id="md-n" value="${esc(m.n || '')}" placeholder="e.g. Zinc"></label>
    <label class="field"><span>Dose</span><input id="md-d" value="${esc(m.dose || '')}" placeholder="e.g. 15 mg"></label>
    <div class="grid2"><label class="field"><span>When</span><select id="md-s">${Object.entries(H.SLOTS).map(([k, n]) => `<option value="${k}" ${m.slot === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field"><span>Type</span><select id="md-k"><option value="supp">Supplement</option><option value="rx" ${m.kind === 'rx' ? 'selected' : ''}>Prescription</option></select></label></div>
    <label class="field"><span>Notes</span><input id="md-note" value="${esc(m.note || '')}"></label>
    <button class="btn full mt" data-act="h.savemed" data-id="${m.id || ''}">Save</button>
    ${m.id ? `<button class="btn ghost danger full mt" data-act="h.delmed" data-id="${m.id}">Delete</button>` : ''}`);
}
reg('h.addmed', () => medForm());
reg('h.editmed', el => medForm(HS().meds.find(m => m.id === el.dataset.id)));
reg('h.savemed', el => {
  const n = $('#md-n').value.trim(); if (!n) return toast('Enter a name.');
  const m = { id: el.dataset.id || 'm_' + uid(), n, dose: $('#md-d').value.trim(), slot: $('#md-s').value, kind: $('#md-k').value, note: $('#md-note').value.trim() };
  HS().meds = HS().meds.filter(x => x.id !== m.id); HS().meds.push(m); save(); closeSheet(); rerender(); toast('Saved');
});
reg('h.delmed', el => { HS().meds = HS().meds.filter(m => m.id !== el.dataset.id); save(); closeSheet(); rerender(); });

/* ================= SYMPTOMS ================= */
const SYMPTOMS = ['Headache', 'Fatigue', 'Joint pain', 'Back pain', 'Very sore', 'Bloating / GI', 'Poor sleep', 'Low mood', 'Anxiety', 'Low appetite', 'Allergic reaction', 'Cold / sick'];
SUB.symptoms = () => {
  const all = [...HS().symptoms].sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t));
  const cnt = {}; all.filter(s => s.d >= addDays(dkey(), -30)).forEach(s => { cnt[s.n] = (cnt[s.n] || 0) + 1; });
  return `<section class="panel"><div class="ptitle"><span>How do you feel?</span></div><div class="chipgrid">${SYMPTOMS.map(s => `<button class="pill" data-act="h.symptom" data-n="${esc(s)}">${s}</button>`).join('')}<button class="pill" data-act="h.symptom" data-n="">+ Other</button></div></section>
  ${Object.keys(cnt).length ? `<section class="panel"><div class="ptitle"><span>Last 30 days</span></div>${Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([n, c]) => `<div class="vrow"><span>${esc(n)}</span><div class="vtrack"><div class="vfill" style="width:${clamp(c * 10, 5, 100)}%;background:var(--red)"></div></div><b>${c}×</b></div>`).join('')}${symptomInsight()}</section>` : ''}
  <section class="panel"><div class="ptitle"><span>History</span></div>${all.slice(0, 40).map(s => `<div class="row"><div class="grow"><div class="rt sm">${esc(s.n)} · ${s.sev}/10</div><div class="rs">${niceDate(s.d)} ${s.t || ''}${s.note ? ' · ' + esc(s.note) : ''}</div></div><button class="iconbtn red" data-act="h.delsymptom" data-id="${s.id}" aria-label="Delete">×</button></div>`).join('') || '<div class="empty">Nothing logged.</div>'}</section>`;
};
function symptomInsight() {
  const days = new Set(HS().symptoms.map(s => s.d)), ck = Object.entries(HS().checkins);
  const w = ck.filter(([d]) => days.has(d)), wo = ck.filter(([d]) => !days.has(d));
  if (w.length < 3 || wo.length < 3) return '';
  const avg = a => a.reduce((x, [, c]) => x + (c.sleep || 0), 0) / a.length, a1 = avg(w), a2 = avg(wo);
  return Math.abs(a1 - a2) < 0.4 ? '' : `<div class="donebox">On days you log symptoms you averaged <b>${r1(a1)} h</b> of sleep, vs <b>${r1(a2)} h</b> on other days.</div>`;
}
reg('h.symptom', el => {
  const n = el.dataset.n;
  sheet(n || 'Log a symptom', `${n ? `<input type="hidden" id="sy-n" value="${esc(n)}">` : `<label class="field"><span>Symptom</span><input id="sy-n"></label>`}
    <label class="field"><span>How bad? <b id="sy-v">5</b> / 10</span><input id="sy-sev" type="range" min="1" max="10" value="5" oninput="document.getElementById('sy-v').textContent=this.value"></label>
    <label class="field"><span>Notes (optional)</span><input id="sy-note" placeholder="Triggers, what helped…"></label>
    <button class="btn full big mt" data-act="h.symptomgo">Save</button>`);
});
reg('h.symptomgo', () => {
  const n = $('#sy-n').value.trim(); if (!n) return toast('Enter a symptom.');
  const now = new Date();
  HS().symptoms.push({ id: 's_' + uid(), d: dkey(), t: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), n, sev: +$('#sy-sev').value, note: $('#sy-note').value.trim() });
  save(); closeSheet(); rerender(); toast('Logged');
});
reg('h.delsymptom', el => { HS().symptoms = HS().symptoms.filter(s => s.id !== el.dataset.id); save(); rerender(); });

/* ================= VITALS ================= */
SUB.vitals = () => {
  const ck = Object.entries(HS().checkins).sort((a, b) => a[0].localeCompare(b[0])).slice(-60);
  const pts = key => ck.filter(([, c]) => c[key] != null).map(([d, c]) => ({ x: niceDate(d), y: c[key] }));
  const avg = key => { const v = ck.slice(-7).map(([, c]) => c[key]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const st = (lbl, v, d = 0) => `<div><div class="k">${lbl}</div><div class="v sm">${v == null ? '—' : d ? r1(v) : fmt(v)}</div></div>`;
  const bps = ck.filter(([, c]) => c.bp).slice(-8).reverse();
  return `<section class="panel"><div class="ptitle"><span>Sleep & vitals</span></div>
    <div class="grid2 stats3" style="margin-top:0;border-top:0;padding-top:0">${st('Avg sleep (h)', avg('sleep'), 1)}${st('Avg HRV', avg('hrv'))}${st('Resting HR', avg('rhr'))}${st('Avg steps', avg('steps'))}</div>
    <div class="note">From your morning check-in, averaged over 7 days. Copy HRV, heart rate, steps and blood pressure from your watch or cuff.</div><button class="btn full mt" data-act="h.checkin">Today’s check-in</button></section>
  <section class="panel"><div class="ptitle"><span>Sleep (hours)</span></div>${lineChart(pts('sleep'), { color: 'var(--gold)' })}<div class="note">Aim for 8–9 h. Most muscle repair happens in deep sleep.</div></section>
  <section class="panel"><div class="ptitle"><span>Recovery score</span></div>${lineChart(ck.map(([d, c]) => ({ x: niceDate(d), y: readiness(c, d) })), { color: 'var(--green)' })}</section>
  <section class="panel"><div class="ptitle"><span>HRV (ms)</span></div>${lineChart(pts('hrv'), { color: 'var(--green)' })}<div class="note">Compare only against your own baseline. More than 10% below your weekly average usually means you need more recovery.</div></section>
  <section class="panel"><div class="ptitle"><span>Resting heart rate</span></div>${lineChart(pts('rhr'), { color: 'var(--red)' })}</section>
  <section class="panel"><div class="ptitle"><span>Blood pressure</span></div>${bps.length ? bps.map(([d, c]) => `<div class="row"><span class="grow">${niceDate(d)}</span><b>${esc(c.bp)}</b></div>`).join('') : '<div class="empty">Add blood pressure in the check-in (optional).</div>'}</section>`;
};

/* ================= VISIT PREP ================= */
SUB.visit = () => {
  const p = HS().profile, Em = HS().emergency, labs = Body.latestLabs(), ctx = suppCtx();
  const meds = [...H.SUPPS.filter(isOn).map(s => `${s.n}: ${s.dose(ctx)} (${s.slots.map(x => H.SLOTS[x].toLowerCase()).join(' + ')})`), ...HS().meds.map(m => `${m.n}${m.dose ? ': ' + m.dose : ''} (${H.SLOTS[m.slot].toLowerCase()}${m.kind === 'rx' ? ', prescription' : ''})`)];
  const sym = HS().symptoms.filter(s => s.d >= addDays(dkey(), -30));
  const dx = [...HS().dexa].sort((a, b) => a.d.localeCompare(b.d)).pop();
  const ft = Math.floor(p.heightIn / 12), inch = r1(p.heightIn - ft * 12);
  return `<section class="panel noprint"><div class="ptitle"><span>Doctor visit prep</span></div>
    <label class="field"><span>Questions for your doctor</span><textarea id="v-notes" rows="4" data-chg="h.visitnotes" placeholder="e.g. Is my vitamin D dose right? Should I check ApoB?">${esc(HS().visitNotes)}</textarea></label>
    <div class="btnrow mt"><button class="btn" data-act="h.print">Print / PDF</button><button class="btn ghost" data-act="h.share">Share text</button></div></section>
  <section class="panel" id="visit-doc"><div class="ptitle"><span>Health summary</span></div>
    <div class="rt">${esc(Em.name || S.profile.name)}</div><div class="rs">Prepared ${fmtD(dkey(), { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    <div class="row mt"><span class="grow muted">Height · weight</span><b>${ft}'${inch}" · ${r1(Body.curWeight())} lb</b></div>
    <div class="row"><span class="grow muted">Body fat</span><b>${dx?.bf != null ? `${r1(dx.bf)}% (DEXA ${niceDate(dx.d)})` : `~${p.bf}% (self-reported)`}</b></div>
    <div class="row"><span class="grow muted">Goal</span><b>Lean bulk, +${p.goalRate} lb/week</b></div>
    ${Em.allergies ? `<div class="row"><span class="grow muted">Allergies</span><b>${esc(Em.allergies)}</b></div>` : ''}${Em.conditions ? `<div class="row"><span class="grow muted">Conditions</span><b>${esc(Em.conditions)}</b></div>` : ''}
    <div class="sub mt">Medicines & supplements</div>${meds.map(m => `<p class="para">• ${esc(m)}</p>`).join('') || '<p class="para muted">None</p>'}
    <div class="sub mt">Latest labs</div>${labs.length ? labs.map(l => `<p class="para">• ${esc(l.L?.n || l.m)}: <b>${r1(l.v)} ${l.L?.u || ''}</b> (${niceDate(l.d)})${l.flag !== 'ok' ? ` <b class="red">${l.flag.toUpperCase()}</b>` : ''}</p>`).join('') : '<p class="para muted">None recorded</p>'}
    <div class="sub mt">Symptoms, last 30 days</div>${sym.length ? sym.map(s => `<p class="para">• ${niceDate(s.d)}: ${esc(s.n)} (${s.sev}/10)${s.note ? ' · ' + esc(s.note) : ''}</p>`).join('') : '<p class="para muted">None logged</p>'}
    ${HS().visitNotes ? `<div class="sub mt">Questions</div><p class="para" style="white-space:pre-wrap">${esc(HS().visitNotes)}</p>` : ''}</section>`;
};
regChg('h.visitnotes', el => { HS().visitNotes = el.value; save(); rerender(); });
reg('h.print', () => { const t = $('#v-notes'); if (t) HS().visitNotes = t.value; save(); rerender(); setTimeout(() => window.print(), 150); });
reg('h.share', async () => {
  const t = $('#visit-doc')?.innerText || '';
  try { if (navigator.share) await navigator.share({ title: 'Health summary', text: t }); else { await navigator.clipboard.writeText(t); toast('Copied'); } } catch { }
});

/* ================= EMERGENCY ================= */
const EM_F = [['name', 'Full name'], ['dob', 'Date of birth'], ['blood', 'Blood type'], ['allergies', 'Allergies'], ['conditions', 'Medical conditions'], ['contact', 'Emergency contact (name + phone)'], ['notes', 'Other notes']];
SUB.emergency = () => {
  const Em = HS().emergency, meds = [...H.SUPPS.filter(isOn).map(s => s.n), ...HS().meds.map(m => m.n)].join(', ');
  return `<div class="ecard"><h2>🚑 Medical info</h2>${EM_F.filter(([k]) => Em[k]).map(([k, n]) => `<div class="erow"><span>${n}</span><b>${esc(Em[k])}</b></div>`).join('') || '<p>Fill in the form below.</p>'}
    ${meds ? `<div class="erow"><span>Takes</span><b>${esc(meds)}</b></div>` : ''}</div>
  <div class="note">Tip: screenshot this card and set it as your lock screen, or copy it into Android's built-in Emergency information.</div>
  <section class="panel"><div class="ptitle"><span>Edit card</span></div>${EM_F.map(([k, n]) => `<label class="field"><span>${n}</span><input id="em-${k}" value="${esc(Em[k])}"></label>`).join('')}<button class="btn full mt" data-act="h.saveem">Save card</button></section>`;
};
reg('h.saveem', () => { EM_F.forEach(([k]) => { HS().emergency[k] = $('#em-' + k).value.trim(); }); save(); rerender(); window.scrollTo(0, 0); toast('Saved'); });

/* ================= NEWS ================= */
let NEWS_LOADING = false; const ABS = {}, absOpen = {};
const strip = h => { const t = document.createElement('textarea'); t.innerHTML = String(h || '').replace(/<[^>]*>/g, ' '); return t.value.replace(/\s+/g, ' ').trim(); };
SUB.news = () => {
  const cats = [['all', 'All'], ['study', 'Studies'], ['training', 'Training'], ['nutrition', 'Nutrition'], ['supplements', 'Supplements'], ['sleep', 'Sleep']];
  const cat = nav.sub.newsCat || 'all', N = HS().news;
  let items = N ? N.items : [];
  if (cat === 'study') items = items.filter(i => i.kind === 'study'); else if (cat !== 'all') items = items.filter(i => i.cat === cat);
  const ago = N ? Math.round((Date.now() - N.at) / 60000) : null;
  return `<div class="chipgrid">${cats.map(([k, n]) => `<button class="pill${cat === k ? ' on' : ''}" data-act="h.newscat" data-c="${k}">${n}</button>`).join('')}</div>
  <div class="row" style="border:0"><span class="grow rs">${NEWS_LOADING ? 'Updating…' : ago != null ? `Updated ${ago < 60 ? ago + ' min' : Math.round(ago / 60) + ' h'} ago` : 'Not loaded yet'}</span><button class="btn ghost sm" data-act="h.newsrefresh">Refresh</button></div>
  <section class="panel">${items.length ? items.slice(0, 80).map(newsItem).join('') : (NEWS_LOADING ? busy('Loading the newest research…') : '<div class="empty">Tap Refresh to load the newest research. Needs internet.</div>')}</section>
  <div class="note">Studies are the newest randomized trials and meta-analyses from PubMed (US National Library of Medicine). Articles come from Stronger By Science and ScienceDaily. One study is one data point; meta-analyses carry the most weight.</div>`;
};
function newsItem(i) {
  const types = (i.types || []).map(t => /meta-analysis/i.test(t) ? '<span class="badge gold">Meta-analysis</span>' : /systematic review/i.test(t) ? '<span class="badge gold">Review</span>' : /randomized controlled trial/i.test(t) ? '<span class="badge">Randomized trial</span>' : '').join(' ');
  return `<article class="newsitem"><a class="nt" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>
    <div class="nm">${types} <span>${esc(i.source)}</span>${i.date ? ` · ${fmtD(i.date.slice(0, 10))}` : ''}</div>
    ${i.summary ? `<div class="ns">${esc(i.summary)}</div>` : ''}
    ${i.kind === 'study' ? `<button class="linkbtn" data-act="h.abstract" data-id="${i.pmid}">${absOpen[i.pmid] ? 'Hide summary' : 'Read summary'}</button>${absOpen[i.pmid] ? `<div class="abs">${ABS[i.pmid] ? esc(ABS[i.pmid]) : 'Loading…'}</div>` : ''}` : ''}</article>`;
}
reg('h.newscat', el => { nav.sub.newsCat = el.dataset.c; rerender(); });
reg('h.newsrefresh', () => refreshNews());
function maybeRefreshNews() { const N = HS().news; if (!NEWS_LOADING && (!N || Date.now() - N.at > 6 * 3600e3)) refreshNews(); }
async function refreshNews() {
  if (NEWS_LOADING) return; if (!navigator.onLine) return toast('You’re offline. Showing saved news.');
  NEWS_LOADING = true; rerender();
  const items = [], errs = [], today = dkey();
  try {
    const ids = {};
    for (const q of H.PUBMED_QUERIES) {
      const j = await (await fetch(`${H.EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=12&sort=pub_date&term=${encodeURIComponent(q.q)}`)).json();
      ids[q.cat] = j.esearchresult?.idlist || []; await new Promise(r => setTimeout(r, 400));
    }
    const all = [...new Set(Object.values(ids).flat())];
    if (all.length) {
      const s = await (await fetch(`${H.EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${all.join(',')}`)).json(), seen = new Set();
      for (const [cat, list] of Object.entries(ids)) for (const id of list) {
        const r = s.result?.[id]; if (!r || seen.has(id)) continue; seen.add(id);
        const h = (r.history || []).find(x => x.pubstatus === 'pubmed' || x.pubstatus === 'entrez');
        let date = (h ? h.date : r.sortpubdate || '').slice(0, 10).replace(/\//g, '-'); if (date > today) date = today;
        items.push({ kind: 'study', cat, pmid: id, title: strip(r.title), source: r.fulljournalname || r.source, date, types: r.pubtype || [], url: `https://pubmed.ncbi.nlm.nih.gov/${id}/` });
      }
    }
  } catch { errs.push('PubMed'); }
  await Promise.all(H.FEEDS.map(async f => {
    try {
      const j = await (await fetch(H.RSS2JSON + encodeURIComponent(f.url))).json(); if (j.status !== 'ok') throw 0;
      j.items.slice(0, 12).forEach(it => items.push({ kind: 'article', cat: f.cat, title: strip(it.title), source: f.name, date: (it.pubDate || '').slice(0, 10), url: it.link, summary: strip(it.description).slice(0, 240) }));
    } catch { errs.push(f.name); }
  }));
  if (items.length) { items.sort((a, b) => (b.date || '').localeCompare(a.date || '')); HS().news = { at: Date.now(), items }; save(); }
  NEWS_LOADING = false;
  if (errs.length) toast('Some sources didn’t load: ' + errs.join(', '));
  rerender();
}
reg('h.abstract', async el => {
  const id = el.dataset.id; absOpen[id] = !absOpen[id]; rerender();
  if (absOpen[id] && !ABS[id]) {
    try { ABS[id] = (await (await fetch(`${H.EUTILS}/efetch.fcgi?db=pubmed&id=${id}&rettype=abstract&retmode=text`)).text()).trim(); }
    catch { ABS[id] = 'Couldn’t load the summary. Tap the title to open it on PubMed.'; }
    rerender();
  }
});

/* ================= SEARCH & INSIGHTS ================= */
reg('h.search', () => {
  const q = norm($('#h-search').value); if (q.length < 2) return toast('Type at least 2 letters.');
  const hits = [];
  HS().records.forEach(r => { if (norm(`${r.title} ${r.cat} ${r.notes}`).includes(q)) hits.push([r.d, '📁 ' + r.title, r.cat, 'records']); });
  HS().labs.forEach(l => { const L = H.LABS.find(x => x.id === l.m), n = L ? L.n : l.m; if (norm(n).includes(q)) hits.push([l.d, '🧪 ' + n, `${l.v} ${L?.u || ''}`, 'labs']); });
  HS().symptoms.forEach(s => { if (norm(`${s.n} ${s.note}`).includes(q)) hits.push([s.d, '🤒 ' + s.n, `${s.sev}/10`, 'symptoms']); });
  HS().dexa.forEach(x => { if (norm(`dexa scan ${x.notes || ''}`).includes(q)) hits.push([x.d, '🦴 DEXA scan', `${r1(x.bf)}% body fat`, 'dexa']); });
  [...H.SUPPS.map(s => s.n), ...HS().meds.map(m => m.n)].forEach(n => { if (norm(n).includes(q)) hits.push(['', '💊 ' + n, 'Pills & meds', 'pills']); });
  S.workouts.forEach(w => { if (norm(w.name).includes(q) || w.exercises.some(e => norm(e.name).includes(q))) hits.push([w.date, '🏋️ ' + w.name, 'Workout', 'training']); });
  hits.sort((a, b) => b[0].localeCompare(a[0]));
  sheet(`Results for “${q}”`, hits.slice(0, 50).map(h => `<button class="row btnrowitem" data-act="h.open" data-v="${h[3]}"><div class="grow"><div class="rt sm">${esc(h[1])}</div><div class="rs">${h[0] ? niceDate(h[0]) + ' · ' : ''}${esc(h[2])}</div></div><span class="rs">›</span></button>`).join('') || '<div class="empty">Nothing found.</div>');
});
function insights() {
  const out = [], T = S.settings.targets;
  let pd = 0, n = 0; for (let i = 1; i <= 7; i++) { const t = E.totals(addDays(dkey(), -i)); if (t.kcal > 800) { n++; if (t.p >= T.p * 0.9) pd++; } }
  if (n >= 3) out.push(`You hit your protein goal on <b>${pd} of ${n}</b> logged days this week.`);
  const ck = Object.entries(HS().checkins).slice(-30);
  if (ck.length >= 6) {
    const good = ck.filter(([, c]) => c.sleep >= 8), bad = ck.filter(([, c]) => c.sleep < 7), avg = a => a.reduce((x, [d, c]) => x + readiness(c, d), 0) / a.length;
    if (good.length >= 2 && bad.length >= 2) out.push(`Recovery averages <b>${Math.round(avg(good))}</b> after 8+ h of sleep vs <b>${Math.round(avg(bad))}</b> after less than 7.`);
  }
  const rate = Body.weeklyRate(); if (rate != null && Body.trendSeries().length >= 14) out.push(`Weight trend: <b>${sgn(rate, 2)} lb/week</b> (goal +${HS().profile.goalRate}).`);
  if (Object.keys(HS().stackLog).length >= 3) out.push(`You took <b>${stackPct(7)}%</b> of your pills on schedule this week.`);
  const wk = S.workouts.filter(w => w.date >= addDays(dkey(), -6)).length; if (S.workouts.length) out.push(`<b>${wk}</b> training session${wk === 1 ? '' : 's'} in the last 7 days.`);
  return out.length ? `<section class="panel"><div class="ptitle"><span>Insights</span></div>${out.map(t => `<p class="para">• ${t}</p>`).join('')}</section>` : '';
}

Object.assign(SUB, Body.SUBVIEWS);
