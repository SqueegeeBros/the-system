// FOOD SCANNER (Health → Food scanner): scan a barcode, see whether it's a good pick for you and why.
// Ratings come from Open Food Facts data plus your allergy list and goals. Nothing is logged unless you tap Log.
import { S, save } from '../state.js';
import { $, esc, fmt, r1 } from '../util.js';
import { reg, nav, rerender } from '../core.js';
import { toast, busy } from '../ui.js';
import * as BC from '../barcode.js';
import { logEntry } from './food.js';
import { healthCard } from '../healthcard.js';

let stop = null, product = null, check = null, state = 'idle', err = '';
export const stopScanner = () => { stop?.(); stop = null; };
document.addEventListener('visibilitychange', () => { if (document.hidden && stop) { stopScanner(); state = 'idle'; if (nav.sub.health === 'scan') rerender(); } });
window.addEventListener('popstate', () => { if (nav.sub.health !== 'scan') stopScanner(); });

const ICO = {
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg>',
};
const hist = () => (S.scans = S.scans || []);

function resultCard() {
  if (state === 'loading') return `<section class="fx-card">${busy('Looking it up…')}</section>`;
  if (state === 'error') return `<section class="fx-card"><div class="alert">${esc(err)}</div><button class="btn ghost full mt" data-act="scan.again">Scan another</button></section>`;
  if (state === 'missing') return `<section class="fx-card"><h3 class="sc-name">Not found</h3><p class="fx-empty">This barcode isn't in Open Food Facts${product ? ' with nutrition data' : ''}. Check the label: look for low added sugar, more fiber and protein, and a short ingredient list.</p><button class="btn ghost full" data-act="scan.again">Scan another</button></section>`;
  if (state !== 'done' || !product) return '';
  const per = product.perServing || product.per100;
  return `${healthCard(product, check)}
    <div class="btnrow mt">${per && check.tier !== 'stop' ? `<button class="btn" data-act="scan.log">Log to Fuel</button>` : ''}<button class="btn ghost" data-act="scan.again">Scan another</button></div>`;
}
export function render() {
  const live = BC.canScan(), h = hist().slice(0, 8);
  return `<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Health</span><h1>Food scanner</h1><p>Strict whole-foods score: see how close a product is to real, unprocessed food, and why.</p></header>
  <section class="fx-card sc-cam">
    ${live ? `<div class="scanbox sc-box${state === 'scanning' ? ' on' : ''}"><video id="sc-video" playsinline muted></video><div class="scanline"></div>
      ${state !== 'scanning' ? `<button class="sc-start" data-act="scan.start">${ICO.scan}<span>${state === 'done' || state === 'missing' ? 'Scan another' : 'Start scanning'}</span></button>` : ''}</div>
      <p class="fx-fine center">${state === 'scanning' ? 'Hold the barcode inside the frame, about a hand-width away.' : 'Uses the rear camera. Nothing is recorded.'}</p>`
    : `<p class="fx-empty">Live scanning isn't available in this browser. Type the number under the barcode instead.</p>`}
    <div class="inline mt"><input id="sc-code" inputmode="numeric" placeholder="Barcode number" autocomplete="off"><button class="btn" data-act="scan.lookup">Check</button></div>
  </section>
  ${resultCard()}
  ${h.length ? `<section class="fx-card"><header class="fx-head"><h2>Recent scans</h2><button class="fx-link" data-act="scan.clear">Clear</button></header>
    ${h.map(x => `<button class="sc-hist" data-act="scan.recheck" data-code="${esc(x.code)}"><i class="sc-dot" style="background:${x.score != null ? BC.scoreColor(x.score) : x.tier === 'stop' ? '#e5484d' : '#6b6b72'}"></i><span class="fx-tt"><b>${esc(x.name)}</b><small>${x.score != null ? x.score + '/100 · ' : ''}${esc(x.title)}${x.brand ? ' · ' + esc(x.brand) : ''}</small></span></button>`).join('')}</section>` : ''}
  </div>`;
}
export async function mount(root) {
  if (state === 'scanning') { stopScanner(); startCam(); }
}
async function startCam() {
  const v = document.getElementById('sc-video'); if (!v) return;
  try { stop = await BC.startScan(v, code => { stop = null; navigator.vibrate?.(40); check_(code); }); }
  catch (e) { state = 'error'; err = e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access for this app in Chrome’s site settings, or type the barcode number.' : 'The camera couldn’t start. Type the barcode number instead.'; stopScanner(); rerender(); }
}
async function check_(code) {
  stopScanner(); state = 'loading'; rerender();
  try { product = await BC.lookup(code); }
  catch (e) { state = 'error'; err = e.message || 'Lookup failed. Check your connection.'; rerender(); return; }
  if (!product || (!product.per100 && !product.perServing && !product.nutri)) { state = 'missing'; rerender(); return; }
  check = BC.healthCheck(product, S.settings.allergens);
  BC.remember(product, check); state = 'done'; rerender(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
reg('scan.start', () => { state = 'scanning'; product = null; rerender(); });
reg('scan.again', () => { state = BC.canScan() ? 'scanning' : 'idle'; product = null; rerender(); });
reg('scan.lookup', () => { const c = $('#sc-code').value.trim().replace(/\D/g, ''); if (c.length < 6) return toast('Enter the full barcode number.'); check_(c); });
reg('scan.recheck', el => check_(el.dataset.code));
reg('scan.clear', () => { S.scans = []; save(); rerender(); });
reg('scan.log', async () => {
  if (!product) return;
  const useServ = !!product.perServing, base = product.perServing || product.per100;
  await logEntry({ name: product.name, base: { kcal: base.kcal, p: base.p, c: base.c, f: base.f }, mode: useServ ? 'serving' : 'gram', amount: useServ ? 1 : (product.servingG || 100),
    container: null, servingG: product.servingG, src: 'barcode' }, check?.allergen || null);
});
