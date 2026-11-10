// First-run setup for a new person: name, targets, training, deep work, bedtime, allergies.
import { S, save } from '../state.js';
import * as E from '../engine.js';
import { esc, num } from '../util.js';
import { rerender } from '../core.js';
import { sheet, closeSheet, toast, notice } from '../ui.js';
import * as Sync from '../sync.js';

const PLANS = {
  ulppl: { label: '5 days · Upper / Lower / Push / Pull / Legs', split: { 1: 'upper', 2: 'lower', 3: 'push', 4: 'pull', 5: 'legs' } },
  ul4: { label: '4 days · Upper / Lower', split: { 1: 'upper', 2: 'lower', 4: 'upper', 5: 'lower' } },
  ppl3: { label: '3 days · Push / Pull / Legs', split: { 1: 'push', 3: 'pull', 5: 'legs' } },
  ppl6: { label: '6 days · Push / Pull / Legs ×2', split: { 1: 'push', 2: 'pull', 3: 'legs', 4: 'push', 5: 'pull', 6: 'legs' } },
  none: { label: 'No training quest', split: {} },
};

export function openOnboarding() {
  sheet('Welcome', `
    ${Sync.configured() ? `<div class="obacct">
      <button class="btn ghost full" type="button" id="ob-haveacct">Already have an account? Log in</button>
      <div id="ob-login" hidden>
        <div class="note" style="margin-top:0">Log in with the email and password you used on your other device. Your data loads here.</div>
        <label class="field"><span>Email</span><input id="ob-email" type="email" autocomplete="email" inputmode="email"></label>
        <label class="field"><span>Password</span><input id="ob-pass" type="password" autocomplete="current-password"></label>
        <button class="btn full mt" type="button" id="ob-signin">Log in</button>
      </div></div>` : ''}
    <div class="note" style="margin-top:0">New here? Set your standard. You can change all of this later in Profile → Settings.</div>
    <label class="field"><span>Your first name</span><input id="ob-name" autocomplete="given-name" placeholder="Name"></label>
    <div class="grid2">
      <label class="field"><span>Daily calories</span><input id="ob-kcal" type="number" inputmode="numeric" value="2500"></label>
      <label class="field"><span>Daily protein (g)</span><input id="ob-p" type="number" inputmode="numeric" value="150"></label>
    </div>
    <div class="note">Not sure? A common starting point for protein is about 0.8–1 g per pound of bodyweight. Ask the Coach once your Gemini key is set.</div>
    <label class="field"><span>Training plan</span><select id="ob-plan">${Object.entries(PLANS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="field"><span>Deep work min/day (0 = off)</span><input id="ob-focus" type="number" inputmode="numeric" value="60"></label>
      <label class="field"><span>Deep work is for</span><input id="ob-work" placeholder="e.g. school, business"></label>
    </div>
    <label class="field"><span>In bed by (empty = no bedtime quest)</span><input id="ob-bed" type="time" value="22:30"></label>
    <label class="field"><span>Food allergies to flag (comma separated)</span><input id="ob-all" placeholder="e.g. peanut, shellfish"></label>
    <button class="btn full big mt" id="ob-go">Begin</button>`, {
    onMount: card => {
      card.closest('.sheet').querySelectorAll('[data-close]').forEach(b => (b.style.display = 'none')); // must finish setup
      const have = card.querySelector('#ob-haveacct');
      if (have) {
        have.onclick = () => { have.hidden = true; card.querySelector('#ob-login').hidden = false; card.querySelector('#ob-email').focus(); };
        card.querySelector('#ob-signin').onclick = async e => {
          const email = card.querySelector('#ob-email').value.trim(), pass = card.querySelector('#ob-pass').value;
          if (!email || !pass) return toast('Enter your email and password.');
          e.target.disabled = true; e.target.textContent = 'Logging in…';
          try {
            await Sync.signIn(email, pass, { fresh: true });   // reloads with your account data
            if (!S.onboarded) toast('Logged in. Your account has no data yet, so finish setup below.');
          } catch (err) { notice({ title: 'Couldn’t log in', html: `<div class="msg sm">${esc(err.message)}</div>`, btn: 'OK' }); }
          e.target.disabled = false; e.target.textContent = 'Log in';
        };
      }
      card.querySelector('#ob-go').onclick = () => {
        const name = card.querySelector('#ob-name').value.trim();
        if (!name) return toast('Enter your name.');
        const kcal = Math.max(1200, Math.round(num(card.querySelector('#ob-kcal').value)) || 2500);
        const p = Math.max(40, Math.round(num(card.querySelector('#ob-p').value)) || 150);
        const fat = Math.round((kcal * 0.25) / 9), carbs = Math.max(0, Math.round((kcal - p * 4 - fat * 9) / 4));
        const plan = PLANS[card.querySelector('#ob-plan').value] || PLANS.none;
        const focus = Math.max(0, Math.round(num(card.querySelector('#ob-focus').value)));
        const bed = card.querySelector('#ob-bed').value;
        const trainDays = Object.keys(plan.split).map(Number);
        const bedNights = !bed ? [] : trainDays.length ? [...new Set(trainDays.map(d => (d + 6) % 7))] : [0, 1, 2, 3, 4];

        S.profile.name = name;
        S.profile.workLabel = card.querySelector('#ob-work').value.trim();
        Object.assign(S.settings.targets, { kcal, p, c: carbs, f: fat });
        S.settings.split = { ...plan.split };
        S.settings.focusMin = focus || 60;
        S.settings.focusDays = focus ? [1, 2, 3, 4, 5] : [];
        if (bed) { S.settings.bedtime = bed; const [h, m] = bed.split(':').map(Number); const o = Math.max(0, h * 60 + m - 180);
          S.settings.checkinOpens = `${String(Math.floor(o / 60)).padStart(2, '0')}:${String(o % 60).padStart(2, '0')}`; }
        S.settings.bedNights = bedNights;
        S.settings.allergens = card.querySelector('#ob-all').value.split(',').map(x => x.trim()).filter(Boolean);
        S.onboarded = true; S.seenHealthIntro = true;
        save(); closeSheet(); E.sync(); rerender();
        notice({ title: 'The System', html: `<div class="msg sm">Your daily quests reset at midnight. Miss one and you lose XP and your streak. Three missed days in a row costs a rank.<br><br>
          Next: add your go-to meals in <b>Fuel → My Meals</b>, your exercises in <b>Health → Training</b>, your height and body fat in <b>Profile → Settings → Body & plan</b>, and a free Gemini key there too for photo scanning and the Coach.<br><br>To use the same data on your phone and computer, create an account in <b>Profile → Settings → Account & sync</b>.</div>`, btn: 'Begin' });
      };
    },
  });
}
