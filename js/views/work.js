// WORK: focus timer, distraction log, side quests, weekly insight.
import { S, day, save, logEvent } from '../state.js';
import * as E from '../engine.js';
import { $, esc, uid, dkey, addDays, parseKey, DOW3, clock, pct, timeStr, barChart } from '../util.js';
import { reg, regChg, regTick, rerender } from '../core.js';
import { sheet, closeSheet, toast, confirmBox } from '../ui.js';

const REASONS = ['Phone', 'Social media', 'YouTube', 'Video games', 'Texting', 'Tired', 'Other'];

// ---------- Focus timer ----------
export function stopFocus() {
  if (!S.focus.running) return;
  const now = Date.now(), sec = (now - S.focus.startedAt) / 1000;
  const d = day(S.focus.date);
  d.focusSec += sec;
  d.sessions.push({ start: S.focus.startedAt, end: now, sec: Math.round(sec) });
  S.focus = { running: false, startedAt: null, date: null };
  save();
}
export function toggleFocus() {
  if (S.focus.running) { stopFocus(); toast('Focus paused'); }
  else { S.focus = { running: true, startedAt: Date.now(), date: dkey() }; save(); toast('Focus started. Phone face down.'); }
  E.sync(); rerender();
}
// If a session runs past midnight, credit each day correctly.
export function splitFocusAtMidnight() {
  if (!S.focus.running || S.focus.date === dkey()) return;
  const end = parseKey(addDays(S.focus.date, 1)).getTime();
  const d = day(S.focus.date), sec = (end - S.focus.startedAt) / 1000;
  d.focusSec += sec; d.sessions.push({ start: S.focus.startedAt, end, sec: Math.round(sec) });
  S.focus = { running: true, startedAt: end, date: dkey() };
  save();
}
reg('work.toggle', toggleFocus);

regTick('focus-today', el => {
  const k = dkey(), sec = E.focusSecFor(k), goal = S.settings.focusMin * 60;
  el.innerHTML = `${clock(sec)} <small>/ ${clock(goal)}</small>`;
  const bar = el.parentElement.querySelector('[data-tick-bar]');
  if (bar) bar.style.width = pct(sec, goal) + '%';
  if (S.focus.running && !day(k).paid.focus && sec >= goal) { E.sync(); rerender(); }
});
regTick('focus-session', el => {
  el.textContent = S.focus.running ? `This session ${clock((Date.now() - S.focus.startedAt) / 1000)}` : 'Timer stopped';
});

// ---------- Distractions ----------
reg('work.distract', () => {
  sheet('What pulled you away?', `
    <div class="chipgrid">${REASONS.map(r => `<button class="pill" data-act="work.reason" data-r="${r}">${r}</button>`).join('')}</div>
    <label class="field mt"><span>Note (optional)</span><input id="ds-note" placeholder="e.g. checked Instagram after a text"></label>
    <div class="note">Pick a reason to log it. Being honest here shows you the pattern.</div>`);
});
reg('work.reason', el => {
  day().distractions.push({ t: Date.now(), reason: el.dataset.r, note: $('#ds-note')?.value.trim() || '' });
  save(); closeSheet(); rerender();
  toast('Logged. Back to work.');
});
reg('work.dsdel', el => {
  const d = day(); d.distractions = d.distractions.filter(x => String(x.t) !== el.dataset.t); save(); rerender();
});

// ---------- Side quests ----------
export function bizHTML(compact = false) {
  const d = day();
  return `${S.bizTasks.length ? S.bizTasks.map(t => `<label class="row check ${d.bizDone.includes(t.id) ? 'struck' : ''}">
      <input type="checkbox" data-chg="work.biz" data-id="${t.id}" ${d.bizDone.includes(t.id) ? 'checked' : ''}>
      <span class="grow">${esc(t.name)}</span><span class="rs">+${E.BIZ_XP} XP</span></label>`).join('')
    : '<div class="empty">No side quests set.</div>'}
    ${compact ? '' : `<div class="inline mt"><input id="biz-new" placeholder="New daily side quest"><button class="btn" data-act="work.bizadd">Add</button></div>`}`;
}
regChg('work.biz', el => {
  const d = day(), id = el.dataset.id;
  if (el.checked) {
    if (!d.bizDone.includes(id)) d.bizDone.push(id);
    if (!d.bizPaid.includes(id)) { d.bizPaid.push(id); const g = E.gainXP(E.BIZ_XP); toast(`Side quest done · +${g} XP`); logEvent(`Side quest: ${S.bizTasks.find(t => t.id === id)?.name}`); }
  } else d.bizDone = d.bizDone.filter(x => x !== id);
  save(); rerender();
});
reg('work.bizadd', () => { const v = $('#biz-new').value.trim(); if (!v) return; S.bizTasks.push({ id: uid(), name: v }); save(); rerender(); });
reg('work.bizdel', async el => {
  const t = S.bizTasks.find(x => x.id === el.dataset.id);
  if (await confirmBox('Remove side quest', `Remove <b>${esc(t.name)}</b>?`, 'Remove', true)) { S.bizTasks = S.bizTasks.filter(x => x.id !== t.id); save(); rerender(); }
});

// ---------- View ----------
export function render() {
  const k = dkey(), d = day(k), goal = S.settings.focusMin * 60;
  const focusToday = S.settings.focusDays.includes(new Date().getDay());
  const week = [...Array(7)].map((_, i) => addDays(k, i - 6));
  const bars = week.map(x => ({ label: DOW3[parseKey(x).getDay()][0], v: Math.round(E.focusSecFor(x) / 60) }));
  const reasons = {};
  week.forEach(x => (S.days[x]?.distractions || []).forEach(z => (reasons[z.reason] = (reasons[z.reason] || 0) + 1)));
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  const weekMin = bars.reduce((a, b) => a + b.v, 0);

  return `<div class="wrap">
  <section class="panel">
    <div class="ptitle"><span>Deep work</span></div>
    <div class="sub center">${focusToday ? `Today’s goal · ${S.settings.focusMin} min` : 'Not a required focus day. Time still counts.'}</div>
    <div class="timer big" data-tick="focus-today">${clock(E.focusSecFor(k))} <small>/ ${clock(goal)}</small></div>
    <div class="bar"><i data-tick-bar style="width:${pct(E.focusSecFor(k), goal)}%"></i></div>
    <div class="sub center mt" data-tick="focus-session"></div>
    <div class="btnrow mt">
      <button class="btn" data-act="work.toggle">${S.focus.running ? 'Pause' : E.focusSecFor(k) ? 'Resume' : 'Start focus'}</button>
      <button class="btn ghost" data-act="work.distract">Distracted</button></div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Distractions today</span></div>
    ${d.distractions.length ? d.distractions.map(x => `<div class="row"><div class="grow"><div class="rt sm">${esc(x.reason)}</div>
      <div class="rs">${timeStr(x.t)}${x.note ? ' · ' + esc(x.note) : ''}</div></div>
      <button class="iconbtn red" data-act="work.dsdel" data-t="${x.t}">×</button></div>`).join('')
      : '<div class="empty">None logged today.</div>'}
  </section>

  <section class="panel">
    <div class="ptitle"><span>This week</span></div>
    <div class="bigline"><div><b>${Math.floor(weekMin / 60)}h ${weekMin % 60}m</b><span> focused · last 7 days</span></div></div>
    ${barChart(bars, { goal: S.settings.focusMin })}
    <div class="sub mt">Top distractions</div>
    ${top.length ? top.slice(0, 4).map(([r, n]) => `<div class="row"><span class="grow">${esc(r)}</span><span class="rs">${n}×</span></div>`).join('')
      : '<div class="empty">No distractions logged this week.</div>'}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Side quests</span></div>
    <div class="note">Optional daily tasks worth XP. They reset each morning and never cost you XP.</div>
    ${bizHTML()}
    ${S.bizTasks.length ? `<details class="mt"><summary class="sub">Remove side quests</summary>
      ${S.bizTasks.map(t => `<div class="row"><span class="grow">${esc(t.name)}</span><button class="iconbtn red" data-act="work.bizdel" data-id="${t.id}">×</button></div>`).join('')}</details>` : ''}
  </section>
  </div>`;
}
