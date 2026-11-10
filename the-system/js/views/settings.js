// SETTINGS: targets, schedule, rules, allergens, Gemini, backups, reminder, reset.
import { S, save, flush, defaults, replace } from '../state.js';
import * as E from '../engine.js';
import { $, esc, DOW3, num, niceDate, dkey } from '../util.js';
import { reg, regChg, rerender, go } from '../core.js';
import { notice, confirmBox, toast, busy } from '../ui.js';
import * as AI from '../ai.js';
import * as B from '../backup.js';
import * as Sync from '../sync.js';

const TPL_OPTS = () => [['', 'Rest'], ...Object.entries(S.templates).map(([k, t]) => [k, t.name])];

function setPath(path, value) {
  const parts = path.split('.'); let o = S;
  while (parts.length > 1) o = o[parts.shift()];
  o[parts[0]] = value;
}
const numField = (label, path, val, step = 1) =>
  `<label class="field"><span>${label}</span><input type="number" inputmode="decimal" step="${step}" value="${val}" data-chg="set.num" data-path="${path}"></label>`;
const dayChecks = (path, arr) => `<div class="daychecks">${[1, 2, 3, 4, 5, 6, 0].map(d =>
  `<label class="daycheck"><input type="checkbox" data-chg="set.day" data-path="${path}" data-d="${d}" ${arr.includes(d) ? 'checked' : ''}><span>${DOW3[d][0]}</span></label>`).join('')}</div>`;

export function render() {
  const s = S.settings, T = s.targets;
  const last = S.backup.lastAt ? new Date(S.backup.lastAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
  const hp = S.health.profile, ft = Math.floor(hp.heightIn / 12), inch = Math.round((hp.heightIn - ft * 12) * 10) / 10;
  const sel = (path, cur, opts) => `<select data-chg="set.numsel" data-path="${path}">${opts.map(([v, n]) => `<option value="${v}" ${+cur === +v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const st = Sync.status, cfgd = Sync.configured(), inn = Sync.signedIn();
  const syncedAt = st.at ? new Date(st.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'not yet';
  return `<div class="wrap">
  <button class="linkbtn back" data-act="nav.go" data-tab="status">‹ Profile</button>

  <section class="panel">
    <div class="ptitle"><span>Easier to see</span></div>
    <div class="sub">Text size</div>
    <div class="seg textseg">${[['M', 'A'], ['L', 'A+'], ['XL', 'A++'], ['XXL', 'A+++']].map(([k, n], i) => `<button class="${S.ui.text === k ? 'on' : ''}" data-act="set.text" data-v="${k}" style="font-size:${0.85 + i * 0.18}rem" aria-label="Text size ${n}">${n}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" data-chg="set.hc" ${S.ui.hc ? 'checked' : ''}> High contrast (brighter text, stronger lines)</label>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Account & sync</span></div>
    ${!cfgd ? `<div class="note" style="margin-top:0">Sign in on every device (phone, computer) and your data, DEXA scans, records and photos stay in sync. One-time setup: create a free Supabase project (steps in SETUP.md), then paste its two values here.</div>
      <label class="field"><span>Supabase project URL</span><input id="sy-url" placeholder="https://xxxx.supabase.co" value="${esc(s.syncUrl)}"></label>
      <label class="field"><span>Anon / publishable key</span><input id="sy-key" autocomplete="off" value="${esc(s.syncKey)}"></label>
      <button class="btn full mt" data-act="sync.savecfg">Save</button>`
    : inn ? `<div class="bigline"><div><b>Signed in</b><span> · ${esc(st.email)}</span></div></div>
      <div class="note" style="margin-top:0">Status: <b>${esc({ idle: 'synced', syncing: 'syncing…', offline: 'offline, will sync when back online', error: 'problem: ' + st.err, out: 'signed out', off: 'off' }[st.state] || st.state)}</b> · last sync ${syncedAt}. Changes upload a few seconds after you make them, and other devices pick them up when you open the app.</div>
      <div class="btnrow mt"><button class="btn" data-act="sync.now">Sync now</button><button class="btn ghost" data-act="sync.signout">Log out</button></div>`
    : `<div class="note" style="margin-top:0">Log in to sync this device. Use the same email and password on your phone and computer.</div>
      <label class="field"><span>Email</span><input id="sy-email" type="email" autocomplete="email" inputmode="email"></label>
      <label class="field"><span>Password</span><input id="sy-pass" type="password" autocomplete="current-password"></label>
      <div class="btnrow mt"><button class="btn" data-act="sync.signin">Log in</button><button class="btn ghost" data-act="sync.signup">Create account</button></div>
      ${st.err ? `<div class="alert">${esc(st.err)}</div>` : ''}
      <button class="linkbtn" data-act="sync.editcfg">Change Supabase project</button>`}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Body & plan</span></div>
    <div class="grid2">
      <label class="field"><span>Height (ft)</span><input type="number" inputmode="numeric" value="${ft}" data-chg="set.height" data-part="ft"></label>
      <label class="field"><span>Height (in)</span><input type="number" inputmode="decimal" step="0.5" value="${inch}" data-chg="set.height" data-part="in"></label>
      ${numField('Body fat %', 'health.profile.bf', hp.bf, 0.5)}${numField('Goal weight (lb)', 'health.profile.goalWeight', hp.goalWeight || '', 1)}
    </div>
    <label class="field"><span>Activity</span>${sel('health.profile.activity', hp.activity, [[1.35, 'Mostly sitting, light exercise'], [1.45, 'Desk job + 3 lifts/week'], [1.5, 'Lifting 3–4×/week + some walking'], [1.6, 'Lifting 4–5×/week + some walking'], [1.75, 'Lifting 5×/week + on your feet at work'], [1.9, 'Very physical job + lifting']])}</label>
    <label class="field"><span>Gain speed</span>${sel('health.profile.goalRate', hp.goalRate, [[-0.5, 'Cut: −0.5 lb/week'], [0, 'Maintain'], [0.25, 'Lean bulk: +0.25 lb/week'], [0.5, 'Standard bulk: +0.5 lb/week'], [0.75, 'Fast bulk: +0.75 lb/week (hard gainer)']])}</label>
    <div class="grid2">
      <label class="field"><span>Protein (g per lb)</span>${sel('health.profile.proteinPerLb', hp.proteinPerLb, [[0.8, '0.8'], [0.9, '0.9'], [1, '1.0']])}</label>
      <label class="field"><span>Fat (% of kcal)</span>${sel('health.profile.fatPct', hp.fatPct, [[20, '20%'], [25, '25%'], [30, '30%']])}</label>
      <label class="field"><span>Wake up</span><input type="time" value="${hp.wake}" data-chg="set.str" data-path="health.profile.wake"></label>
      <label class="field"><span>Usually train at</span><input type="time" value="${hp.trainAt}" data-chg="set.str" data-path="health.profile.trainAt"></label>
    </div>
    <div class="note">Used for your calorie target (Fuel → Plan), pill timing, and which meal slot food goes into (pre-workout vs post-workout).</div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Daily targets</span></div>
    <div class="grid2">${numField('Calories', 'settings.targets.kcal', T.kcal, 50)}${numField('Protein (g)', 'settings.targets.p', T.p, 5)}
      ${numField('Carbs (g)', 'settings.targets.c', T.c, 5)}${numField('Fat (g)', 'settings.targets.f', T.f, 5)}
      ${numField('Water (oz)', 'settings.targets.waterOz', T.waterOz, 8)}</div>
    <div class="note">The nutrition quest needs both calories and protein. Carbs and fat are tracked but don’t affect the quest. If your weight stalls for 2 weeks, add about 150–200 kcal.</div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Schedule</span></div>
    <div class="sub">Training split</div>
    ${[1, 2, 3, 4, 5, 6, 0].map(d => `<div class="row"><span class="dow">${DOW3[d]}</span>
      <select class="grow" data-chg="set.split" data-d="${d}">${TPL_OPTS().map(([k, n]) => `<option value="${k}" ${(s.split[d] || '') === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`).join('')}
    <div class="sub mt">Deep-work quest</div>
    <div class="grid2">${numField('Minutes per day', 'settings.focusMin', s.focusMin, 15)}</div>
    ${dayChecks('focusDays', s.focusDays)}
    <div class="sub mt">Bedtime quest</div>
    <div class="grid2">
      <label class="field"><span>In bed by</span><input type="time" value="${s.bedtime}" data-chg="set.str" data-path="settings.bedtime"></label>
      <label class="field"><span>Check-in opens</span><input type="time" value="${s.checkinOpens}" data-chg="set.str" data-path="settings.checkinOpens"></label>
    </div>
    <div class="note">Nights it applies (the nights before training days):</div>
    ${dayChecks('bedNights', s.bedNights)}
  </section>

  <section class="panel">
    <div class="ptitle"><span>Rules</span></div>
    <div class="grid2">${numField('XP lost per missed quest', 'settings.penaltyXP', s.penaltyXP, 5)}${numField('Pause days per month', 'settings.pausesPerMonth', s.pausesPerMonth)}</div>
    <label class="field"><span>Your name</span><input value="${esc(S.profile.name)}" data-chg="set.str" data-path="profile.name"></label>
    <label class="field"><span>What your deep work is for (shown on the quest)</span><input value="${esc(S.profile.workLabel)}" placeholder="e.g. my business, studying" data-chg="set.str" data-path="profile.workLabel"></label>
    <label class="field"><span>About you (the Coach reads this)</span><textarea rows="4" data-chg="set.str" data-path="profile.about" placeholder="Age, goal, schedule, budget, job, anything the Coach should know">${esc(S.profile.about)}</textarea></label>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Food safety</span></div>
    <label class="field"><span>Allergen words to flag (comma separated)</span>
      <input value="${esc(s.allergens.join(', '))}" data-chg="set.allergens"></label>
    <div class="note">Anything you log that matches these words, from a photo, barcode, meal or manual entry, asks you to confirm first. Barcode lookups also check the product’s allergen list.</div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>AI · Gemini</span></div>
    <label class="field"><span>API key (stays on this phone)</span><input type="password" autocomplete="off" value="${esc(s.geminiKey)}" data-chg="set.str" data-path="settings.geminiKey" placeholder="Paste key from Google AI Studio"></label>
    <label class="field"><span>Model</span><input value="${esc(s.geminiModel)}" data-chg="set.str" data-path="settings.geminiModel"></label>
    <div class="btnrow mt"><button class="btn ghost" data-act="set.testkey">Test key</button>
      <a class="btn ghost" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get free key</a></div>
    <div class="note">Used for photo scans and the AI meal builder. The free tier needs no card. If the main model hits a limit, the app retries once on Flash-Lite automatically. Google may use free-tier requests to improve its products. Only food photos and recipe text are sent.</div>
    <div id="keyresult"></div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Backup</span></div>
    <label class="field"><span>Google OAuth Client ID (for Drive backup)</span><input value="${esc(s.driveClientId)}" data-chg="set.str" data-path="settings.driveClientId" placeholder="xxxx.apps.googleusercontent.com"></label>
    <div class="note">Last Drive backup: ${last}. When a backup is due (daily), the app backs up on its own if you’ve signed in during this session. Otherwise a banner asks for one tap. SETUP.md explains the free one-time setup.</div>
    <div class="btnrow mt"><button class="btn" data-act="backup.now" ${B.driveReady() ? '' : 'disabled'}>Back up to Drive</button>
      <button class="btn ghost" data-act="backup.restore" ${B.driveReady() ? '' : 'disabled'}>Restore</button></div>
    <div class="btnrow mt"><button class="btn ghost" data-act="backup.export">Export file</button><button class="btn ghost" data-act="backup.import">Import file</button></div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Reminder</span></div>
    <label class="check"><input type="checkbox" data-chg="set.notify" ${s.notify ? 'checked' : ''}> One evening reminder if quests are still open</label>
    <div class="note">Android decides exactly when installed web apps get to check in the background, so the reminder may arrive anywhere from 6 to 9 PM, and some days not at all. Don’t rely on it for your bedtime. Set a phone alarm for that.</div>
  </section>

  <section class="panel">
    <div class="ptitle"><span>Danger zone</span></div>
    <button class="btn ghost danger full" data-act="set.reset">Reset everything</button>
  </section>
  <div class="note center">The System · v13 · ${inn ? 'synced to your account' : 'data stays on this device until you sign in'}</div>
  </div>`;
}

regChg('set.num', el => { setPath(el.dataset.path, num(el.value)); save(); E.sync(); toast('Saved'); });
regChg('set.numsel', el => { setPath(el.dataset.path, num(el.value)); save(); toast('Saved'); });
regChg('set.height', el => {
  const hp = S.health.profile, ft = Math.floor(hp.heightIn / 12), inch = hp.heightIn - ft * 12;
  hp.heightIn = el.dataset.part === 'ft' ? num(el.value) * 12 + inch : ft * 12 + num(el.value);
  save(); toast('Saved');
});
reg('set.text', el => { S.ui.text = el.dataset.v; save(); rerender(); });
regChg('set.hc', el => { S.ui.hc = el.checked; save(); rerender(); });

// ---------- Account & sync ----------
reg('sync.savecfg', () => {
  const url = $('#sy-url').value.trim(), key = $('#sy-key').value.trim();
  if (!/^https:\/\/.+/.test(url) || key.length < 20) return toast('Paste both the project URL and the key.');
  S.settings.syncUrl = url; S.settings.syncKey = key; Sync.resetClient(); save(); rerender(); toast('Saved. Now log in or create your account.');
});
reg('sync.editcfg', () => { S.settings.syncUrl = ''; S.settings.syncKey = ''; Sync.resetClient(); save(); rerender(); });
const creds = () => ({ email: $('#sy-email').value.trim(), pass: $('#sy-pass').value });
reg('sync.signin', async () => {
  const { email, pass } = creds(); if (!email || !pass) return toast('Enter your email and password.');
  try { toast('Logging in…'); await Sync.signIn(email, pass); toast('Signed in. Syncing.'); rerender(); }
  catch (e) { notice({ title: 'Couldn’t log in', html: `<div class="msg sm">${esc(e.message)}</div>`, btn: 'OK' }); }
});
reg('sync.signup', async () => {
  const { email, pass } = creds(); if (!email || pass.length < 8) return toast('Use your email and a password of 8+ characters.');
  try {
    const r = await Sync.signUp(email, pass);
    if (r === 'confirm') notice({ title: 'Check your email', html: '<div class="msg sm">We sent you a confirmation link. Tap it, then come back here and log in.</div>', btn: 'OK' });
    else { toast('Account created. Syncing.'); rerender(); }
  } catch (e) { notice({ title: 'Couldn’t create account', html: `<div class="msg sm">${esc(e.message)}</div>`, btn: 'OK' }); }
});
reg('sync.signout', async () => {
  if (!(await confirmBox('Log out', 'Stop syncing this device? Your data stays on this device and in your account.', 'Log out'))) return;
  await Sync.signOut(); rerender();
});
reg('sync.now', async () => { toast('Syncing…'); await Sync.syncNow(); rerender(); toast(Sync.status.state === 'error' ? 'Sync problem: ' + Sync.status.err : 'Synced'); });
regChg('set.str', el => { setPath(el.dataset.path, el.value.trim()); save(); toast('Saved'); });
regChg('set.split', el => { const d = +el.dataset.d; if (el.value) S.settings.split[d] = el.value; else delete S.settings.split[d]; save(); toast('Saved'); });
regChg('set.day', el => {
  const arr = S.settings[el.dataset.path], d = +el.dataset.d;
  S.settings[el.dataset.path] = el.checked ? [...new Set([...arr, d])] : arr.filter(x => x !== d);
  save(); toast('Saved');
});
regChg('set.allergens', el => { S.settings.allergens = el.value.split(',').map(x => x.trim()).filter(Boolean); save(); toast('Saved'); });
regChg('set.notify', async el => {
  if (el.checked) {
    if (!('Notification' in window)) { el.checked = false; return toast('Notifications aren’t supported here.'); }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { el.checked = false; return toast('Notification permission denied.'); }
    try {
      const reg = await navigator.serviceWorker.ready;
      const st = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => ({ state: 'denied' }));
      if (reg.periodicSync && st.state === 'granted') await reg.periodicSync.register('evening-check', { minInterval: 60 * 60 * 1000 });
      else toast('Install the app to your home screen to enable background reminders.');
    } catch { toast('Background reminders need the installed app.'); }
  }
  S.settings.notify = el.checked; await flush();
});

reg('set.testkey', async () => {
  const out = $('#keyresult'); out.innerHTML = busy('Testing…');
  try { await AI.testKey(); out.innerHTML = '<div class="donebox">Key works.</div>'; }
  catch (e) { out.innerHTML = `<div class="alert">${esc(e.message)}</div>`; }
});

reg('backup.now', async () => {
  try { const ok = await B.driveBackup(true); if (ok) { toast('Backed up to Google Drive'); rerender(); } }
  catch (e) { notice({ title: 'Backup failed', html: `<div class="msg sm">${esc(e.message)}</div>`, btn: 'OK' }); }
});
reg('backup.restore', async () => {
  if (!(await confirmBox('Restore from Drive', 'Replace everything on this phone with your latest Drive backup?', 'Restore', true))) return;
  try { await B.driveRestore(); location.reload(); }
  catch (e) { notice({ title: 'Restore failed', html: `<div class="msg sm">${esc(e.message)}</div>`, btn: 'OK' }); }
});
reg('backup.export', () => { B.exportFile(); toast('Backup file downloaded'); });
reg('backup.import', () => $('#import-input').click());
export async function onImport(file) {
  if (!file) return;
  if (!(await confirmBox('Import backup', 'Replace everything on this phone with this backup file?', 'Import', true))) return;
  try { await B.importFile(file); location.reload(); }
  catch (e) { notice({ title: 'Import failed', html: `<div class="msg sm">${esc(e.message)}</div>`, btn: 'OK' }); }
}
reg('set.reset', async () => {
  if (!(await confirmBox('Reset everything', 'This erases your level, logs, meals and history on this phone. Export a backup first if you might want it.', 'Continue', true))) return;
  if (!(await confirmBox('Are you sure?', `This cannot be undone.${Sync.signedIn() ? ' This device will be logged out first, so the copy in your account stays safe.' : ''}`, 'Erase everything', true))) return;
  if (Sync.signedIn()) await Sync.signOut();
  replace(defaults()); await flush(); location.reload();
});
