// Boot, routing, event delegation, live ticking, notices, cross-device sync.
import { S, load, save, flush } from './state.js';
import * as E from './engine.js';
import { $, $$, esc, niceDate } from './util.js';
import { ACT, CHG, TICK, nav, go, rerender } from './core.js';
import { notice, toast } from './ui.js';

const APP_VERSION = 13;
import { storageOK } from './db.js';
import * as Quests from './views/quests.js';
import * as Food from './views/food.js';
import * as Train from './views/train.js';
import * as Work from './views/work.js';
import * as Status from './views/status.js';
import * as Settings from './views/settings.js';
import * as Health from './views/health.js';
import './views/coach.js';
import { openOnboarding } from './views/onboard.js';
import { autoBackup } from './backup.js';
import * as Sync from './sync.js';
import { migrateLegacyPhotos } from './files.js';

// If Chrome renders in "Desktop site" mode on a phone (page ~980px wide on a ~360px screen),
// scale the app back up so it looks like a phone app again.
function fitPhone() {
  const sw = screen.width, ratio = window.innerWidth / sw;
  document.documentElement.style.zoom = sw && sw < 600 && ratio > 1.3 ? String(ratio) : '';
}
fitPhone();
window.addEventListener('resize', fitPhone);

const VIEWS = { quests: Quests, food: Food, train: Train, work: Work, status: Status, settings: Settings, health: Health };
const NAV_OF = { train: 'health', settings: 'status' };   // which bottom tab lights up
const main = $('#view');

// Text size and high contrast (Settings → Easier to see)
export function applyDisplay() {
  document.documentElement.style.fontSize = ({ M: '15px', L: '18px', XL: '21px', XXL: '24px' })[S.ui?.text] || '18px';
  document.body.classList.toggle('hicon', !!S.ui?.hc);
}

nav.render = () => {
  // Training lives under Health; the full-screen logger only shows while a session is running.
  if (nav.tab === 'train' && !S.activeWorkout) { nav.tab = 'health'; nav.sub.health = 'training'; }
  const v = VIEWS[nav.tab] || Quests;
  const y = window.scrollY;
  applyDisplay();
  main.innerHTML = v.render();
  v.mount?.(main);
  $('#fab').hidden = nav.tab === 'settings' || !!S.activeWorkout && nav.tab === 'train';
  $$('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === (NAV_OF[nav.tab] || nav.tab)));
  tick();
  window.scrollTo(0, y);
};

// ---------- Notices from the engine ----------
E.onNotice(n => {
  if (n.type === 'quest') notice({ title: 'Quest complete', html: `<div class="msg">Quest cleared: <em>${esc(n.label)}</em></div><div class="rw">+${n.xp} XP · ${n.stat} +1</div>` });
  if (n.type === 'allclear') notice({ title: 'Daily quest complete', html: `<div class="msg">Every daily quest is cleared.<br>Streak: <em>${n.streak} day${n.streak > 1 ? 's' : ''}</em></div><div class="rw">BONUS +${n.xp} XP · MULTIPLIER ×${E.mult().toFixed(1)}</div>`, btn: 'Well done' });
  if (n.type === 'medal') notice({ title: 'Medal earned', tone: 'levelup', html: `<div class="medalbig"><div class="m">${esc(n.medal.icon)}</div></div><div class="msg">${esc(n.medal.name)}</div>`, btn: 'Nice' });
  if (n.type === 'levelup') notice({ title: 'Level up', tone: 'levelup', html: `<div class="msg"><span class="gold">${n.rankUp ? `Promoted to Rank ${n.rankUp}` : 'Level up'}</span>You are now level <em>${n.level}</em>.</div><div class="rw">KEEP THE STANDARD</div>` });
});

function showPenalties(reports) {
  const real = reports.filter(r => !r.paused);
  if (!real.length) return;
  const total = real.reduce((a, r) => a + r.loss, 0), dem = real.find(r => r.demoted);
  notice({
    title: 'Penalty', tone: 'penalty', btn: 'Understood',
    html: `<div class="penlist">${real.slice(-7).map(r => `<div class="row"><span class="grow"><b>${esc(niceDate(r.k))}</b><br><span class="rs">${r.missed.map(esc).join(', ')}</span></span><span class="red">−${r.loss} XP</span></div>`).join('')}
      ${real.length > 7 ? `<div class="rs">+${real.length - 7} more days</div>` : ''}</div>
      <div class="rw red">−${total} XP · STREAK RESET${dem ? ` · DEMOTED TO RANK ${dem.demoted}` : ''}</div>`,
  });
}

// ---------- Event delegation ----------
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act] && !a.disabled) { e.preventDefault(); ACT[a.dataset.act](a, e); return; }
  const t = e.target.closest('nav [data-tab]');
  if (t) { if (t.dataset.tab === 'health') nav.sub.health = null; go(t.dataset.tab); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e);
});
$('#photo-input').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; Food.onPhoto(f); });
$('#import-input').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; Settings.onImport(f); });

// ---------- Live ticking (timers, countdown) ----------
let lastDay = null;
function tick() {
  $$('[data-tick]').forEach(el => TICK[el.dataset.tick]?.(el));
}
function heartbeat() {
  const today = new Date().toDateString();
  if (lastDay && lastDay !== today) dayChanged();
  lastDay = today;
  tick();
}
function dayChanged() {
  Work.splitFocusAtMidnight();
  showPenalties(E.rollover());
  E.sync();
  rerender();
}

// ---------- Sync status ----------
Sync.onStatus(s => {
  if (s.replaced) { rerender(); toast('Updated with changes from your other device'); }
  const dot = $('#syncdot'); if (dot) { dot.className = 'syncdot ' + s.state; dot.title = s.state; }
});
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(false), ms))]);

window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (VIEWS[t] && t !== nav.tab) go(t); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    if (Sync.signedIn()) { const replaced = await withTimeout(Sync.pull(), 6000); if (replaced) toast('Synced from your other device'); }
    heartbeat(); E.sync(); rerender(); autoBackup().then(ok => ok && rerender());
  }
  else flush();
});
window.addEventListener('pagehide', () => flush());

// ---------- Boot ----------
(async function boot() {
  await load();
  applyDisplay();
  // Pull newer data from your account BEFORE the day rollover runs, so penalties use your latest logs.
  try { await withTimeout(Sync.boot(), 6000); } catch { }
  await migrateLegacyPhotos();
  Work.splitFocusAtMidnight();
  const reports = E.rollover();
  E.sync();
  const t = location.hash.slice(1);
  nav.tab = VIEWS[t] ? t : 'quests';
  rerender();
  showPenalties(reports);
  if (!storageOK) notice({ title: 'Storage unavailable', html: '<div class="msg sm">This browser is blocking storage, so nothing will be saved after you close it. Open the app from its installed icon or a normal browser tab.</div>', btn: 'OK' });
  // One-time: load Nathan's Lower A sheet into an empty Lower template (and an empty Lower session in progress)
  S.migr = S.migr || {};
  if (!S.migr.lowerA && S.profile.name === 'Nathan' && S.templates.lower) {
    const LOWER_A = [
      ['Leg press', 3, '8–12', 150], ['Dumbbell Romanian deadlift', 3, '8–10', 150], ['Seated leg curl', 3, '10–15', 105],
      ['Leg extension', 2, '10–15', 105], ['Standing calf raise', 3, '10–15', 90], ['Reverse crunch', 2, '10–20', 75],
    ];
    if (!S.templates.lower.exercises.length) {
      S.templates.lower.exercises = LOWER_A.map(([name, sets, reps, rest], i) => ({ id: 'la' + i, name, sets, reps, rest }));
      const aw = S.activeWorkout;
      if (aw && aw.tpl === 'lower' && !aw.exercises.length) {
        aw.exercises = LOWER_A.map(([name, sets, reps, rest], i) => ({ id: 'law' + i, name, target: `${sets} × ${reps}`, rest,
          sets: Array.from({ length: sets }, () => ({ w: '', r: '', done: false })), pr: false }));
      }
      toast('Lower A loaded: 6 exercises, 16 sets');
    }
    S.migr.lowerA = true; save();
  }
  // One-time: load Nathan's full 5-day program from his binder sheets
  if (!S.migr.program1 && S.profile.name === 'Nathan') {
    const E_ = (name, sets, reps, rest, note = '') => ({ name, sets, reps, rest, note });
    const P = {
      upper: ['Upper', [
        E_('Machine chest press', 3, '8–12', 150, 'Comfortable grip.'),
        E_('Chest-supported row', 3, '8–12', 120),
        E_('Incline dumbbell press', 2, '8–12', 150, 'Low incline, semi-neutral grip. If uncomfortable, swap for a comfortable chest press (same sets). Skip if pressing hurts.'),
        E_('Lat pulldown', 2, '8–12', 120, 'Medium/neutral grip.'),
        E_('Lateral raises', 3, '12–20', 90, 'Dumbbells, pain-free range.'),
        E_('Cable curl', 2, '10–15', 90, 'Can alternate with pressdowns: one set each, then rest 60–90 s.'),
        E_('Rope triceps pushdown', 2, '10–15', 90)]],
      lower: ['Lower A', [
        E_('Leg press', 3, '8–12', 150),
        E_('Dumbbell Romanian deadlift', 3, '8–10', 150, 'Load close, knees slightly bent, hips back, stop where you can control it without rounding. Shoulder bothered? Do 3 sets of hip-thrust machine instead.'),
        E_('Seated leg curl', 3, '10–15', 105),
        E_('Leg extension', 2, '10–15', 105),
        E_('Standing calf raise', 3, '10–15', 90),
        E_('Reverse crunch', 2, '10–20', 75)]],
      pull: ['Pull', [
        E_('Lat pulldown', 3, '8–12', 120, 'Medium/neutral grip.'),
        E_('Chest-supported row', 3, '8–12', 120),
        E_('Reverse pec deck', 2, '12–20', 90, 'Comfortable range. Skip it if it irritates the shoulder; don’t replace it.'),
        E_('Preacher curl machine', 3, '10–15', 90, 'Upper arms supported, control the bottom, no bouncing. Cable curls if the machine doesn’t fit.'),
        E_('Hammer curl', 2, '10–15', 90),
        E_('Reverse crunch', 2, '10–20', 75)]],
      push: ['Push', [
        E_('Incline dumbbell press', 3, '8–12', 150, 'Low incline, semi-neutral grip. Incline machine or comfortable flat press can replace it. No overhead pressing, overhead triceps, dips or deep flyes this block.'),
        E_('Machine chest press', 2, '8–12', 120),
        E_('Lateral raises', 3, '12–20', 90, 'Dumbbells, pain-free range.'),
        E_('Rope triceps pushdown', 3, '10–15', 90, 'Finishing early is fine. Don’t add sets to fill an hour.')]],
      legs: ['Lower B', [
        E_('Hack squat', 3, '8–12', 150, 'Only if the pads/setup are comfortable; otherwise leg press.'),
        E_('Seated leg curl', 3, '10–15', 105),
        E_('Leg extension', 2, '10–15', 105),
        E_('Hip-thrust machine', 2, '8–12', 120),
        E_('Standing calf raise', 3, '10–15', 90, 'Pads bother the shoulder? Straight-knee calf press on the leg press, or seated calf raises.'),
        E_('Reverse crunch', 2, '10–20', 75)]],
    };
    for (const [key, [name, list]] of Object.entries(P)) {
      S.templates[key] = { name, exercises: list.map((x, i) => ({ id: key + i, ...x })) };
    }
    S.settings.split = { 1: 'upper', 2: 'lower', 3: 'pull', 4: 'push', 5: 'legs' };
    // add notes to a Lower session already in progress
    const aw = S.activeWorkout;
    if (aw && aw.tpl === 'lower') { aw.name = 'Lower A'; aw.exercises.forEach(x => { const m = P.lower[1].find(e => e.name === x.name); if (m && !x.note) x.note = m.note; }); }
    S.migr.program1 = true; save();
    toast('Your 5-day program is loaded');
  }
  // One-time: Nathan's body numbers for the Health hub and bulk plan
  if (!S.migr.health1 && S.profile.name === 'Nathan') {
    Object.assign(S.health.profile, { heightIn: 75.5, bf: 8, activity: 1.6, goalRate: 0.5, goalWeight: 195, wake: '04:45', trainAt: '05:30' });
    if (!S.health.emergency.allergies) S.health.emergency.allergies = 'Peanuts';
    S.migr.health1 = true; save();
  }
  let introShown = false;
  if (!S.onboarded) openOnboarding();
  else if (!S.seenHealthIntro) {
    S.seenHealthIntro = true; introShown = true; save();
    notice({ title: 'New: Health', html: `<div class="msg sm">Train moved into the new <b>Health</b> tab, with sets this week per muscle, your split, progress and history. Health also has pills & meds, recovery check-ins, DEXA scans, labs, records, symptoms and research news.<br><br>Fuel now has meal slots (pre-workout, post-workout, dinner…), food search and a <b>Plan</b> page.<br><br>To sync your phone and computer, sign in under <b>Profile → Settings → Account & sync</b>. Text size is there too.</div>`, btn: 'Got it' });
  }
  if (S.appVersion && S.appVersion < APP_VERSION && !introShown) toast('The System updated. New features are live.');
  if (S.appVersion !== APP_VERSION) { S.appVersion = APP_VERSION; save(); }
  lastDay = new Date().toDateString();
  setInterval(heartbeat, 1000);
  autoBackup().then(ok => ok && rerender());
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  navigator.storage?.persist?.().catch(() => {});
})();
