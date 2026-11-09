// Boot, routing, event delegation, live ticking, notices.
import { S, load, save, flush } from './state.js';
import * as E from './engine.js';
import { $, $$, esc, niceDate } from './util.js';
import { ACT, CHG, TICK, nav, go, rerender } from './core.js';
import { notice } from './ui.js';
import { storageOK } from './db.js';
import * as Quests from './views/quests.js';
import * as Food from './views/food.js';
import * as Train from './views/train.js';
import * as Work from './views/work.js';
import * as Status from './views/status.js';
import * as Settings from './views/settings.js';
import { autoBackup } from './backup.js';

const VIEWS = { quests: Quests, food: Food, train: Train, work: Work, status: Status, settings: Settings };
const main = $('#view');

nav.render = () => {
  const v = VIEWS[nav.tab] || Quests;
  const y = window.scrollY;
  main.innerHTML = v.render();
  v.mount?.(main);
  $$('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === nav.tab || (nav.tab === 'settings' && b.dataset.tab === 'status')));
  tick();
  window.scrollTo(0, y);
};

// ---------- Notices from the engine ----------
E.onNotice(n => {
  if (n.type === 'quest') notice({ title: 'Quest complete', html: `<div class="msg">Quest cleared: <em>${esc(n.label)}</em></div><div class="rw">+${n.xp} XP · ${n.stat} +1</div>` });
  if (n.type === 'allclear') notice({ title: 'Daily quest complete', html: `<div class="msg">Every daily quest is cleared.<br>Streak: <em>${n.streak} day${n.streak > 1 ? 's' : ''}</em></div><div class="rw">BONUS +${n.xp} XP · MULTIPLIER ×${E.mult().toFixed(1)}</div>`, btn: 'Well done' });
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
  if (t) go(t.dataset.tab);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e);
});
$('#photo-input').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; Food.onPhoto(f); });
$('#progress-input').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; Status.onProgressPhoto(f); });
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

window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (VIEWS[t] && t !== nav.tab) go(t); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { heartbeat(); E.sync(); rerender(); autoBackup().then(ok => ok && rerender()); }
  else flush();
});
window.addEventListener('pagehide', () => flush());

// ---------- Boot ----------
(async function boot() {
  await load();
  Work.splitFocusAtMidnight();
  const reports = E.rollover();
  E.sync();
  const t = location.hash.slice(1);
  nav.tab = VIEWS[t] ? t : 'quests';
  rerender();
  showPenalties(reports);
  if (!storageOK) notice({ title: 'Storage unavailable', html: '<div class="msg sm">This browser is blocking storage, so nothing will be saved after you close it. Open the app from its installed icon or a normal browser tab.</div>', btn: 'OK' });
  if (!S.seenWelcome) {
    S.seenWelcome = true; save();
    notice({ title: 'The System', html: `<div class="msg sm">Your daily quests reset at midnight. Miss one and you lose XP and your streak. Three missed days in a row costs you a rank.<br><br>Before you rely on it, check these in <b>Status → Settings</b>: your Gemini key, your split and your bedtime. Then fix the estimated macros in <b>Food → My Meals</b>.</div>`, btn: 'Begin' });
  }
  lastDay = new Date().toDateString();
  setInterval(heartbeat, 1000);
  autoBackup().then(ok => ok && rerender());
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  navigator.storage?.persist?.().catch(() => {});
})();
