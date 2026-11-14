// Boot, routing, event delegation, live ticking, notices, cross-device sync.
import { S, load, save, flush } from './state.js';
import * as E from './engine.js';
import { $, $$, esc, niceDate } from './util.js';
import { ACT, CHG, TICK, nav, go, rerender } from './core.js';
import { notice, toast } from './ui.js';

const APP_VERSION = 15;
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
import { loadFace, flushFace } from './face/store.js';

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
let lastViewKey = '';

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
  const key = [nav.tab, nav.sub.health, nav.sub.face, nav.sub.food].join('|');
  if (key !== lastViewKey) { main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); lastViewKey = key; }
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
window.addEventListener('pagehide', () => { flush(); flushFace(); });

// ---------- Boot ----------
(async function boot() {
  await load();
  try { await loadFace(); } catch { }
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
  // One-time (v14): allergy restrictions, meal-plan templates and calorie range from the supplied plan.
  if (!S.migr.face1) {
    const al = S.settings.allergens, has = w => al.some(a => a.toLowerCase().includes(w));
    const add = ['peanut', 'tree nut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut'].filter(w => !has(w));
    S.settings.allergens = [...al, ...add];
    const em = S.health.emergency;
    const parts = String(em.allergies || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!parts.some(x => /peanut/i.test(x))) parts.push('Peanuts');
    if (!parts.some(x => /tree/i.test(x))) parts.push('Tree nuts');
    em.allergies = parts.join(', ');
    const T = (name, tag, kcal, p, c, f, ingredients, note) => ({ id: 'plan_' + name.toLowerCase().replace(/[^a-z]+/g, '_'), name, tag, kcal, p, c, f, servings: 1, ingredients, pinned: false, estimate: true, planTemplate: true, note, prep: { on: false, batches: 1 } });
    const PLAN = [
      T('Plan breakfast: eggs, oats, banana', 'Breakfast', 700, 37, 81, 25, [{ item: 'Eggs, large', qty: 4, unit: '' }, { item: 'Oats (dry weight)', qty: 80, unit: 'g' }, { item: 'Banana', qty: 1, unit: '' }], 'Estimate from your meal plan. Optional sausage is not included: log it separately. Enter label values to replace the estimate.'),
      T('Plan training snack: banana + rice cakes', 'Pre-gym', 175, 3, 42, 1, [{ item: 'Banana', qty: 1, unit: '' }, { item: 'Rice cakes', qty: 2, unit: '' }], 'Estimate from your meal plan.'),
      T('Plan lunch: chicken, rice, beans, veg', 'Lunch', 1010, 55, 146, 21, [{ item: 'Chicken breast (raw weight)', qty: 150, unit: 'g' }, { item: 'Rice (dry weight)', qty: 140, unit: 'g' }, { item: 'Beans (drained weight)', qty: 150, unit: 'g' }, { item: 'Vegetables', qty: 150, unit: 'g' }, { item: 'Olive oil', qty: 15, unit: 'g' }], 'Estimate from your meal plan. Weights: chicken raw, rice dry, beans drained.'),
      T('Plan dinner: pasta, lentils, tomatoes', 'Dinner', 1045, 49, 175, 20, [{ item: 'Whole-wheat pasta (dry weight)', qty: 140, unit: 'g' }, { item: 'Lentils (dry weight)', qty: 100, unit: 'g' }, { item: 'Tomatoes', qty: 200, unit: 'g' }, { item: 'Vegetables', qty: 100, unit: 'g' }, { item: 'Olive oil', qty: 15, unit: 'g' }], 'Estimate from your meal plan. Weights: pasta and lentils dry.'),
      T('Plan add-on: whole-grain bread or bagel', 'Snack', 160, 8, 28, 2, [{ item: 'Whole-grain bread (2 slices) or 1 bagel', qty: 1, unit: '' }], 'Estimate for 2 slices of bread. A bagel is about 280 kcal: edit the amount when you log it. Log what you put on it separately and check its label for nuts.'),
    ];
    let added = 0;
    PLAN.forEach(m => { if (!S.meals.some(x => x.name === m.name || x.id === m.id)) { S.meals.push(m); added++; } });
    S.settings.planRange = S.settings.planRange || { lo: 3200, hi: 3400 };
    S.migr.face1 = true; save();
    if (added || add.length) toast(`${added ? `${added} meal-plan templates added to My Meals (estimates)` : ''}${added && add.length ? ' · ' : ''}${add.length ? 'Tree-nut allergy words added' : ''}`);
  }
  // One-time (v15): revised Sunday-prep plan. Keeps only the five plan meals, set up for a 7-day shopping list.
  // Removed meals are archived (not destroyed) and can be restored from Fuel → Meals.
  if (!S.migr.meals2) {
    const I = (item, qty, unit = '') => ({ item, qty, unit });
    const M = (id, name, tag, kcal, p, c, f, servings, batches, ingredients, note) => ({ id, name, tag, kcal, p, c, f, servings, ingredients, pinned: true, estimate: true, planTemplate: true, note, prep: { on: true, batches } });
    const PLAN = [
      M('plan_plan_breakfast_eggs_oats_banana', 'Breakfast: eggs, oats, banana + sausage', 'Breakfast', 865, 45, 84, 39, 1, 7,
        [I('Eggs, large', 4), I('Rolled oats (dry weight)', 80, 'g'), I('Banana', 1), I('Breakfast sausage (1 serving, check label)', 1), I('Cinnamon', 0)],
        'Generic estimate per plate, with sausage. Without sausage it is about 700 kcal: replace it with 1 tbsp olive oil elsewhere or more oats/bread. Cook eggs fresh each day.'),
      M('plan_plan_training_snack_banana_rice_cakes', 'Pre-workout: banana + 2 rice cakes', 'Pre-gym', 175, 3, 42, 1, 1, 7,
        [I('Banana', 1), I('Plain rice cakes', 2)], 'Training fuel. If you notice a skin pattern, swap the rice cakes for 2 slices of whole-grain bread and log the change.'),
      M('plan_plan_lunch_chicken_rice_beans_veg', 'Lunch: chicken, rice & bean bowl', 'Lunch', 1060, 59, 151, 24, 7, 1,
        [I('Chicken breast, boneless skinless (raw weight)', 1050, 'g'), I('Brown or parboiled rice (dry weight)', 980, 'g'), I('Beans, canned (drained weight, ~5 cans)', 1050, 'g'), I('Frozen mixed vegetables', 1050, 'g'), I('Olive oil', 105, 'g'), I('Lemon, garlic, pepper / cumin, paprika', 0)],
        'Batch of 7 bowls. Per bowl: 150 g raw chicken, 140 g dry rice, 150 g drained beans, 150 g veg, 15 g oil. Cook chicken to 165°F. Fridge 3 portions, freeze the rest.'),
      M('plan_plan_dinner_pasta_lentils_tomatoes', 'Dinner: lentil-tomato whole-wheat pasta', 'Dinner', 1070, 50, 182, 21, 7, 1,
        [I('Whole-wheat pasta (dry weight)', 980, 'g'), I('Dry lentils', 700, 'g'), I('Crushed tomatoes, no salt added (~4 cans)', 1400, 'g'), I('Frozen spinach or mixed vegetables', 700, 'g'), I('Olive oil', 105, 'g'), I('Garlic, oregano, pepper', 0)],
        'Batch of 7 bowls. Per bowl: 140 g dry pasta, 100 g dry lentils, 200 g tomatoes, 100 g veg, 15 g oil. If lentils are too filling, start at 50 g dry and add pasta or oil instead.'),
      M('plan_plan_add_on_whole_grain_bread_or_bagel', 'Add-on: whole-grain bread + olive oil', 'Snack', 325, 10, 36, 17, 1, 7,
        [I('Whole-grain bread (slices)', 2), I('Olive oil', 14, 'g')],
        'Between jobs on workdays. A bagel instead of bread is about 280 kcal before oil. Skip it on days you already hit your target.'),
    ];
    const keepEdited = S.meals.filter(m => m.planTemplate && m.estimate === false);   // you edited it: leave it alone
    const removed = S.meals.filter(m => !m.planTemplate);
    S.meals = [...PLAN.filter(p => !keepEdited.some(k => k.id === p.id)), ...keepEdited];
    if (removed.length) S.mealsArchive = { at: Date.now(), meals: [...(S.mealsArchive?.meals || []), ...removed] };
    S.shopping.checked = {};
    S.migr.meals2 = true; save();
    toast(`Meals updated to your Sunday prep plan${removed.length ? ` · ${removed.length} other meal${removed.length > 1 ? 's' : ''} removed (restore in Fuel → Meals)` : ''}`);
  }
  let introShown = false;
  if (!S.migr.swapPP && S.profile.name === 'Nathan') {
    if (S.settings.split[3] === 'pull' && S.settings.split[4] === 'push') { S.settings.split[3] = 'push'; S.settings.split[4] = 'pull'; toast('Wednesday is Push, Thursday is Pull'); }
    S.migr.swapPP = true; save();
  }
  if (!S.onboarded) openOnboarding();
  else if (!S.seenHealthIntro) {
    S.seenHealthIntro = true; introShown = true; save();
    notice({ title: 'New: Health', html: `<div class="msg sm">Train moved into the new <b>Health</b> tab, with sets this week per muscle, your split, progress and history. Health also has pills & meds, recovery check-ins, DEXA scans, labs, records, symptoms and research news.<br><br>Fuel now has meal slots (pre-workout, post-workout, dinner…), food search and a <b>Plan</b> page.<br><br>To sync your phone and computer, sign in under <b>Profile → Settings → Account & sync</b>. Text size is there too.</div>`, btn: 'Got it' });
  }
  if (S.onboarded && !S.seenFaceIntro && !introShown) {
    S.seenFaceIntro = true; introShown = true; save();
    notice({ title: 'New: Face', html: `<div class="msg sm">Health now has <b>Face</b>: weekly front and side photos with comparisons, a 30-second skin check-in, your skincare routine, and grooming reminders.<br><br>Face photos and skin records stay on this phone. They aren't synced or included in the main backup, so use <b>Face → Data → Export</b> to keep a copy.<br><br>Fuel's water card now works in bottles, with undo.</div>`, btn: 'Got it' });
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
