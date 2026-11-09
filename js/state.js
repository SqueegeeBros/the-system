// App state: defaults, loading, saving.
import { kvGet, kvSet } from './db.js';
import { dkey } from './util.js';

export const S = {};            // the live state object (mutated in place)
let mirrorFn = () => null;     // set by engine: small status record the service worker reads
export const setMirror = fn => { mirrorFn = fn; };

const ex = (id, name, sets, reps, rest) => ({ id, name, sets, reps, rest });

export function defaults() {
  return {
    v: 1,
    createdAt: Date.now(),
    profile: { name: 'Nathan' },
    settings: {
      targets: { kcal: 3300, p: 180, c: 440, f: 90, waterOz: 120 },
      // weekday (0=Sun) -> template key; missing = rest day
      split: { 1: 'upper', 2: 'lower', 3: 'push', 4: 'pull', 5: 'legs' },
      focusMin: 90,
      focusDays: [1, 2, 3, 4, 5],
      bedtime: '20:00',
      bedNights: [0, 1, 2, 3, 4],      // nights before a training day
      checkinOpens: '17:00',
      penaltyXP: 30,
      pausesPerMonth: 4,
      allergens: ['peanut'],
      geminiKey: '',
      geminiModel: 'gemini-flash-latest',
      driveClientId: '',
      notify: false,
    },
    hunter: {
      level: 1, xp: 0, totalXP: 0, streak: 0, bestStreak: 0, missStreak: 0,
      stats: { STR: 10, VIT: 10, INT: 10, DIS: 10 },
    },
    meals: [
      { id: 'm-ricecakes', name: 'Rice cakes ×2', tag: 'Pre-gym', kcal: 70, p: 1, c: 15, f: 0, servings: 1,
        ingredients: [{ item: 'Rice cakes', qty: 2, unit: '' }], pinned: true, estimate: true, prep: { on: true, batches: 5 } },
      { id: 'm-eggs', name: '4 eggs + sausage', tag: 'Post-gym', kcal: 455, p: 33, c: 2, f: 34, servings: 1,
        ingredients: [{ item: 'Eggs', qty: 4, unit: '' }, { item: 'Sausage', qty: 1, unit: 'serving' }], pinned: true, estimate: true, prep: { on: true, batches: 5 } },
      { id: 'm-beefrice', name: 'Beef & rice bowl', tag: 'Lunch', kcal: 700, p: 54, c: 72, f: 17, servings: 5,
        ingredients: [{ item: 'Lean ground beef', qty: 2.5, unit: 'lb' }, { item: 'Rice (dry)', qty: 1, unit: 'lb' }, { item: 'Frozen vegetables', qty: 1, unit: 'large bag' }],
        pinned: true, estimate: true, prep: { on: true, batches: 1 } },
      { id: 'm-oats', name: 'Overnight oats', tag: 'Breakfast', kcal: 605, p: 39, c: 96, f: 9, servings: 1,
        ingredients: [{ item: 'Oats (dry)', qty: 1, unit: 'cup' }, { item: 'Greek yogurt', qty: 1, unit: 'cup' }, { item: 'Milk', qty: 0.5, unit: 'cup' },
          { item: 'Berries', qty: 0.5, unit: 'cup' }, { item: 'Honey', qty: 1, unit: 'tbsp' }], pinned: false, estimate: true, prep: { on: false, batches: 5 } },
    ],
    templates: {
      upper: { name: 'Upper', exercises: [
        ex('e1', 'Machine chest press', 3, '8–12', 150), ex('e2', 'Lat pulldown', 3, '8–12', 150), ex('e3', 'Seated cable row', 3, '8–12', 150),
        ex('e4', 'Incline dumbbell press', 3, '8–12', 150), ex('e5', 'Lateral raises', 3, '12–20', 90),
        ex('e6', 'Rope triceps pushdown', 3, '10–15', 90), ex('e7', 'Dumbbell biceps curl', 3, '10–15', 90)] },
      lower: { name: 'Lower', exercises: [] },
      push: { name: 'Push', exercises: [] },
      pull: { name: 'Pull', exercises: [] },
      legs: { name: 'Legs', exercises: [] },
    },
    days: {},              // 'YYYY-MM-DD' -> day record
    workouts: [],          // finished sessions
    activeWorkout: null,
    prs: {},               // exercise name (lowercase) -> {e1rm, w, r, date}
    focus: { running: false, startedAt: null, date: null },
    bizTasks: [
      { id: 'b1', name: 'Follow up with every open quote' },
      { id: 'b2', name: 'Reach out to 5 new prospects' },
      { id: 'b3', name: 'Post one before/after' },
    ],
    milestones: [],
    weights: [],           // {date, lb}
    shopping: { extras: [], checked: {} },
    pauseLog: [],          // dates paused
    lastProcessed: null,
    backup: { lastAt: 0, fileId: null },
    events: [],            // recent system log
    chat: [],              // coach conversation
    xpLog: {},             // date -> net XP
    medals: {},            // medal id -> date earned
    prCount: 0,
  };
}

export const blankDay = () => ({
  food: [], water: 0, focusSec: 0, sessions: [], distractions: [],
  workoutDone: false, sleepAt: null, bizDone: [], bizPaid: [], paid: {}, bonus: false, paused: false,
});

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base, ...saved };
  out.settings = { ...base.settings, ...(saved.settings || {}) };
  out.settings.targets = { ...base.settings.targets, ...((saved.settings || {}).targets || {}) };
  out.hunter = { ...base.hunter, ...(saved.hunter || {}) };
  out.hunter.stats = { ...base.hunter.stats, ...((saved.hunter || {}).stats || {}) };
  out.templates = { ...base.templates, ...(saved.templates || {}) };
  out.shopping = { ...base.shopping, ...(saved.shopping || {}) };
  out.backup = { ...base.backup, ...(saved.backup || {}) };
  out.focus = { ...base.focus, ...(saved.focus || {}) };
  return out;
}

export async function load() {
  const saved = await kvGet('state');
  replace(merge(defaults(), saved));
  return S;
}

export function replace(obj) {
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, merge(defaults(), obj));
}

export function day(k = dkey()) {
  if (!S.days[k]) S.days[k] = blankDay();
  const d = S.days[k];
  for (const [key, val] of Object.entries(blankDay())) if (d[key] === undefined) d[key] = val;
  return d;
}

let timer = null;
export function save() { clearTimeout(timer); timer = setTimeout(flush, 200); }
export async function flush() {
  clearTimeout(timer);
  await kvSet('state', JSON.parse(JSON.stringify(S)));
  const m = mirrorFn();
  if (m) await kvSet('status', m);
}

export function logEvent(text) {
  S.events.unshift({ t: Date.now(), text });
  S.events.length = Math.min(S.events.length, 80);
}
