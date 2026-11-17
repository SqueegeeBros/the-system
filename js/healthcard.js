// Shared health-check card: used by Fuel's barcode sheet (Today → Barcode) and Health → Food scanner.
import { esc, fmt, r1 } from './util.js';

const ARROW = {
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg>',
};
const li = r => `<li class="${r.s > 0 ? 'pos' : r.s < 0 ? 'neg' : 'neu'}">${r.s > 0 ? ARROW.up : r.s < 0 ? ARROW.down : ARROW.dot}<span>${esc(r.t)}</span>${r.s && r.s > -100 ? `<em>${r.s > 0 ? '+' : ''}${r.s}</em>` : ''}</li>`;

export function healthCard(product, c, { showMacros = true } = {}) {
  const has = c.score != null;
  const top = c.reasons.slice(0, 3), rest = c.reasons.slice(3);
  const per = product.perServing || product.per100;
  return `<section class="hcard" style="--c:${c.color}">
    <div class="hcard-head">
      <div class="hcard-ring${has ? '' : ' na'}" style="--p:${has ? c.score : 0}"><b>${has ? c.score : c.tier === 'stop' ? '!' : '?'}</b>${has ? '<span>/100</span>' : ''}</div>
      <div class="hcard-t"><b>${esc(c.title)}</b><span>${esc(c.sub)}</span></div>
    </div>
    ${has ? `<div class="hcard-scale" aria-hidden="true"><i style="left:${c.score}%"></i></div><div class="hcard-ends"><span>Avoid</span><span>Whole food</span></div>` : ''}
    <div class="hcard-prod">${product.image ? `<img src="${esc(product.image)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(product.name)}</b><span>${esc(product.brand || '')}${product.servingSize ? `${product.brand ? ' · ' : ''}serving ${esc(product.servingSize)}` : ''}</span></div></div>
    ${top.length ? `<ul class="hcard-reasons">${top.map(li).join('')}</ul>` : ''}
    ${rest.length || c.notes.length ? `<details class="hcard-more"><summary>${rest.length ? `${rest.length} more reason${rest.length > 1 ? 's' : ''}` : 'Notes for you'}${rest.length && c.notes.length ? ' · notes for you' : ''}</summary>
      ${rest.length ? `<ul class="hcard-reasons">${rest.map(li).join('')}</ul>` : ''}
      ${c.notes.length ? `<ul class="hcard-notes">${c.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</details>` : ''}
    ${showMacros && per ? `<div class="hcard-macros"><div><span>${product.perServing ? 'Serving' : '100 g'}</span><b>${fmt(per.kcal)}</b><i>kcal</i></div><div><span>Protein</span><b>${r1(per.p)}</b><i>g</i></div><div><span>Carbs</span><b>${r1(per.c)}</b><i>g</i></div><div><span>Fat</span><b>${r1(per.f)}</b><i>g</i></div></div>` : ''}
    <p class="hcard-fine">Strict whole-foods score from Open Food Facts data (processing, Nutri-Score, added sugar, refined grains, ingredients, additives, salt, saturated fat). The database can be incomplete. Not medical advice; check the label for allergens.</p>
  </section>`;
}
