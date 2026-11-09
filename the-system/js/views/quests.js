// QUESTS (home): glanceable checklist. One look = everything you need today.
import { S, day, save } from '../state.js';
import * as E from '../engine.js';
import { esc, dkey, DOW, fmt, pct, clock, r1, timeStr } from '../util.js';
import { reg, regTick, go, rerender, CHG } from '../core.js';
import { confirmBox, toast } from '../ui.js';
import { quickTilesHTML } from './food.js';
import { backupDue, driveConnected } from '../backup.js';

const IC = {
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-2 2-2 6 0 8v10"/></svg>',
  train: '<svg viewBox="0 0 24 24"><path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/></svg>',
  focus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
  sleep: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3 0-3-1-5 0-8z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
};
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

export function statusPanel() {
  const h = S.hunter, need = E.need(h.level);
  return `<section class="hud">
    <div class="rank sm">${E.rankOf(h.level)}</div>
    <div class="hudmid">
      <div class="hudtop"><b>LV ${h.level}</b><span>${fmt(h.xp)} / ${fmt(need)} XP</span></div>
      <div class="bar gold thick"><i style="width:${pct(h.xp, need)}%"></i></div>
    </div>
    <div class="streakbadge ${h.streak ? 'on' : ''}">${IC.flame}<b>${h.streak}</b></div>
  </section>`;
}

function ring(done, total) {
  const R = 44, C = 2 * Math.PI * R, p = total ? done / total : 0;
  return `<svg class="ring" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="${R}" class="ring-bg"/>
    <circle cx="50" cy="50" r="${R}" class="ring-fg${done === total && total ? ' full' : ''}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/>
    <text x="50" y="50" class="ring-num">${done}/${total}</text>
    <text x="50" y="66" class="ring-lbl">CLEAR</text></svg>`;
}

// One quest row: [checkbox] icon · title · value. Tap = the main action.
function qrow({ key, done, icon, title, value, sub, act, data = '', side = '' }) {
  return `<div class="qrow${done ? ' done' : ''}">
    <button class="qmain" data-act="${act}" ${data}>
      <span class="box">${done ? CHECK : ''}</span>
      <span class="qicon">${icon}</span>
      <span class="qtext"><span class="qt">${title}</span>${sub ? `<span class="qsub">${sub}</span>` : ''}</span>
      <span class="qval">${done ? `<span class="xpchip">+${E.QUEST_XP} XP</span>` : value}</span>
    </button>${side}</div>`;
}

function rows(k) {
  const d = day(k), T = S.settings.targets, out = [];
  for (const q of E.required(k)) {
    const done = E.met(q, k);
    if (q === 'nutrition') {
      const t = E.totals(k);
      out.push(qrow({ key: q, done, icon: IC.food, act: 'food.quicksheet',
        title: 'Hit macros',
        sub: `<span class="mini"><i style="width:${pct(t.kcal, T.kcal)}%"></i></span><span class="mini p"><i style="width:${pct(t.p, T.p)}%"></i></span>`,
        value: `<b>${fmt(Math.max(0, T.kcal - t.kcal))}</b><small>kcal left</small><b>${r1(Math.max(0, T.p - t.p))}g</b><small>protein left</small>` }));
    }
    if (q === 'workout') {
      const key = E.templateFor(k), tpl = S.templates[key] || { name: 'Training', exercises: [] };
      const aw = S.activeWorkout && S.activeWorkout.date === k ? S.activeWorkout : null;
      const total = aw ? aw.exercises.reduce((a, x) => a + x.sets.length, 0) : tpl.exercises.reduce((a, x) => a + (+x.sets || 0), 0);
      const doneSets = aw ? aw.exercises.reduce((a, x) => a + x.sets.filter(s => s.done).length, 0) : 0;
      out.push(qrow({ key: q, done, icon: IC.train, act: done ? 'nav.go' : 'train.start', data: `data-tab="train" data-tpl="${key}"`,
        title: `${esc(tpl.name)} day`, sub: aw ? 'In progress · tap to continue' : '',
        value: aw ? `<b>${doneSets}/${total}</b><small>sets</small>` : `<span class="go">START</span>` }));
    }
    if (q === 'focus') {
      const sec = E.focusSecFor(k), goal = S.settings.focusMin * 60;
      out.push(qrow({ key: q, done, icon: IC.focus, act: 'nav.go', data: 'data-tab="work"',
        title: 'Deep work',
        sub: `<span class="mini"><i data-tick-bar style="width:${pct(sec, goal)}%"></i></span>`,
        value: `<b data-tick="focus-mins">${Math.floor(sec / 60)}</b><small>/ ${S.settings.focusMin} min</small>`,
        side: done ? '' : `<button class="qside${S.focus.running ? ' on' : ''}" data-act="work.toggle" aria-label="${S.focus.running ? 'Pause' : 'Start'} focus">${S.focus.running ? IC.pause : IC.play}</button>` }));
    }
    if (q === 'sleep') {
      const w = E.sleepWindow();
      const [oh, om] = S.settings.checkinOpens.split(':').map(Number), o = new Date(); o.setHours(oh, om, 0, 0);
      out.push(qrow({ key: q, done, icon: IC.sleep, act: 'quest.sleep',
        title: `Bed by ${E.bedtimeLabel().replace(':00', '')}`,
        sub: done ? `Checked in ${timeStr(d.sleepAt)}` : '',
        value: w.state === 'early' ? `<small>opens ${o.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</small>`
          : w.state === 'late' ? `<span class="miss">MISSED</span>` : `<span class="go">CHECK IN</span>` }));
    }
  }
  return out.join('');
}

export function render() {
  const k = dkey(), d = day(k), req = E.required(k), h = S.hunter;
  const wd = new Date().getDay(), tplKey = S.settings.split[wd];
  const doneCount = req.filter(q => E.met(q, k)).length;
  const left = req.length - doneCount;
  const bizLeft = S.bizTasks.filter(t => !d.bizDone.includes(t.id)).length;

  return `<div class="wrap">
  ${backupDue() && !driveConnected() ? `<button class="banner gold" data-act="backup.now">Drive backup due · tap to back up</button>` : ''}
  ${statusPanel()}

  <section class="panel today">
    <div class="todayhead">
      ${ring(d.paused ? 0 : doneCount, req.length)}
      <div class="todayinfo">
        <div class="dayname">${DOW[wd]}</div>
        <div class="daytype">${tplKey ? esc(S.templates[tplKey]?.name || '') + ' day' : 'Rest day'}</div>
        ${d.paused ? `<div class="pill-s">PAUSED</div>` : left
          ? `<div class="reset"><span data-tick="countdown"></span><small>until reset · −${S.settings.penaltyXP} XP each miss</small></div>`
          : `<div class="allclear">All clear. Streak secured.</div>`}
        ${h.missStreak ? `<div class="miss sm">⚠ ${h.missStreak}/3 missed days → rank drop</div>` : ''}
      </div>
    </div>
    ${d.paused ? `<div class="pausebox">Today is paused. No quests, XP or penalties.<button class="btn ghost sm" data-act="quest.unpause">Resume today</button></div>`
      : `<div class="qlist">${rows(k)}</div>`}
  </section>

  ${S.bizTasks.length ? `<section class="panel">
    <div class="sechead"><span>Side quests</span><small>${S.bizTasks.length - bizLeft}/${S.bizTasks.length} · +${E.BIZ_XP} XP each</small></div>
    <div class="qlist">${S.bizTasks.map(t => { const on = d.bizDone.includes(t.id);
      return `<div class="qrow small${on ? ' done' : ''}"><button class="qmain" data-act="quest.biz" data-id="${t.id}">
        <span class="box">${on ? CHECK : ''}</span><span class="qtext"><span class="qt">${esc(t.name)}</span></span></button></div>`; }).join('')}</div>
  </section>` : ''}

  <section class="panel">
    <div class="sechead"><span>Quick log</span><small>tap to add</small></div>
    ${quickTilesHTML()}
  </section>
  </div>`;
}

regTick('countdown', el => {
  const now = new Date(), end = new Date(now); end.setHours(23, 59, 59, 999);
  el.textContent = clock((end - now) / 1000);
});
regTick('focus-mins', el => {
  const k = dkey(), sec = E.focusSecFor(k), goal = S.settings.focusMin * 60;
  el.textContent = Math.floor(sec / 60);
  const bar = el.closest('.qrow')?.querySelector('[data-tick-bar]');
  if (bar) bar.style.width = pct(sec, goal) + '%';
  if (S.focus.running && !day(k).paid.focus && sec >= goal) { E.sync(); rerender(); }
});

reg('nav.go', el => go(el.dataset.tab));
reg('quest.sleep', async () => {
  const d = day();
  if (d.sleepAt) return;
  const w = E.sleepWindow().state;
  if (w === 'early') return toast(`Check-in opens at ${S.settings.checkinOpens}.`);
  if (w === 'late') return toast('Bedtime deadline passed for today.');
  if (!(await confirmBox('Check in', `In bed now, before ${E.bedtimeLabel()}? Honor system.`, 'I’m in bed'))) return;
  d.sleepAt = Date.now();
  save(); E.sync(); rerender();
});
reg('quest.biz', el => {
  const cb = { dataset: { id: el.dataset.id }, checked: !day().bizDone.includes(el.dataset.id) };
  CHG['work.biz'](cb);
});
reg('quest.unpause', () => { E.setPaused(false); rerender(); });
