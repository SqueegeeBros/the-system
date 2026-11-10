// COACH: chat with Gemini about food, training, work — with live app data as context.
import { S, day, save } from '../state.js';
import * as E from '../engine.js';
import { $, esc, dkey, addDays, DOW, fmt, r1, timeStr, uid } from '../util.js';
import { reg } from '../core.js';
import { sheet, toast, closeSheet } from '../ui.js';
import * as AI from '../ai.js';
import { logEntry, allergenHit } from './food.js';

const PROMPTS = [
  'What should I eat to hit my macros today?',
  'Am I on track today?',
  'Give me a plan for my work block',
  'I keep getting distracted. What do I do?',
];

function context() {
  const k = dkey(), d = day(k), T = S.settings.targets, t = E.totals(k), wd = new Date().getDay();
  const tplKey = S.settings.split[wd], tpl = S.templates[tplKey];
  const lastW = [...S.workouts].reverse().find(w => w.tpl === tplKey);
  const ws = [...S.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
  const req = E.required(k);
  const lines = [
    `Now: ${DOW[wd]} ${new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}. Today is ${tpl ? tpl.name + ' day' : 'a rest day'}.`,
    `Targets: ${T.kcal} kcal, ${T.p} g protein, ${T.c} g carbs, ${T.f} g fat, ${T.waterOz} oz water.`,
    `Eaten so far: ${fmt(t.kcal)} kcal, ${r1(t.p)} g P, ${r1(t.c)} g C, ${r1(t.f)} g F, water ${d.water || 0} oz.`,
    `Remaining: ${fmt(Math.max(0, T.kcal - t.kcal))} kcal, ${r1(Math.max(0, T.p - t.p))} g protein.`,
    `Food log: ${d.food.length ? d.food.map(e => `${e.name} (${e.kcal} kcal, ${e.p}P) at ${timeStr(e.t)}`).join('; ') : 'nothing yet'}.`,
    `Saved meals: ${S.meals.map(m => `${m.name} (${m.kcal} kcal, ${m.p}P/${m.c}C/${m.f}F per serving)`).join('; ')}.`,
    `Daily quests: ${req.map(q => `${E.questLabel(q, k)} ${E.met(q, k) ? 'DONE' : 'open'}`).join(', ')}${d.paused ? ' (today paused)' : ''}.`,
    tpl ? `Today's session (${tpl.name}): ${tpl.exercises.map(e => `${e.name} ${e.sets}×${e.reps}`).join(', ') || 'no exercises saved'}. ${d.workoutDone ? 'Finished today.' : 'Not done yet.'}` : '',
    lastW ? `Last ${tpl?.name} session (${lastW.date}): ${lastW.exercises.map(x => `${x.name} ${x.sets.map(s => `${s.w}×${s.r}`).join(',')}`).join('; ')}.` : '',
    `Deep work today: ${Math.floor(E.focusSecFor(k) / 60)} of ${S.settings.focusMin} min${S.focus.running ? ' (timer running now)' : ''}. Distractions today: ${d.distractions.map(x => x.reason).join(', ') || 'none'}.`,
    `Business side quests: ${S.bizTasks.map(b => `${b.name}${d.bizDone.includes(b.id) ? ' (done)' : ''}`).join('; ') || 'none'}.`,
    `Bedtime goal ${E.bedtimeLabel()}, wake 4 AM.`,
    ws.length ? `Recent bodyweight: ${ws.map(w => `${w.date} ${w.lb} lb`).join(', ')}.` : 'No bodyweight logged yet.',
    `Level ${S.hunter.level}, Rank ${E.rankOf(S.hunter.level)}, streak ${S.hunter.streak} days. Allergen flags: ${S.settings.allergens.join(', ')}.`,
  ];
  return lines.filter(Boolean).join('\n');
}

function fmtReply(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .split('\n').map(l => /^\s*[-•*]\s+/.test(l) ? `<li>${l.replace(/^\s*[-•*]\s+/, '')}</li>` : l ? `<p>${l}</p>` : '').join('')
    .replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`);
}

function msgsHTML() {
  if (!S.chat.length) return `<div class="chatempty"><div class="qname">Ask the Coach</div>
    <div class="note">It sees today’s food, quests, training and focus, so you don’t have to explain.</div>
    <div class="chipgrid mt">${PROMPTS.map(p => `<button class="pill" data-act="coach.prompt" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>`;
  return S.chat.map(m => `<div class="msg ${m.role}">
    <div class="bubble">${m.role === 'model' ? fmtReply(m.text) : esc(m.text)}</div>
    ${(m.foods || []).map((f, i) => `<button class="foodsug${f.logged ? ' done' : ''}" data-act="coach.log" data-id="${m.id}" data-i="${i}" ${f.logged ? 'disabled' : ''}>
      <span><b>${esc(f.name)}</b><br><small>${fmt(f.kcal)} kcal · ${r1(f.protein)}P / ${r1(f.carbs)}C / ${r1(f.fat)}F</small></span>
      <span class="go">${f.logged ? 'LOGGED' : 'LOG'}</span></button>`).join('')}
  </div>`).join('');
}

function paint() {
  const box = $('#chatmsgs'); if (!box) return;
  box.innerHTML = msgsHTML() + (busyNow ? `<div class="msg model"><div class="bubble typing"><i></i><i></i><i></i></div></div>` : '');
  box.scrollTop = box.scrollHeight;
}

let busyNow = false;
async function send(text) {
  text = String(text || '').trim();
  if (!text || busyNow) return;
  if (!AI.hasKey()) { toast('Add your Gemini key in Settings first.'); return; }
  S.chat.push({ id: uid(), role: 'user', text, t: Date.now() });
  busyNow = true; paint();
  try {
    const r = await AI.coachChat(S.chat, context());
    S.chat.push({ id: uid(), role: 'model', text: r.reply || '…', foods: (r.foods || []).slice(0, 6), t: Date.now() });
  } catch (e) {
    S.chat.push({ id: uid(), role: 'model', text: `⚠ ${e.message}`, t: Date.now() });
  }
  S.chat = S.chat.slice(-40);
  busyNow = false; save(); paint();
}

export function openCoach() {
  if (!S.chat) S.chat = [];
  sheet('Coach', `<div class="chat">
    <div class="chatmsgs" id="chatmsgs"></div>
    <form class="chatbar" id="chatform">
      <input id="chatin" autocomplete="off" placeholder="${AI.hasKey() ? 'Ask about food, training, work…' : 'Add your Gemini key in Settings first'}">
      <button class="btn" type="submit">Send</button>
    </form>
    ${S.chat.length ? '<button class="linkbtn" data-act="coach.clear">Clear chat</button>' : ''}
  </div>`, {
    wide: true,
    onMount: card => {
      card.classList.add('tall');
      paint();
      card.querySelector('#chatform').onsubmit = e => {
        e.preventDefault();
        const inp = card.querySelector('#chatin'); const v = inp.value; inp.value = ''; send(v);
      };
    },
  });
}

reg('coach.open', openCoach);
reg('coach.prompt', el => send(el.dataset.p));
reg('coach.clear', () => { S.chat = []; save(); openCoach(); });
reg('coach.log', async el => {
  const m = S.chat.find(x => x.id === el.dataset.id), f = m?.foods?.[+el.dataset.i];
  if (!f || f.logged) return;
  const ok = await logEntry({ name: f.name, kcal: f.kcal, p: f.protein, c: f.carbs, f: f.fat, src: 'coach' }, allergenHit(f.name));
  if (ok) { f.logged = true; save(); openCoach(); }
});
