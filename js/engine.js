// Game rules: quests, XP, levels, ranks, streaks, penalties.
import { S, day, save, setMirror, logEvent } from './state.js';
import { dkey, addDays, parseKey } from './util.js';

export const RANKS = [
  { r: 'E', min: 1 }, { r: 'D', min: 10 }, { r: 'C', min: 20 },
  { r: 'B', min: 35 }, { r: 'A', min: 50 }, { r: 'S', min: 75 },
];
export const rankOf = lvl => RANKS.filter(x => lvl >= x.min).pop().r;
export const need = lvl => lvl * 100;
export const mult = () => 1 + 0.1 * Math.min(S.hunter.streak, 10);

export const QUEST_XP = 25, BONUS_XP = 50, BIZ_XP = 10, PR_XP = 15;
export const MILESTONE_XP = { S: 50, M: 100, L: 200, XL: 400 };

export const QDEF = {
  nutrition: { stat: 'VIT', label: 'Fuel the body' },
  workout:   { stat: 'STR', label: 'Training session' },
  focus:     { stat: 'INT', label: 'Deep work' },
  sleep:     { stat: 'DIS', label: 'Recovery' },
};
export const STAT_INFO = {
  STR: 'Strength. +1 for every training session you finish.',
  VIT: 'Vitality. +1 each day you hit your calories and protein.',
  INT: 'Intelligence. +1 each day you complete your deep-work block.',
  DIS: 'Discipline. +1 each night you check in by your bedtime.',
};

let notifyFn = () => {};
export const onNotice = fn => { notifyFn = fn; };

// ---------- Quest definitions ----------
export const templateFor = k => S.settings.split[parseKey(k).getDay()] || null;

export function required(k) {
  const wd = parseKey(k).getDay(), s = S.settings, q = ['nutrition'];
  if (s.split[wd]) q.push('workout');
  if (s.focusDays.includes(wd)) q.push('focus');
  if (s.bedNights.includes(wd)) q.push('sleep');
  return q;
}

export function totals(k) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  (S.days[k]?.food || []).forEach(e => { t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f; });
  return t;
}

export function focusSecFor(k) {
  const base = S.days[k]?.focusSec || 0;
  if (S.focus.running && S.focus.date === k) return base + (Date.now() - S.focus.startedAt) / 1000;
  return base;
}

export function met(q, k) {
  const d = S.days[k] || {};
  switch (q) {
    case 'nutrition': { const t = totals(k); return t.kcal >= S.settings.targets.kcal && t.p >= S.settings.targets.p; }
    case 'workout': return !!d.workoutDone;
    case 'focus': return focusSecFor(k) >= S.settings.focusMin * 60;
    case 'sleep': return !!d.sleepAt;
  }
  return false;
}

// ---------- XP ----------
export function gainXP(base) {
  const h = S.hunter, g = Math.round(base * mult());
  h.xp += g; h.totalXP += g;
  const dk = dkey(); S.xpLog = S.xpLog || {}; S.xpLog[dk] = (S.xpLog[dk] || 0) + g;
  while (h.xp >= need(h.level)) {
    h.xp -= need(h.level);
    const before = rankOf(h.level);
    h.level++;
    const after = rankOf(h.level);
    logEvent(`Reached level ${h.level}${before !== after ? ` — promoted to Rank ${after}` : ''}`);
    notifyFn({ type: 'levelup', level: h.level, rankUp: before !== after ? after : null });
  }
  return g;
}

export function loseXP(n) {
  const h = S.hunter;
  const dk = dkey(); S.xpLog = S.xpLog || {}; S.xpLog[dk] = (S.xpLog[dk] || 0) - n;
  h.totalXP = Math.max(0, h.totalXP - n);
  h.xp -= n;
  while (h.xp < 0) {
    if (h.level <= 1) { h.xp = 0; break; }
    h.level--;
    h.xp += need(h.level);
  }
}

function demote() {
  const h = S.hunter, idx = RANKS.findIndex(x => x.r === rankOf(h.level));
  if (idx <= 0) return null;
  h.level = RANKS[idx].min - 1;
  h.xp = 0;
  return RANKS[idx - 1].r;
}

// ---------- Live sync: award anything newly completed today ----------
export function sync(k = dkey()) {
  const d = day(k);
  if (d.paused) return;
  for (const q of required(k)) {
    if (met(q, k) && !d.paid[q]) {
      d.paid[q] = true;
      const st = QDEF[q].stat;
      S.hunter.stats[st]++;
      const g = gainXP(QUEST_XP);
      logEvent(`Quest cleared: ${questLabel(q, k)} (+${g} XP)`);
      notifyFn({ type: 'quest', q, label: questLabel(q, k), xp: g, stat: st });
    }
  }
  if (!d.bonus && required(k).every(q => met(q, k))) {
    d.bonus = true;
    S.hunter.streak++;
    S.hunter.bestStreak = Math.max(S.hunter.bestStreak, S.hunter.streak);
    const g = gainXP(BONUS_XP);
    logEvent(`All daily quests cleared — streak ${S.hunter.streak}`);
    notifyFn({ type: 'allclear', streak: S.hunter.streak, xp: g });
  }
  checkMedals();
  save();
}

// ---------- Medals ----------
const totalVolume = () => S.workouts.reduce((a, w) => a + w.exercises.reduce((b, x) => b + x.sets.reduce((c, s) => c + s.w * s.r, 0), 0), 0);
const totalFocusH = () => Object.keys(S.days).reduce((a, k) => a + focusSecFor(k), 0) / 3600;
const macroDays = () => Object.values(S.days).filter(d => d.paid?.nutrition).length;
const bedDays = () => Object.values(S.days).filter(d => d.sleepAt).length;
export const MEDALS = [
  { id: 'first-session', icon: '1', name: 'First session', test: () => S.workouts.length >= 1 },
  { id: 'first-pr', icon: 'PR', name: 'First record', test: () => (S.prCount || 0) >= 1 },
  { id: 'streak-7', icon: '7', name: '7-day streak', test: () => S.hunter.bestStreak >= 7 },
  { id: 'macro-7', icon: 'M7', name: '7 days on macros', test: () => macroDays() >= 7 },
  { id: 'bed-7', icon: 'Z7', name: '7 nights on time', test: () => bedDays() >= 7 },
  { id: 'focus-10', icon: '10h', name: '10 hours deep work', test: () => totalFocusH() >= 10 },
  { id: 'vol-10k', icon: '10K', name: '10,000 lb lifted', test: () => totalVolume() >= 10000 },
  { id: 'sessions-20', icon: '20', name: '20 sessions', test: () => S.workouts.length >= 20 },
  { id: 'rank-d', icon: 'D', name: 'Reach Rank D', test: () => S.hunter.level >= 10 },
  { id: 'streak-30', icon: '30', name: '30-day streak', test: () => S.hunter.bestStreak >= 30 },
  { id: 'pr-10', icon: '10PR', name: '10 records', test: () => (S.prCount || 0) >= 10 },
  { id: 'focus-50', icon: '50h', name: '50 hours deep work', test: () => totalFocusH() >= 50 },
  { id: 'vol-100k', icon: '100K', name: '100,000 lb lifted', test: () => totalVolume() >= 100000 },
  { id: 'macro-30', icon: 'M30', name: '30 days on macros', test: () => macroDays() >= 30 },
  { id: 'rank-c', icon: 'C', name: 'Reach Rank C', test: () => S.hunter.level >= 20 },
  { id: 'streak-100', icon: '100', name: '100-day streak', test: () => S.hunter.bestStreak >= 100 },
];
export function checkMedals() {
  S.medals = S.medals || {};
  for (const m of MEDALS) {
    if (!S.medals[m.id] && m.test()) {
      S.medals[m.id] = dkey();
      logEvent(`Medal earned: ${m.name}`);
      notifyFn({ type: 'medal', medal: m });
    }
  }
}
export function weekXP(offsetWeeks = 0) {
  const today = dkey(), back = (parseKey(today).getDay() + 6) % 7;
  const monday = addDays(today, -back - 7 * offsetWeeks);
  let sum = 0; const days = [];
  for (let i = 0; i < 7; i++) { const k = addDays(monday, i); days.push(k); sum += (S.xpLog?.[k] || 0); }
  return { sum, days };
}

export function questLabel(q, k) {
  if (q === 'workout') { const t = templateFor(k); return `${S.templates[t]?.name || 'Training'} session`; }
  return QDEF[q].label;
}

// ---------- Midnight processing: penalties for past days ----------
export function rollover() {
  const today = dkey();
  if (!S.lastProcessed) { S.lastProcessed = addDays(today, -1); save(); return []; }
  const reports = [];
  let k = addDays(S.lastProcessed, 1), guard = 0;
  while (k < today && guard++ < 400) {
    const d = S.days[k];
    if (d?.paused) {
      reports.push({ k, paused: true });
    } else {
      const missed = required(k).filter(q => !met(q, k));
      if (missed.length) {
        const loss = S.settings.penaltyXP * missed.length;
        loseXP(loss);
        const lostStreak = S.hunter.streak;
        S.hunter.streak = 0;
        S.hunter.missStreak++;
        let demoted = null;
        if (S.hunter.missStreak >= 3) { demoted = demote(); S.hunter.missStreak = 0; }
        logEvent(`Penalty for ${k}: ${missed.length} quest(s) missed, −${loss} XP${demoted ? `, demoted to Rank ${demoted}` : ''}`);
        reports.push({ k, missed: missed.map(q => questLabel(q, k)), loss, lostStreak, demoted });
      } else {
        S.hunter.missStreak = 0;
      }
    }
    k = addDays(k, 1);
  }
  S.lastProcessed = addDays(today, -1);
  save();
  return reports;
}

// ---------- Pause days ----------
export function pausesLeft() {
  const ym = dkey().slice(0, 7);
  return S.settings.pausesPerMonth - S.pauseLog.filter(x => x.startsWith(ym)).length;
}
export function setPaused(on) {
  const k = dkey(), d = day(k);
  if (on && !d.paused) {
    if (pausesLeft() <= 0) return false;
    d.paused = true; S.pauseLog.push(k); logEvent('Paused today — no penalties');
  } else if (!on && d.paused) {
    d.paused = false; S.pauseLog = S.pauseLog.filter(x => x !== k); logEvent('Pause removed');
  }
  save();
  return true;
}

// ---------- Sleep check-in window ----------
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export function sleepWindow() {
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const open = toMin(S.settings.checkinOpens), close = toMin(S.settings.bedtime) + 15;
  return { state: cur < open ? 'early' : cur > close ? 'late' : 'open' };
}
export const bedtimeLabel = () => {
  const [h, m] = S.settings.bedtime.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// ---------- Helpers used by the service worker mirror ----------
setMirror(() => {
  const k = dkey();
  if (!S.days) return null;
  const d = S.days[k];
  return {
    date: k,
    open: d?.paused ? 0 : required(k).filter(q => !met(q, k)).length,
    notify: !!S.settings?.notify,
  };
});

// Day status for history (all / partial / missed / paused / none)
export function dayResult(k) {
  const d = S.days[k];
  if (k >= dkey()) return 'today';
  if (S.lastProcessed && k > S.lastProcessed) return 'none';
  if (d?.paused) return 'paused';
  if (k < dkey(new Date(S.createdAt))) return 'none';
  const req = required(k), done = req.filter(q => met(q, k)).length;
  return done === req.length ? 'all' : done ? 'partial' : 'missed';
}
