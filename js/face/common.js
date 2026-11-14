// FACE shared helpers: icons, scales, dates, routine, context from The System, suggestions, navigation.
import { S } from '../state.js';
import { esc, dkey, addDays, parseKey, niceDate, r1 } from '../util.js';
import { nav, rerender } from '../core.js';
import { F } from './store.js';

export const I = {
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  gallery: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24"><path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12"/></svg>',
  fork: '<svg viewBox="0 0 24 24"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-2 2-2 6 0 8v10"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  pulse: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>',
  compare: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  bottle: '<svg viewBox="0 0 24 24"><path d="M9 2h6M10 2v3l-3 3v13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8l-3-3V2"/><path d="M7 13h10"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  stone: '<svg viewBox="0 0 24 24"><path d="M6 15c-2-3 0-8 5-9 6-1 9 3 8 7-1 5-9 7-13 2z"/><path d="M10 11c1.5-.8 3.5-.8 5 .5"/></svg>',
  brow: '<svg viewBox="0 0 24 24"><path d="M3 11c4-5 12-5 18-1"/><path d="M7 16c3-1 7-1 10 0"/></svg>',
  razor: '<svg viewBox="0 0 24 24"><path d="M4 7h16v4H4zM9 11v9M15 11v3"/></svg>',
  lips: '<svg viewBox="0 0 24 24"><path d="M3 12c3-4 6-4 9-2 3-2 6-2 9 2-3 4-6 6-9 6s-6-2-9-6z"/><path d="M3 12h18"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
};

export const SCALES = {
  breakouts: ['None', 'Few', 'Several', 'Many'],
  redness: ['None', 'Mild', 'Moderate', 'Strong'],
  irritation: ['None', 'Mild', 'Moderate', 'Strong'],
  tender: ['None', 'Mild', 'Moderate', 'Strong'],
  marks: ['None', 'Few', 'Some', 'Many'],
  puffiness: ['Not noticeable', 'Slight', 'Moderate', 'Marked'],
};
export const SCALE_NAMES = { breakouts: 'New breakouts', redness: 'Redness', irritation: 'Dryness, burning or irritation', tender: 'Tender or painful bumps', marks: 'Healing marks', puffiness: 'Puffiness (your impression)' };
export const lbl = (k, v) => v == null ? 'Not logged' : SCALES[k][v];
export const AREAS = [['forehead', 'Forehead'], ['nose', 'Nose'], ['lcheek', 'Left cheek'], ['rcheek', 'Right cheek'], ['chin', 'Chin'], ['jaw', 'Jaw']];
export const areaName = a => (AREAS.find(x => x[0] === a) || [, a])[1];

export const mondayOf = (k = dkey()) => addDays(k, -((parseKey(k).getDay() + 6) % 7));
export const fmtShort = k => parseKey(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const fmtLong = k => parseKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
export const range = (from, to) => { const out = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; };

/* ---------- routine ---------- */
export function activeOn(p, k) {
  if (p.start && k < p.start) return false;
  if (p.stop && k > p.stop) return false;
  if (p.days && p.days.length && !p.days.includes(parseKey(k).getDay())) return false;
  return true;
}
export const isPaused = p => !!p.paused;
export function routineFor(k, slot) { return F.products.filter(p => p.slots.includes(slot) && activeOn(p, k)); }
export const stateOf = (k, p, slot) => isPaused(p) ? 'paused' : ((F.routineLog[k] || {})[p.id + '@' + slot] || null);
export function routineCount(k, slot) {
  const list = routineFor(k, slot).filter(p => !isPaused(p));
  return { total: list.length, done: list.filter(p => stateOf(k, p, slot) === 'done').length, skipped: list.filter(p => stateOf(k, p, slot) === 'skipped').length };
}
// Completion only counts days the routine existed. Days with no marks are "not marked", not failures.
export function routineStats(from, to) {
  let tot = 0, done = 0, skipped = 0, marked = 0;
  range(from, to).forEach(k => ['am', 'pm'].forEach(sl => { const c = routineCount(k, sl); tot += c.total; done += c.done; skipped += c.skipped; if (c.done + c.skipped) marked += c.total; }));
  return { tot, done, skipped, unmarked: tot - done - skipped };
}

/* ---------- context from The System (read-only) ---------- */
export function weekContext(mon = mondayOf()) {
  const today = dkey(), end = addDays(mon, 6) < today ? addDays(mon, 6) : today;
  const days = range(mon, end);
  const food = days.filter(k => (S.days[k]?.food || []).length);
  const kcal = food.map(k => S.days[k].food.reduce((a, e) => a + (e.kcal || 0), 0));
  const water = days.filter(k => (S.days[k]?.water || 0) > 0);
  const waterAvg = water.length ? water.reduce((a, k) => a + S.days[k].water, 0) / water.length : null;
  const sessions = S.workouts.filter(w => w.date >= mon && w.date <= end).length;
  const ck = days.map(k => S.health?.checkins?.[k]).filter(Boolean);
  const sleep = ck.filter(c => c.sleep != null), stress = ck.filter(c => c.stress != null);
  return { mon, end, days, food, kcalAvg: kcal.length ? kcal.reduce((a, b) => a + b, 0) / kcal.length : null, water, waterAvg, sessions,
    sleepAvg: sleep.length ? sleep.reduce((a, c) => a + c.sleep, 0) / sleep.length : null, sleepN: sleep.length,
    stressAvg: stress.length ? stress.reduce((a, c) => a + c.stress, 0) / stress.length : null, stressN: stress.length };
}
export const latestSkin = () => [...F.skin].sort((a, b) => (b.date + (b.t || 0)).localeCompare(a.date + (a.t || 0)))[0] || null;
export const sortedCheckins = () => [...F.checkins].sort((a, b) => a.date.localeCompare(b.date));

/* ---------- product changes (for timelines) ---------- */
export function productEvents(from, to) {
  const ev = [];
  F.products.forEach(p => {
    if (p.start && p.start >= from && p.start <= to) ev.push({ d: p.start, kind: 'start', p });
    if (p.stop && p.stop >= from && p.stop <= to) ev.push({ d: p.stop, kind: 'stop', p });
  });
  return ev.sort((a, b) => a.d.localeCompare(b.d));
}

/* ---------- suggestions: conservative, from records only ---------- */
export function suggestions() {
  const out = [], today = dkey(), cks = sortedCheckins();
  // 1. photo conditions
  if (cks.length >= 2) {
    const [a, b] = cks.slice(-2);
    const diff = [a.light !== b.light && a.light && b.light && 'light', a.time && b.time && Math.abs(parseInt(a.time) - parseInt(b.time)) >= 3 && 'time of day'].filter(Boolean);
    if (diff.length) out.push({ k: 'photo', t: 'Make photo conditions match', d: `Your last two check-ins differ in ${diff.join(' and ')} (${fmtShort(a.date)}: ${[a.light, a.time].filter(Boolean).join(', ')} · ${fmtShort(b.date)}: ${[b.light, b.time].filter(Boolean).join(', ')}). Matching them makes the next comparison fairer.` });
  }
  // 2. tender / painful bumps -> clinician
  const tender = F.skin.filter(s => s.date >= addDays(today, -28) && s.tender >= 2);
  if (tender.length >= 2) {
    const self = F.products.filter(p => p.selfStarted && !p.stop);
    out.push({ k: 'clinic', t: 'Show painful spots to a clinician', d: `Moderate or stronger tender bumps logged on ${tender.map(s => fmtShort(s.date)).join(', ')}. Deeper painful or scarring spots${self.length ? `, and ${self.map(p => esc(p.name)).join(', ')} that you started yourself,` : ''} are worth reviewing with a doctor or dermatologist.` });
  }
  // 3. irritation after a product change (timing only — never a cause)
  F.products.filter(p => p.start && p.start >= addDays(today, -42)).forEach(p => {
    const after = F.skin.filter(s => s.irritation >= 2 && s.date >= p.start && s.date <= addDays(p.start, 21));
    if (after.length) out.push({ k: 'product', t: `Note the timing around ${p.name}`, d: `Irritation logged as moderate or stronger on ${after.map(s => fmtShort(s.date)).join(', ')}, after ${esc(p.name)} started on ${fmtShort(p.start)}. That timing alone doesn't show the product caused it. Keep logging, and review it with a pharmacist or clinician before changing anything.`, uncertain: true });
  });
  // 4. routine completion (existing routine first, before any product change)
  const st = routineStats(addDays(today, -6), today);
  if (st.tot >= 6 && st.done / st.tot < 0.6) out.push({ k: 'routine', t: 'Finish the routine you already have', d: `Steps marked done: ${st.done} of ${st.tot} in the last 7 days${st.unmarked ? ` (${st.unmarked} not marked)` : ''}. Doing the current routine consistently for a few weeks tells you more than adding products.` });
  // 5. irritation without product change -> document it
  const irr = F.skin.filter(s => s.date >= addDays(today, -14) && s.irritation >= 2);
  if (irr.length && !out.some(o => o.k === 'product')) out.push({ k: 'doc', t: 'Document the irritation', d: `Irritation logged on ${irr.map(s => fmtShort(s.date)).join(', ')}. Add a note on where it is and what you used that day. If it keeps happening, bring the notes to a pharmacist or clinician.` });
  // 6. one missing detail, only if nothing else is useful
  if (!out.length) {
    if (!F.products.length) out.push({ k: 'ask', t: 'One detail would help', d: 'Add the skincare products you use now, with start dates. Then product changes can show up next to your skin check-ins.', ask: true });
    else if (!F.skin.some(s => s.date >= addDays(today, -7))) out.push({ k: 'ask', t: 'One detail would help', d: 'Log one skin check-in this week. It takes about 30 seconds and gives the trend something to compare.', ask: true });
    else if (cks.length < 2) out.push({ k: 'ask', t: 'One detail would help', d: 'Take a second weekly photo set. Comparisons need at least two check-ins in similar conditions.', ask: true });
  }
  return out.slice(0, 3);
}

/* ---------- in-Face navigation (works with Android back) ---------- */
export function fOpen(v, extra = {}) { nav.sub.face = v; Object.assign(nav.sub, extra); history.pushState({ hsub: 'face', fsub: v }, '', '#health'); rerender(); window.scrollTo(0, 0); }
export function fBack() { if (history.state?.fsub) history.back(); else { nav.sub.face = null; rerender(); window.scrollTo(0, 0); } }
export const backBtn = to => `<button class="linkbtn back" data-act="${to === 'health' ? 'h.back' : 'face.back'}">‹ ${to === 'health' ? 'Health' : 'Face'}</button>`;
export const scaleChips = (key, val, id) => `<div class="fx-scale" role="group" aria-label="${esc(SCALE_NAMES[key])}">${SCALES[key].map((n, i) => `<button type="button" class="${val === i ? 'on' : ''}" data-act="face.scalepick" data-id="${id}" data-v="${i}" aria-pressed="${val === i}">${n}</button>`).join('')}</div>`;
export const nl = v => v == null || v === '' ? '<span class="fx-nl">Not logged</span>' : esc(v);
export { r1, niceDate };
