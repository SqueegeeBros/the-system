// STATUS: hunter profile, stats, rank ladder, history, bodyweight, progress photos, milestones, log.
import { S, day, save, logEvent } from '../state.js';
import * as E from '../engine.js';
import { $, esc, uid, dkey, addDays, parseKey, DOW3, fmt, num, r1, pct, niceDate, timeStr, lineChart } from '../util.js';
import { reg, regChg, nav, rerender, go } from '../core.js';
import { notice, confirmBox, sheet, closeSheet, toast } from '../ui.js';
import { rankRing, medalsHTML } from './quests.js';

const SIZES = { S: 'Small', M: 'Medium', L: 'Large', XL: 'Huge' };

function heatmap() {
  const today = dkey(), back = (parseKey(today).getDay() + 6) % 7;   // days since Monday
  const start = addDays(today, -(28 + back));
  const cells = [];
  for (let k = start; k <= today; k = addDays(k, 1)) cells.push({ k, r: E.dayResult(k) });
  return `<div class="heat">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="hd">${d}</div>`).join('')}
    ${cells.map(c => `<div class="hc ${c.r}" title="${c.k}"><span>${parseKey(c.k).getDate()}</span></div>`).join('')}</div>
    <div class="legend"><span><i class="hc all"></i>All clear</span><span><i class="hc partial"></i>Partial</span><span><i class="hc missed"></i>Missed</span><span><i class="hc paused"></i>Paused</span></div>`;
}

export function render() {
  const h = S.hunter, rank = E.rankOf(h.level), need = E.need(h.level), k = dkey(), d = day(k);
  const ws = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ws[ws.length - 1];
  const ago = n => { const target = addDays(k, -n); return [...ws].reverse().find(w => w.date <= target); };
  const w7 = ago(7), w30 = ago(30);
  const delta = (a, b) => (a && b ? `${a.lb - b.lb >= 0 ? '+' : ''}${r1(a.lb - b.lb)} lb` : '—');
  const left = E.pausesLeft();

  return `<div class="wrap">
  <section class="panel">
    <div class="hero2">
      ${rankRing(true)}
      <div class="name">${esc(S.profile.name.toUpperCase())}</div>
      <div class="sub">Rank ${rank} · Level ${h.level}</div>
    </div>
    <div class="bar gold mt"><i style="width:${pct(h.xp, need)}%"></i></div>
    <div class="kv"><span>${fmt(h.xp)} / ${fmt(need)} XP to level ${h.level + 1}</span><span>${fmt(h.totalXP)} total</span></div>
    <div class="grid3 stats3">
      <div><div class="k">Streak</div><div class="v">${h.streak}</div></div>
      <div><div class="k">Best</div><div class="v">${h.bestStreak}</div></div>
      <div><div class="k">XP mult</div><div class="v">×${E.mult().toFixed(1)}</div></div>
    </div>
    ${h.missStreak ? `<div class="alert mt">Missed days in a row: ${h.missStreak} of 3. One more miss could drop your rank.</div>` : ''}
    <div class="btnrow mt">
      ${d.paused ? `<button class="btn ghost" data-act="status.pause" data-on="0">Resume today</button>`
        : `<button class="btn ghost" data-act="status.pause" data-on="1" ${left <= 0 ? 'disabled' : ''}>Pause today (${left} left)</button>`}
      <button class="btn ghost" data-act="nav.go" data-tab="settings">Settings</button>
    </div>
    <div class="note">Pause only for real sick days or emergencies. A paused day has no quests, no XP and no penalties, and your streak is frozen.</div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Medals · ${Object.keys(S.medals || {}).length}/${E.MEDALS.length}</span></div>
    ${medalsHTML(true)}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Stats</span></div>
    ${Object.entries(h.stats).map(([s, v]) => `<div class="row"><span class="statk">${s}</span><span class="grow rs">${E.STAT_INFO[s]}</span><b class="statv">${v}</b></div>`).join('')}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Rank ladder</span></div>
    <div class="ladder">${E.RANKS.map((r, i) => { const nxt = E.RANKS[i + 1];
      return `<div class="rung${r.r === rank ? ' cur' : ''}"><b>${r.r}</b><span>Lv ${r.min}${nxt ? '–' + (nxt.min - 1) : '+'}</span></div>`; }).join('')}</div>
    <div class="note">Each level takes 100 × your level in XP. Daily quests are ${E.QUEST_XP} XP each, with +${E.BONUS_XP} for clearing all of them. Your streak adds 10% per day, up to ×2.0.</div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Last 5 weeks</span></div>
    ${heatmap()}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Body</span></div>
    <div class="grid3 stats3" style="margin-top:0;border-top:0;padding-top:0">
      <div><div class="k">Latest</div><div class="v">${latest ? r1(latest.lb) : '—'}</div></div>
      <div><div class="k">7 days</div><div class="v sm">${delta(latest, w7)}</div></div>
      <div><div class="k">30 days</div><div class="v sm">${delta(latest, w30)}</div></div>
    </div>
    <div class="note">Weigh-ins, the trend chart, progress photos, DEXA scans and labs are in the Health tab.</div>
    <button class="btn ghost full mt" data-act="status.tohealth" data-v="body">Open weight & body</button>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Milestones</span></div>
    ${S.milestones.length ? S.milestones.map(m => `<div class="row${m.done ? ' struck' : ''}">
      <span class="badge">${m.size}</span><div class="grow"><div class="rt sm">${esc(m.name)}</div>
      <div class="rs">${m.done ? `Completed ${niceDate(m.doneAt)}` : `+${E.MILESTONE_XP[m.size]} XP`}</div></div>
      ${m.done ? '' : `<button class="btn sm" data-act="status.msdone" data-id="${m.id}">Done</button>`}
      <button class="iconbtn red" data-act="status.msdel" data-id="${m.id}">×</button></div>`).join('')
      : '<div class="empty">Set big one-time goals: a 225 bench, a bodyweight target, a revenue month for the business.</div>'}
    <div class="inline mt"><input id="ms-name" placeholder="New milestone">
      <select id="ms-size">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${k === 'M' ? 'selected' : ''}>${k} · ${E.MILESTONE_XP[k]} XP</option>`).join('')}</select>
      <button class="btn" data-act="status.msadd">Add</button></div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>System log</span></div>
    ${S.events.length ? S.events.slice(0, 12).map(e => `<div class="row"><span class="rs nowrap">${niceDate(dkey(new Date(e.t)))}</span><span class="grow sm">${esc(e.text)}</span></div>`).join('')
      : '<div class="empty">Nothing yet.</div>'}
  </section>
  </div>`;
}

reg('status.tohealth', el => { nav.tab = 'health'; nav.sub.health = el.dataset.v; history.replaceState(null, '', '#health'); history.pushState({ hsub: el.dataset.v }, '', '#health'); rerender(); window.scrollTo(0, 0); });

reg('status.pause', async el => {
  const on = el.dataset.on === '1';
  if (on && !(await confirmBox('Pause today', `Use 1 of your ${S.settings.pausesPerMonth} monthly pauses? Today’s quests won’t count either way.`, 'Pause today'))) return;
  if (!E.setPaused(on)) return toast('No pauses left this month.');
  rerender();
});

reg('status.msadd', () => {
  const name = $('#ms-name').value.trim(); if (!name) return toast('Name the milestone.');
  S.milestones.push({ id: uid(), name, size: $('#ms-size').value, done: false }); save(); rerender();
});
reg('status.msdone', async el => {
  const m = S.milestones.find(x => x.id === el.dataset.id);
  if (!(await confirmBox('Complete milestone', `Mark <b>${esc(m.name)}</b> as achieved?`, 'Achieved'))) return;
  m.done = true; m.doneAt = dkey();
  const g = E.gainXP(E.MILESTONE_XP[m.size]);
  logEvent(`Milestone achieved: ${m.name} (+${g} XP)`);
  save();
  notice({ title: 'Milestone achieved', html: `<div class="msg"><em>${esc(m.name)}</em></div><div class="rw">+${g} XP</div>`, btn: 'Onward' });
  rerender();
});
reg('status.msdel', async el => {
  const m = S.milestones.find(x => x.id === el.dataset.id);
  if (await confirmBox('Delete milestone', `Delete <b>${esc(m.name)}</b>?`, 'Delete', true)) { S.milestones = S.milestones.filter(x => x.id !== m.id); save(); rerender(); }
});
