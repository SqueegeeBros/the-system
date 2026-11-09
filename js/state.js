// App state: defaults, loading, saving.
import { kvGet, kvSet } from './db.js';
import { dkey } from './util.js';

export const S = {};            // the live state object (mutated in place)
let mirrorFn = () => null;     // set by engine: small status record the service worker reads
export const setMirror = fn => { mirrorFn = fn; };


export function defaults() {
  return {
    v: 1,
    createdAt: Date.now(),
    profile: { name: '', about: '', workLabel: '' },
    onboarded: false,
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
      allergens: [],
      geminiKey: '',
      geminiModel: 'gemini-flash-latest',
      driveClientId: '',
      notify: false,
    },
    hunter: {
      level: 1, xp: 0, totalXP: 0, streak: 0, bestStreak: 0, missStreak: 0,
      stats: { STR: 10, VIT: 10, INT: 10, DIS: 10 },
    },
    meals: [],
    templates: {
      upper: { name: 'Upper', exercises: [] },
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
    bizTasks: [],
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
  out.profile = { ...base.profile, ...(saved.profile || {}) };
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
  if (saved && saved.onboarded === undefined) {
    // existing install from before onboarding existed
    S.onboarded = true;
    if (S.profile.name === 'Nathan') {
      if (!S.profile.workLabel) S.profile.workLabel = 'Squeegee Bros';
      if (!S.profile.about) S.profile.about = "19, 6'4\", lean bulk for muscle. Lifts 5 days a week around 4–5 AM before technical school. Meal-preps on a budget (Aldi/Walmart). Runs Squeegee Bros, an exterior-cleaning business (windows, gutters, pressure washing), and struggles with distraction during work time. Never suggest peanut butter or peanuts.";
    }
  }
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
