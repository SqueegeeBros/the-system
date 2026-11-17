// Shared scan card (v19): Today → Barcode and Health → Food scanner.
// Order: allergy panel → product and match check → data warnings → amount → nutrition for that amount → source.
// No overall score: each dimension is shown on its own, with its basis. Nothing here says a food is "safe".
import { S } from './state.js';
import { esc, fmt, r1, num } from './util.js';
import { quality } from './barcode.js';

const DV = { sodiumMg: 2300, added: 50 };   // FDA Daily Values (2,000-kcal reference diet)
const level = pct => pct <= 5 ? 'low' : pct >= 20 ? 'high' : 'moderate';   // FDA: ≤5% DV low, ≥20% DV high
const ICON = {
  A: '<svg viewBox="0 0 24 24"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  B: '<svg viewBox="0 0 24 24"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  C: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
  D: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01"/></svg>',
};

export function allergyPanel(a) {
  return `<section class="sc2-allergy s${a.state}" role="status"><div class="sc2-aic">${ICON[a.state]}</div>
    <div><span class="sc2-eyebrow">Allergy</span><b>${esc(a.title)}</b><p>${esc(a.body)}</p></div></section>`;
}

const baseOf = p => p.perServing || p.per100;
const useServ = p => !!p.perServing;
export function containerAmount(p) {
  if (!p.packageG) return null;
  if (!useServ(p)) return p.packageG;
  return p.servingG ? r1(p.packageG / p.servingG) : null;
}
export function amountChips(p) {
  const c = containerAmount(p), label = p.packageLabel ? `Whole package (${p.packageLabel})` : 'Whole package';
  const list = useServ(p) ? [[0.5, '½'], [1, '1'], [2, '2']]
    : [...new Set([50, 100, p.servingG, 200].filter(Boolean).map(Math.round))].map(g => [g, `${g} g`]);
  if (c) list.push([c, label]);
  return list;
}
export function forAmount(p, amt) {
  const b = baseOf(p); if (!b) return null;
  const k = useServ(p) ? amt : amt / 100;
  const m = v => v == null ? null : v * k;
  return { kcal: b.kcal * k, p: b.p * k, c: b.c * k, f: b.f * k, fiber: m(b.fiber), sugar: m(b.sugar), added: m(b.added), sodiumMg: m(b.sodiumMg), satfat: m(b.satfat) };
}
const ingList = t => String(t || '').replace(/^\s*ingredients?\s*:\s*/i, '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').split(/[,;]/).map(x => x.trim()).filter(x => x.length > 1);

export function nutritionHtml(p, amt) {
  const v = forAmount(p, amt); if (!v) return '<p class="sc2-fine">No nutrition data in this entry.</p>';
  const T = S.settings.targets || {};
  const pctK = T.kcal ? Math.round(v.kcal / T.kcal * 100) : null, pctP = T.p ? Math.round(v.p / T.p * 100) : null;
  const dvRow = (label, val, unit, dv) => {
    if (val == null) return `<li><span>${label}</span><b class="na">Not in database</b></li>`;
    const pct = Math.round(val / dv * 100);
    return `<li><span>${label}</span><b>${unit === 'mg' ? fmt(val) : r1(val)} ${unit} · ${pct}% DV <em class="lv ${level(pct)}">${level(pct)}</em></b></li>`;
  };
  const ings = ingList(p.ingredients);
  const optional = (label, val, unit) => val == null ? '' : `<li><span>${label}</span><b>${r1(val)} ${unit}</b></li>`;
  return `<div class="sc2-big"><b>${fmt(v.kcal)}</b><span>kcal</span><b>${r1(v.p)}</b><span>g protein</span></div>
    ${pctK != null ? `<p class="sc2-sub">This amount: ${pctK}% of your calorie target · ${pctP}% of your protein target</p>` : ''}
    <ul class="sc2-dims">
      <li><span>Carbs</span><b>${r1(v.c)} g</b></li><li><span>Fat</span><b>${r1(v.f)} g</b></li>
      ${v.fiber != null ? `<li><span>Fiber</span><b>${r1(v.fiber)} g</b></li>` : `<li><span>Fiber</span><b class="na">Not in database</b></li>`}
      ${optional('Total sugars', v.sugar, 'g')}
      ${dvRow('Added sugars', v.added, 'g', DV.added)}
      ${dvRow('Sodium', v.sodiumMg, 'mg', DV.sodiumMg)}
      ${optional('Saturated fat', v.satfat, 'g')}
      <li><span>Ingredients</span><b>${ings.length ? `${ings.length} · first: ${esc(ings[0].slice(0, 40))}` : '<span class="na">No list in database</span>'}</b></li>
      ${p.nova ? `<li><span>Processing group</span><b>${p.nova} of 4 <em class="lv info">info only</em></b></li>` : ''}
    </ul>
    <p class="sc2-fine">% DV uses FDA Daily Values (2,300 mg sodium, 50 g added sugars) for a 2,000-kcal reference diet: 5% or less is low, 20% or more is high. It's a yardstick for this amount, not your personal target.${p.nova ? ' Processing groups (NOVA) are shown for information; experts often disagree on them.' : ''}</p>`;
}

export function scanCard(p, a, { amount } = {}) {
  const serv = useServ(p), amt = amount ?? (serv ? 1 : p.servingG || 100);
  const warn = quality(p);
  const date = p.modified ? new Date(p.modified).toISOString().slice(0, 10) : null;
  const per = p.perServing && p.servingSize ? `Label serving: ${esc(p.servingSize)}` : p.perServing ? 'Per serving' : 'Values per 100 g';
  return `<div class="sc2">
    ${allergyPanel(a)}
    <section class="sc2-prod">${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(p.name)}</b><span>${esc([p.brand, p.packageLabel].filter(Boolean).join(' · '))}</span>
      <small>Exact barcode match · Open Food Facts</small></div></section>
    <div class="sc2-match" id="sc2-match"><span>Does this match your package?</span><div class="sc2-yn"><button class="btn ghost sm" data-sc2="yes">Yes</button><button class="btn ghost sm" data-sc2="no">No</button></div></div>
    ${warn.map(w => `<div class="sc2-warn">${esc(w)}</div>`).join('')}
    ${baseOf(p) ? `<div class="sc2-amt"><div class="amtchips">${amountChips(p).map(([v, l]) => `<button class="amtchip${v === amt ? ' on' : ''}" data-sc2v="${v}">${l}</button>`).join('')}</div>
      <label class="field"><span>${serv ? 'Servings eaten' : 'Grams eaten'} · ${per}</span><input id="sc2-amt" type="number" inputmode="decimal" value="${amt}" step="${serv ? 0.25 : 5}"></label></div>` : ''}
    <div id="sc2-nut">${nutritionHtml(p, amt)}</div>
    <p class="sc2-src">Source: Open Food Facts (crowd-sourced)${date ? `, last edited ${date}` : ''}. Not checked against your package.</p>
  </div>`;
}

// Wire amount chips, amount input and the match question inside `root`. Returns a getter for the amount eaten.
export function wireScanCard(root, p, { onWrong } = {}) {
  const input = root.querySelector('#sc2-amt');
  const upd = () => { const n = root.querySelector('#sc2-nut'); if (n) n.innerHTML = nutritionHtml(p, num(input?.value)); };
  if (input) input.oninput = () => { root.querySelectorAll('[data-sc2v]').forEach(x => x.classList.toggle('on', +x.dataset.sc2v === num(input.value))); upd(); };
  root.querySelectorAll('[data-sc2v]').forEach(btn => btn.onclick = () => { input.value = btn.dataset.sc2v; input.oninput(); });
  const match = root.querySelector('#sc2-match');
  match?.querySelector('[data-sc2="yes"]')?.addEventListener('click', () => { match.innerHTML = '<span>You confirmed this matches your package.</span>'; match.classList.add('ok'); });
  match?.querySelector('[data-sc2="no"]')?.addEventListener('click', () => onWrong?.());
  return () => num(input?.value) || (useServ(p) ? 1 : p.servingG || 100);
}
