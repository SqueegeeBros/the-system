// TRAIN: split templates, live set logger with last-session numbers, rest timer, PRs, history, progress.
import { S, day, save, logEvent } from '../state.js';
import * as E from '../engine.js';
import { $, esc, uid, dkey, DOW, DOW3, fmt, num, r1, clock, niceDate, lineChart } from '../util.js';
import { reg, regChg, regTick, nav, rerender, go } from '../core.js';
import { notice, confirmBox, sheet, closeSheet, toast } from '../ui.js';

const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);
const norm = s => String(s || '').trim().toLowerCase();

function lastSets(name) {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const ex = S.workouts[i].exercises.find(x => norm(x.name) === norm(name));
    if (ex && ex.sets.length) return ex.sets;
  }
  return null;
}

// ---------- Start / finish ----------
export function startWorkout(tplKey) {
  if (S.activeWorkout) return go('train');
  const tpl = S.templates[tplKey];
  if (!tpl) return chooseTemplate();
  S.activeWorkout = {
    id: uid(), date: dkey(), tpl: tplKey, name: tpl.name, startedAt: Date.now(), restUntil: 0, restFor: 0,
    exercises: tpl.exercises.map(x => ({ id: uid(), name: x.name, target: `${x.sets} × ${x.reps}`, rest: +x.rest || 120,
      sets: [...Array(Math.max(1, +x.sets || 1))].map(() => ({ w: '', r: '', done: false })), pr: false })),
  };
  save();
  go('train');
}
function chooseTemplate() {
  sheet('Start which session?', Object.entries(S.templates).map(([k, t]) =>
    `<button class="row btnrowitem" data-act="train.pick" data-tpl="${k}"><span class="grow rt">${esc(t.name)}</span><span class="rs">${t.exercises.length} exercises</span></button>`).join(''));
}
reg('train.pick', el => { closeSheet(); startWorkout(el.dataset.tpl); });
reg('train.start', el => {
  const key = el.dataset.tpl || E.templateFor(dkey());
  key && key !== 'null' ? startWorkout(key) : chooseTemplate();
});

reg('train.finish', async () => {
  const aw = S.activeWorkout;
  const done = aw.exercises.map(x => ({ name: x.name, sets: x.sets.filter(s => s.done).map(s => ({ w: num(s.w), r: num(s.r) })) })).filter(x => x.sets.length);
  if (!done.length) {
    if (await confirmBox('No sets logged', 'You haven’t checked off any sets. Discard this session? It won’t count for the quest.', 'Discard', true)) {
      S.activeWorkout = null; save(); rerender();
    }
    return;
  }
  if (!(await confirmBox('Finish session', 'End this session and save it?', 'Finish'))) return;
  const sets = done.reduce((a, x) => a + x.sets.length, 0);
  const volume = done.reduce((a, x) => a + x.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
  const prs = aw.exercises.filter(x => x.pr).map(x => x.name);
  // record bests
  done.forEach(x => {
    const best = x.sets.reduce((b, s) => (e1rm(s.w, s.r) > e1rm(b.w, b.r) ? s : b), { w: 0, r: 0 });
    const k = norm(x.name), val = e1rm(best.w, best.r);
    if (val && (!S.prs[k] || val > S.prs[k].e1rm)) S.prs[k] = { e1rm: r1(val), w: best.w, r: best.r, date: aw.date, name: x.name };
  });
  const mins = Math.round((Date.now() - aw.startedAt) / 60000);
  S.workouts.push({ id: aw.id, date: aw.date, tpl: aw.tpl, name: aw.name, startedAt: aw.startedAt, endedAt: Date.now(), exercises: done });
  day(aw.date).workoutDone = true;
  S.activeWorkout = null;
  logEvent(`${aw.name} session: ${sets} sets, ${fmt(volume)} lb volume`);
  save();
  notice({ title: 'Session complete', html: `<div class="msg">${esc(aw.name)} · <em>${sets} sets</em></div>
    <div class="rw">${mins} MIN · ${fmt(volume)} LB VOLUME${prs.length ? ` · ${prs.length} PR` : ''}</div>`, btn: 'Done' });
  E.sync(); rerender();
});
reg('train.discard', async () => {
  if (await confirmBox('Discard session', 'Throw away this session? Nothing will be saved.', 'Discard', true)) { S.activeWorkout = null; save(); rerender(); }
});

// ---------- Logging sets (one exercise open at a time, big steppers) ----------
const firstNum = t => { const m = String(t || '').match(/(\d+)\s*(?:–|-)\s*(\d+)|(\d+)\s*$/); return m ? +(m[1] || m[3]) : 10; };
const nextIdx = ex => ex.sets.findIndex(s => !s.done);
const exDone = ex => ex.sets.length && ex.sets.every(s => s.done);

// Pre-fill the stepper for the next set: this session's last set > last session's same set > template reps
function ensureDraft(ex) {
  if (ex.dw !== undefined && ex.dr !== undefined) return;
  const j = Math.max(0, nextIdx(ex)), last = lastSets(ex.name);
  const prevDone = [...ex.sets].reverse().find(s => s.done);
  const ref = last?.[j] || last?.[last.length - 1];
  ex.dw = prevDone ? num(prevDone.w) : ref ? num(ref.w) : 0;
  ex.dr = ref ? num(ref.r) : prevDone ? num(prevDone.r) : firstNum(ex.target.split('×')[1]);
}
function refreshDraft(ex) { delete ex.dw; delete ex.dr; ensureDraft(ex); }

reg('train.open', el => { S.activeWorkout.cur = +el.dataset.ex; save(); rerender(); });
reg('train.step', el => {
  const ex = S.activeWorkout.exercises[+el.dataset.ex]; ensureDraft(ex);
  const f = el.dataset.f, d = +el.dataset.d;
  if (f === 'w') ex.dw = Math.max(0, r1(num(ex.dw) + d));
  else ex.dr = Math.max(0, Math.round(num(ex.dr) + d));
  save(); rerender();
});
regChg('train.draft', el => {
  const ex = S.activeWorkout?.exercises[+el.dataset.ex]; if (!ex) return;
  ex[el.dataset.f === 'w' ? 'dw' : 'dr'] = num(el.value);
  save();
});
reg('train.log', el => {
  const aw = S.activeWorkout, i = +el.dataset.ex, ex = aw.exercises[i];
  ensureDraft(ex);
  if (!num(ex.dr)) return toast('Set your reps first.');
  let j = nextIdx(ex);
  if (j < 0) { ex.sets.push({ w: '', r: '', done: false }); j = ex.sets.length - 1; }
  const s = ex.sets[j];
  s.w = String(num(ex.dw)); s.r = String(num(ex.dr)); s.done = true;
  aw.restUntil = Date.now() + ex.rest * 1000; aw.restFor = ex.rest;
  const best = S.prs[norm(ex.name)], val = e1rm(num(s.w), num(s.r));
  if (best && val > best.e1rm && !ex.pr) {
    ex.pr = true;
    const g = E.gainXP(E.PR_XP);
    notice({ title: 'New record', html: `<div class="msg"><em>${esc(ex.name)}</em><br>${num(s.w)} lb × ${num(s.r)}</div>
      <div class="rw">EST. 1RM ${r1(val)} LB (WAS ${best.e1rm}) · +${g} XP</div>`, btn: 'Keep going' });
  }
  // next set: keep the weight, use last session's reps for that set if known
  const nj = nextIdx(ex), last = lastSets(ex.name);
  if (nj >= 0 && last?.[nj]) ex.dr = num(last[nj].r);
  if (exDone(ex)) {
    const nxt = aw.exercises.findIndex((x, k) => k > i && !exDone(x));
    const any = nxt >= 0 ? nxt : aw.exercises.findIndex(x => !exDone(x));
    if (any >= 0) { aw.cur = any; }
  }
  save(); rerender();
});
reg('train.unlog', el => {
  const aw = S.activeWorkout, ex = aw.exercises[+el.dataset.ex], s = ex.sets[+el.dataset.s];
  if (!s.done) return;
  s.done = false; ex.dw = num(s.w); ex.dr = num(s.r); aw.cur = +el.dataset.ex;
  // keep logged sets first, open slots after
  ex.sets.sort((a, b) => (b.done ? 1 : 0) - (a.done ? 1 : 0));
  save(); rerender(); toast('Set reopened. Adjust and log again.');
});
reg('train.addset', el => {
  const ex = S.activeWorkout.exercises[+el.dataset.ex];
  ex.sets.push({ w: '', r: '', done: false }); save(); rerender();
});
reg('train.delset', el => {
  const ex = S.activeWorkout.exercises[+el.dataset.ex];
  const j = ex.sets.map(s => s.done).lastIndexOf(false);
  if (j >= 0 && ex.sets.length > 1) ex.sets.splice(j, 1);
  save(); rerender();
});
reg('train.delex', async el => {
  const aw = S.activeWorkout, ex = aw.exercises[+el.dataset.ex];
  if (await confirmBox('Remove exercise', `Remove <b>${esc(ex.name)}</b> from this session?`, 'Remove', true)) { aw.exercises.splice(+el.dataset.ex, 1); aw.cur = undefined; save(); rerender(); }
});
reg('train.skiprest', () => { S.activeWorkout.restUntil = 0; save(); rerender(); });
reg('train.addex', () => {
  const empty = !S.templates[S.activeWorkout.tpl]?.exercises.length;
  sheet('Add exercise', `
    <label class="field"><span>Exercise</span><input id="ax-name" placeholder="e.g. Smith machine RDL" list="ax-list"></label>
    <datalist id="ax-list">${allExerciseNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="grid3">
      <label class="field"><span>Sets</span><input id="ax-sets" type="number" inputmode="numeric" value="3"></label>
      <label class="field"><span>Reps</span><input id="ax-reps" value="8–12"></label>
      <label class="field"><span>Rest (sec)</span><input id="ax-rest" type="number" inputmode="numeric" value="120"></label>
    </div>
    <label class="check"><input type="checkbox" id="ax-save" ${empty ? 'checked' : ''}> Also add to my ${esc(S.activeWorkout.name)} template</label>
    <button class="btn full mt" data-act="train.addexgo">Add</button>`);
});
reg('train.addexgo', () => {
  const name = $('#ax-name').value.trim(); if (!name) return toast('Name the exercise.');
  const sets = Math.max(1, Math.round(num($('#ax-sets').value)) || 3), reps = $('#ax-reps').value.trim() || '8–12', rest = Math.round(num($('#ax-rest').value)) || 120;
  const aw = S.activeWorkout;
  aw.exercises.push({ id: uid(), name, target: `${sets} × ${reps}`, rest, sets: [...Array(sets)].map(() => ({ w: '', r: '', done: false })), pr: false });
  if ($('#ax-save').checked) S.templates[aw.tpl]?.exercises.push({ id: uid(), name, sets, reps, rest });
  aw.cur = aw.exercises.length - 1;
  save(); closeSheet(); rerender();
});

regTick('workout-elapsed', el => { if (S.activeWorkout) el.textContent = clock((Date.now() - S.activeWorkout.startedAt) / 1000); });
regTick('rest', el => {
  const aw = S.activeWorkout; if (!aw) return;
  const left = (aw.restUntil - Date.now()) / 1000;
  const box = el.closest('.restbar');
  if (left <= 0) { if (box && !box.hidden) { box.hidden = true; if (aw.restUntil) { aw.restUntil = 0; navigator.vibrate?.([200, 100, 200]); } } return; }
  if (box) box.hidden = false;
  el.textContent = `Rest ${clock(left)}`;
  const bar = box?.querySelector('i'); if (bar) bar.style.width = `${(left / aw.restFor) * 100}%`;
});

function allExerciseNames() {
  const set = new Set();
  Object.values(S.templates).forEach(t => t.exercises.forEach(e => set.add(e.name)));
  S.workouts.forEach(w => w.exercises.forEach(e => set.add(e.name)));
  return [...set].sort();
}

// ---------- Template editor ----------
const tplRow = (x = {}) => `<div class="tplrow">
  <input class="tp-name" placeholder="Exercise" value="${esc(x.name || '')}">
  <div class="grid3">
    <label class="field"><span>Sets</span><input class="tp-sets" type="number" inputmode="numeric" value="${x.sets ?? 3}"></label>
    <label class="field"><span>Reps</span><input class="tp-reps" value="${esc(x.reps || '8–12')}"></label>
    <label class="field"><span>Rest s</span><input class="tp-rest" type="number" inputmode="numeric" value="${x.rest ?? 120}"></label>
  </div>
  <div class="tplacts"><button type="button" class="iconbtn tp-up" aria-label="Move up">↑</button><button type="button" class="iconbtn tp-down" aria-label="Move down">↓</button>
    <button type="button" class="iconbtn red tp-del" aria-label="Remove">×</button></div></div>`;

reg('train.edittpl', el => {
  const key = el.dataset.tpl, t = S.templates[key];
  sheet(`Edit ${t.name}`, `
    <label class="field"><span>Session name</span><input id="tp-title" value="${esc(t.name)}"></label>
    <div id="tp-rows">${t.exercises.map(tplRow).join('')}</div>
    <button type="button" class="btn ghost sm mt" id="tp-add">+ Exercise</button>
    <div class="note">Compounds usually rest 120–180 s and isolations 60–120 s.</div>
    <button class="btn full mt" id="tp-save">Save template</button>`, {
    onMount: card => {
      const rows = card.querySelector('#tp-rows');
      card.querySelector('#tp-add').onclick = () => rows.insertAdjacentHTML('beforeend', tplRow());
      rows.onclick = e => {
        const r = e.target.closest('.tplrow'); if (!r) return;
        if (e.target.classList.contains('tp-del')) r.remove();
        if (e.target.classList.contains('tp-up') && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling);
        if (e.target.classList.contains('tp-down') && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r);
      };
      card.querySelector('#tp-save').onclick = () => {
        t.name = card.querySelector('#tp-title').value.trim() || t.name;
        t.exercises = [...rows.querySelectorAll('.tplrow')].map(r => ({
          id: uid(), name: r.querySelector('.tp-name').value.trim(), sets: Math.max(1, Math.round(num(r.querySelector('.tp-sets').value)) || 3),
          reps: r.querySelector('.tp-reps').value.trim() || '8–12', rest: Math.round(num(r.querySelector('.tp-rest').value)) || 120,
        })).filter(x => x.name);
        save(); closeSheet(); rerender(); toast('Template saved');
      };
    },
  });
});

// ---------- History ----------
reg('train.history', el => {
  const w = S.workouts.find(x => x.id === el.dataset.id);
  sheet(`${w.name} · ${niceDate(w.date)}`, `
    ${w.exercises.map(x => `<div class="histex"><div class="rt sm">${esc(x.name)}</div>
      <div class="rs">${x.sets.map(s => `${s.w}×${s.r}`).join(' · ')}</div></div>`).join('')}
    <button class="btn ghost danger full mt" data-act="train.delhist" data-id="${w.id}">Delete this session</button>`);
});
reg('train.delhist', async el => {
  if (!(await confirmBox('Delete session', 'Delete this session from history? XP already earned stays.', 'Delete', true))) return;
  S.workouts = S.workouts.filter(x => x.id !== el.dataset.id); save(); closeSheet(); rerender();
});
regChg('train.prog', el => { nav.sub.trainEx = el.value; rerender(); });

// ---------- Views ----------
function activeView() {
  const aw = S.activeWorkout;
  const total = aw.exercises.reduce((a, x) => a + x.sets.length, 0);
  const doneSets = aw.exercises.reduce((a, x) => a + x.sets.filter(s => s.done).length, 0);
  if (aw.cur === undefined || !aw.exercises[aw.cur]) aw.cur = Math.max(0, aw.exercises.findIndex(x => !exDone(x)));
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  return `<div class="wrap">
  <section class="panel sticky">
    <div class="sessionhead"><div><div class="qname">${esc(aw.name)}</div><div class="sub"><span data-tick="workout-elapsed"></span> · ${doneSets}/${total} sets</div></div>
      <div class="btnrow tight"><button class="btn ghost sm" data-act="train.discard">Discard</button><button class="btn sm" data-act="train.finish">Finish</button></div></div>
    <div class="bar thick mt"><i style="width:${total ? (doneSets / total) * 100 : 0}%"></i></div>
    <div class="restbar" hidden><div class="restrow"><span data-tick="rest"></span><button class="linkbtn" data-act="train.skiprest">Skip rest</button></div><div class="bar"><i></i></div></div>
  </section>
  ${!aw.exercises.length ? `<section class="panel"><div class="empty">No exercises in this template yet. Add what you’re doing today. It saves to the template.</div></section>` : ''}
  ${aw.exercises.map((x, i) => {
    const done = exDone(x), dots = x.sets.map(s => `<i class="${s.done ? 'on' : ''}"></i>`).join('');
    const nDone = x.sets.filter(s => s.done).length;
    if (i !== aw.cur) return `<button class="excard${done ? ' done' : ''}" data-act="train.open" data-ex="${i}">
      <span class="box">${done ? CHECK : ''}</span>
      <span class="qtext"><span class="qt">${esc(x.name)} ${x.pr ? '<span class="badge gold">PR</span>' : ''}</span><span class="dots">${dots}</span></span>
      <span class="qval"><b>${nDone}/${x.sets.length}</b></span></button>`;
    ensureDraft(x);
    const last = lastSets(x.name), j = nextIdx(x);
    return `<section class="panel ex open">
      <div class="qtop"><div><div class="qname">${esc(x.name)} ${x.pr ? '<span class="badge gold">PR</span>' : ''}</div>
        <div class="qdesc">Goal ${esc(x.target)} · rest ${x.rest}s</div>
        <div class="qdesc">${last ? `Last time: ${last.map(s => `${s.w}×${s.r}`).join(', ')}` : 'First time. Set your baseline.'}</div></div>
        <button class="iconbtn red" data-act="train.delex" data-ex="${i}" aria-label="Remove exercise">×</button></div>
      <div class="setchips">${x.sets.map((s, k) => s.done
        ? `<button class="setchip done" data-act="train.unlog" data-ex="${i}" data-s="${k}">${CHECK}${num(s.w)}×${num(s.r)}</button>`
        : `<span class="setchip${k === j ? ' cur' : ''}">Set ${k + 1}</span>`).join('')}</div>
      <div class="stepper2">
        <div class="stlbl">Weight (lb)</div>
        <div class="strow"><button class="stbtn" data-act="train.step" data-ex="${i}" data-f="w" data-d="-5">−5</button>
          <input class="stval" type="number" inputmode="decimal" value="${num(x.dw)}" data-chg="train.draft" data-ex="${i}" data-f="w" aria-label="Weight">
          <button class="stbtn" data-act="train.step" data-ex="${i}" data-f="w" data-d="5">+5</button></div>
        <div class="stlbl">Reps</div>
        <div class="strow"><button class="stbtn" data-act="train.step" data-ex="${i}" data-f="r" data-d="-1">−1</button>
          <input class="stval" type="number" inputmode="numeric" value="${num(x.dr)}" data-chg="train.draft" data-ex="${i}" data-f="r" aria-label="Reps">
          <button class="stbtn" data-act="train.step" data-ex="${i}" data-f="r" data-d="1">+1</button></div>
      </div>
      <button class="btn full big mt" data-act="train.log" data-ex="${i}">${j >= 0 ? `✓ Log set ${j + 1} of ${x.sets.length}` : '+ Log extra set'}</button>
      <div class="btnrow tight mt"><button class="linkbtn" data-act="train.addset" data-ex="${i}">+ Add set</button><button class="linkbtn" data-act="train.delset" data-ex="${i}">− Remove set</button></div>
      <div class="note">Tap a logged set to fix it.</div>
    </section>`;
  }).join('')}
  <button class="btn ghost full" data-act="train.addex">+ Add exercise</button>
  </div>`;
}

export function render() {
  if (S.activeWorkout) return activeView();
  const k = dkey(), wd = new Date().getDay(), key = S.settings.split[wd], tpl = key && S.templates[key];
  const doneToday = !!S.days[k]?.workoutDone;
  const names = allExerciseNames().filter(n => S.workouts.some(w => w.exercises.some(e => norm(e.name) === norm(n))));
  const sel = nav.sub.trainEx && names.includes(nav.sub.trainEx) ? nav.sub.trainEx : names[0];
  const pts = sel ? S.workouts.filter(w => w.exercises.some(e => norm(e.name) === norm(sel))).map(w => {
    const ex = w.exercises.find(e => norm(e.name) === norm(sel));
    return { x: niceDate(w.date), y: r1(Math.max(...ex.sets.map(s => e1rm(s.w, s.r)))) };
  }).filter(p => p.y > 0).slice(-20) : [];

  return `<div class="wrap">
  <section class="panel">
    <div class="ptitle"><span>Today</span></div>
    ${tpl ? `<div class="bigline"><div><b>${esc(tpl.name)}</b><span> · ${DOW[wd]}</span></div></div>
      <div class="note">${tpl.exercises.length ? tpl.exercises.map(e => esc(e.name)).join(' · ') : 'No exercises saved for this day yet. Start the session and add them as you go.'}</div>
      ${doneToday ? `<div class="donebox">Session complete. Quest cleared.</div><button class="btn ghost full mt" data-act="train.start" data-tpl="${key}">Log another session</button>`
        : `<button class="btn full mt" data-act="train.start" data-tpl="${key}">Start ${esc(tpl.name)} session</button>`}`
      : `<div class="bigline"><div><b>Rest day</b><span> · ${DOW[wd]}</span></div></div>
      <div class="note">Recovery is where you grow. Eat your targets and get to bed on time.</div>
      <button class="btn ghost full mt" data-act="train.start">Train anyway</button>`}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Weekly split</span></div>
    ${[1, 2, 3, 4, 5, 6, 0].map(d => { const tk = S.settings.split[d], t = tk && S.templates[tk];
      return `<div class="row${d === wd ? ' cur' : ''}"><span class="dow">${DOW3[d]}</span>
        <span class="grow rt sm">${t ? esc(t.name) : '<span class="muted">Rest</span>'}</span>
        ${t ? `<span class="rs">${t.exercises.length ? `${t.exercises.length} ex` : 'empty'}</span><button class="iconbtn" data-act="train.edittpl" data-tpl="${tk}" aria-label="Edit">✎</button>` : ''}</div>`; }).join('')}
    <div class="note">Change which day is which in Status → Settings.</div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Progress</span></div>
    ${names.length ? `<select data-chg="train.prog">${names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <div class="sub mt">Estimated 1-rep max (lb), best set each session</div>${lineChart(pts, { unit: '' })}
      ${S.prs[norm(sel)] ? `<div class="note">Best: ${S.prs[norm(sel)].w} lb × ${S.prs[norm(sel)].r} on ${niceDate(S.prs[norm(sel)].date)}</div>` : ''}`
      : '<div class="empty">Finish a session to start tracking progress.</div>'}
  </section>

  <section class="panel">
    <div class="ptitle"><span>History</span></div>
    ${S.workouts.length ? [...S.workouts].reverse().slice(0, 12).map(w => {
      const sets = w.exercises.reduce((a, x) => a + x.sets.length, 0), vol = w.exercises.reduce((a, x) => a + x.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
      return `<button class="row btnrowitem" data-act="train.history" data-id="${w.id}"><div class="grow"><div class="rt sm">${esc(w.name)}</div>
        <div class="rs">${niceDate(w.date)} · ${sets} sets · ${fmt(vol)} lb</div></div><span class="rs">›</span></button>`; }).join('')
      : '<div class="empty">No sessions yet.</div>'}
  </section>
  </div>`;
}
