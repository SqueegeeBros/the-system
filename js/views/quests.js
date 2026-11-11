// TODAY (home): standard card, today's program, quest checklist, fuel, week, medals.
import { S, day, save } from '../state.js';
import * as E from '../engine.js';
import { esc, dkey, addDays, parseKey, DOW, fmt, pct, clock, r1, timeStr, num } from '../util.js';
import { reg, regTick, go, rerender, CHG } from '../core.js';
import { confirmBox, toast } from '../ui.js';
import { backupDue, driveConnected } from '../backup.js';

const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>';
const FLAME = '<svg viewBox="0 0 24 24" fill="#e2c48a"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 .3 2 1.5 3 3 3 0-3-1-6 0-9z"/></svg>';
const IC = {
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  bar: '<svg viewBox="0 0 24 24"><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

export function rankRing(big = false) {
  const h = S.hunter, p = pct(h.xp, E.need(h.level));
  return `<div class="rankring${big ? ' big' : ''}"><i style="background:conic-gradient(#e2c48a 0 ${p}%,#222 ${p}% 100%)"></i><b>${E.rankOf(h.level)}</b></div>`;
}

const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening'; };
const lastLine = (tplKey) => {
  const w = [...S.workouts].reverse().find(x => x.tpl === tplKey);
  if (!w || !w.exercises[0]) return '';
  const x = w.exercises[0], best = x.sets.reduce((b, s) => (s.w * s.r > b.w * b.r ? s : b), x.sets[0]);
  return ` · last: ${x.name.toLowerCase()} ${best.w}×${best.r}`;
};

export function programCard(k = dkey()) {
  const wd = parseKey(k).getDay(), key = S.settings.split[wd], tpl = key && S.templates[key];
  const order = [1, 2, 3, 4, 5, 6, 0].filter(d => S.settings.split[d]);
  const week = Math.floor((parseKey(k) - parseKey(dkey(new Date(S.createdAt)))) / 6048e5) + 1;
  const splitName = [...new Set(order.map(d => S.templates[S.settings.split[d]]?.name))].join(' / ');
  if (!tpl) return `<section class="prog">
    <div><div class="chips2"><span class="chip2">${esc(splitName)}</span></div>
      <div class="h title">Rest day</div><div class="psub">Recover. Eat your targets and get to bed on time.</div></div>
    <div class="foot"><div class="lbl">Week ${week}</div><button class="cta" data-act="train.start" style="background:#141416;color:#fff;border:1px solid #2a2a2e">Train anyway</button></div></section>`;
  const sets = tpl.exercises.reduce((a, e) => a + (+e.sets || 0), 0);
  const done = !!S.days[k]?.workoutDone, aw = S.activeWorkout && S.activeWorkout.date === k;
  return `<section class="prog${done ? ' done' : ''}">
    <div><div class="chips2"><span class="chip2">${esc(splitName)}</span><span class="chip2">Day ${order.indexOf(wd) + 1} of ${order.length}</span></div>
      <div class="h title">${esc(tpl.name)}</div>
      <div class="psub">${tpl.exercises.length ? `${tpl.exercises.length} exercises · ${sets} sets · ~${Math.round(sets * 3.2)} min${esc(lastLine(key))}` : 'No exercises saved yet. Add them as you go.'}</div></div>
    <div class="foot"><button class="lbl swbtn" data-act="train.choose">Week ${week} · Switch ⇄</button>
      ${done ? `<button class="cta" data-act="nav.go" data-tab="train" style="background:#141416;color:#fff;border:1px solid #2a2a2e">Done ✓ View</button>`
        : `<button class="cta" data-act="train.start" data-tpl="${key}">${aw ? 'Resume' : 'Start workout'} ${PLAY}</button>`}</div></section>`;
}

function qrow({ done, title, sub = '', value = '', act, data = '', side = '' }) {
  return `<div class="qrow${done ? ' done' : ''}"><button class="qmain" data-act="${act}" ${data}>
    <span class="box">${CHECK}</span>
    <span class="qtext"><span class="qt">${title}</span>${sub ? `<span class="qsub">${sub}</span>` : ''}</span>
    <span class="qval">${done ? `<span class="xp">+${E.QUEST_XP} XP</span>` : value}</span></button>${side}</div>`;
}

function questRows(k) {
  const d = day(k), T = S.settings.targets;
  return E.required(k).map(q => {
    const done = E.met(q, k);
    if (q === 'nutrition') {
      const t = E.totals(k);
      return qrow({ done, act: 'food.quicksheet', title: 'Hit macros',
        sub: `${fmt(Math.max(0, T.kcal - t.kcal))} kcal · ${r1(Math.max(0, T.p - t.p))} g protein left<div class="bar"><i style="width:${pct(t.kcal, T.kcal)}%"></i></div>`,
        value: `<b>${Math.round(pct(t.kcal, T.kcal))}%</b><small>of goal</small>` });
    }
    if (q === 'workout') {
      const key = E.templateFor(k), tpl = S.templates[key] || { name: 'Training' };
      const aw = S.activeWorkout && S.activeWorkout.date === k ? S.activeWorkout : null;
      const total = aw ? aw.exercises.reduce((a, x) => a + x.sets.length, 0) : 0, ds = aw ? aw.exercises.reduce((a, x) => a + x.sets.filter(s => s.done).length, 0) : 0;
      const last = [...S.workouts].reverse().find(w => w.date === k);
      return qrow({ done, act: done ? 'nav.go' : 'train.start', data: `data-tab="train" data-tpl="${key}"`, title: `Train · ${esc(tpl.name)}`,
        sub: done && last ? `Done ${timeStr(last.endedAt)}` : aw ? `In progress · ${ds}/${total} sets` : 'Tap to start',
        value: aw ? `<b>${ds}/${total}</b><small>sets</small>` : '' });
    }
    if (q === 'focus') {
      const sec = E.focusSecFor(k), goal = S.settings.focusMin * 60;
      return qrow({ done, act: 'nav.go', data: 'data-tab="work"', title: 'Deep work',
        sub: `<span>${S.profile.workLabel ? esc(S.profile.workLabel) + ' · ' : ''}<span data-tick="focus-mins">${Math.floor(sec / 60)}</span> of ${S.settings.focusMin} min</span><div class="bar"><i data-tick-bar style="width:${pct(sec, goal)}%"></i></div>`,
        side: done ? '' : `<button class="qside${S.focus.running ? ' on' : ''}" data-act="work.toggle" aria-label="Start or pause focus"><span>${S.focus.running ? PAUSE : PLAY}</span></button>` });
    }
    if (q === 'sleep') {
      const w = E.sleepWindow();
      const [oh, om] = S.settings.checkinOpens.split(':').map(Number), o = new Date(); o.setHours(oh, om, 0, 0);
      return qrow({ done, act: 'quest.sleep', title: `Bed by ${E.bedtimeLabel().replace(':00', '')}`,
        sub: done ? `Checked in ${timeStr(d.sleepAt)}` : w.state === 'early' ? `Check-in opens ${o.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : w.state === 'late' ? 'Deadline passed' : 'Tap when you’re in bed',
        value: !done && w.state === 'open' ? '<span class="go">Check in</span>' : !done && w.state === 'late' ? '<span class="miss">MISSED</span>' : '' });
    }
    return '';
  }).join('');
}

function fuelCard(k) {
  const t = E.totals(k), T = S.settings.targets, C = 2 * Math.PI * 50, p = Math.min(1, t.kcal / T.kcal);
  const bar = (cls, lbl, v, g) => `<div class="mrow2 ${cls}"><div class="t2"><span>${lbl}</span><span>${r1(v)} / ${g} g</span></div><div class="bar"><i style="width:${pct(v, g)}%"></i></div></div>`;
  return `<section class="card">
    <div class="mac">
      <div class="mring"><svg width="118" height="118" viewBox="0 0 118 118"><circle cx="59" cy="59" r="50" fill="none" stroke="#222" stroke-width="10"/>
        <circle cx="59" cy="59" r="50" fill="none" stroke="url(#fg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/>
        <defs><linearGradient id="fg"><stop offset="0" stop-color="#a9844a"/><stop offset="1" stop-color="#e2c48a"/></linearGradient></defs></svg>
        <div class="c"><div><b>${fmt(t.kcal)}</b><small>OF ${fmt(T.kcal)}</small></div></div></div>
      <div>${bar('p', 'Protein', t.p, T.p)}${bar('', 'Carbs', t.c, T.c)}${bar('', 'Fat', t.f, T.f)}</div>
    </div>
    <div class="actions">
      <button class="act prim" data-act="food.photo">${IC.scan}Scan</button>
      <button class="act" data-act="food.barcode">${IC.bar}Barcode</button>
      <button class="act" data-act="food.manual">${IC.plus}Manual</button>
    </div></section>
  <div class="hs">${S.meals.filter(m => m.pinned).map(m => `<button class="meal" data-act="food.quick" data-id="${m.id}">
      <div><b>${esc(m.name)}</b><small>${esc(m.tag)} · ${fmt(m.kcal)} kcal · ${r1(m.p)}P</small></div><span class="add">+</span></button>`).join('')
    || `<button class="meal" data-act="nav.go" data-tab="food"><div><b>Add meals</b><small>Pin meals in Fuel → My Meals</small></div><span class="add">+</span></button>`}</div>`;
}

function weekCard() {
  const cur = E.weekXP(0), prev = E.weekXP(1), today = dkey();
  const cls = k => { if (k > today) return ''; const r = E.dayResult(k); return (r === 'today' ? (E.required(k).every(q => E.met(q, k)) ? 'all' : '') + ' today' : r === 'none' ? '' : r); };
  return `<section class="card">
    <div class="week">${cur.days.map((k, i) => `<div class="wd"><small>${'MTWTFSS'[i]}</small><i class="${cls(k)}"></i></div>`).join('')}</div>
    <div class="vs"><span>You this week<b class="${cur.sum > prev.sum ? 'up' : ''}">${fmt(cur.sum)} XP</b></span><span style="text-align:right">You last week<b>${fmt(prev.sum)} XP</b></span></div>
  </section>`;
}

export function medalsHTML(all = false) {
  const got = S.medals || {};
  const list = [...E.MEDALS].sort((a, b) => (got[b.id] ? 1 : 0) - (got[a.id] ? 1 : 0));
  const items = (all ? list : list.slice(0, 8)).map(m => `<div class="medal${got[m.id] ? '' : ' lock'}"><div class="m">${esc(m.icon)}</div><small>${esc(m.name)}</small></div>`).join('');
  return all ? `<div class="medalgrid">${items}</div>` : `<div class="medals">${items}</div>`;
}

export function render() {
  const k = dkey(), d = day(k), req = E.required(k), h = S.hunter;
  const doneCount = d.paused ? 0 : req.filter(q => E.met(q, k)).length, left = req.length - doneCount;
  const bizDone = S.bizTasks.filter(t => d.bizDone.includes(t.id)).length;
  const now = new Date();
  const gotMedals = Object.keys(S.medals || {}).length;

  return `<div class="wrap">
  ${backupDue() && !driveConnected() ? `<button class="banner" data-act="backup.now">Drive backup due · tap to back up</button>` : ''}
  <div class="top">
    <div><div class="lbl">${DOW[now.getDay()]} · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      <h1 class="h">${S.profile.name ? `${greeting()},<br>${esc(S.profile.name)}` : `Good<br>${greeting().toLowerCase()}`}</h1></div>
    <button data-act="nav.go" data-tab="status" aria-label="Profile">${rankRing()}</button>
  </div>
  <div class="xprow">
    <div class="lvl">LV ${h.level} <span>· ${fmt(h.xp)} / ${fmt(E.need(h.level))} XP</span></div>
    <div class="pills"><div class="pill2">${FLAME}${h.streak}</div><div class="pill2">×${E.mult().toFixed(1)} XP</div></div>
  </div>

  <section class="hero${!d.paused && !left ? ' clear' : ''}">
    <div class="row2">
      <div><div class="lbl">Today’s standard</div><div class="big h">${doneCount}<span>/${req.length}</span></div></div>
      <div>${d.paused ? `<div class="lbl" style="text-align:right">Paused</div>` : left
        ? `<div class="lbl" style="text-align:right">Resets in</div><div class="cd" data-tick="countdown"></div>`
        : `<div class="lbl" style="text-align:right">Status</div><div class="cd" style="color:#fff">ALL CLEAR</div>`}</div>
    </div>
    <div class="segs" style="grid-template-columns:repeat(${req.length},1fr)">${req.map((q, i) => `<i class="${i < doneCount ? 'on' : ''}"></i>`).join('')}</div>
    <div class="meta">${d.paused ? '<span>No quests, XP or penalties today.</span><button class="linkbtn" data-act="quest.unpause">Resume</button>'
      : left ? `<span><b>+${left * E.QUEST_XP + (d.bonus ? 0 : E.BONUS_XP)} XP</b> still on the table</span><span>−${S.settings.penaltyXP} XP per miss</span>`
      : `<span><b>Streak ${h.streak}</b> secured</span><span>Bonus collected</span>`}</div>
    ${h.missStreak ? `<div class="miss sm">⚠ ${h.missStreak} of 3 missed days before a rank drop</div>` : ''}
  </section>

  ${programCard(k)}

  ${d.paused ? '' : `<div class="sect"><span class="h">Quests</span><a>${doneCount} of ${req.length}</a></div>
  <div class="qlist">${questRows(k)}</div>`}

  ${S.bizTasks.length ? `<div class="sect"><span class="h">Side quests</span><a>${bizDone}/${S.bizTasks.length} · +${E.BIZ_XP} XP each</a></div>
  <div class="qlist">${S.bizTasks.map(t => { const on = d.bizDone.includes(t.id);
    return `<div class="qrow small${on ? ' done' : ''}"><button class="qmain" data-act="quest.biz" data-id="${t.id}"><span class="box">${CHECK}</span>
      <span class="qtext"><span class="qt">${esc(t.name)}</span></span></button></div>`; }).join('')}</div>` : ''}

  <div class="sect"><span class="h">Fuel</span><button data-act="nav.go" data-tab="food">Open log</button></div>
  ${fuelCard(k)}

  <div class="sect"><span class="h">This week</span><button data-act="nav.go" data-tab="status">History</button></div>
  ${weekCard()}

  <div class="sect"><span class="h">Medals</span><button data-act="nav.go" data-tab="status">${gotMedals}/${E.MEDALS.length}</button></div>
  ${medalsHTML()}
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
reg('quest.biz', el => { CHG['work.biz']({ dataset: { id: el.dataset.id }, checked: !day().bizDone.includes(el.dataset.id) }); });
reg('quest.unpause', () => { E.setPaused(false); rerender(); });
