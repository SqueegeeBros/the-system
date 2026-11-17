// FOOD SCANNER (Health → Food scanner): scan a barcode, see allergy status first, then plain nutrition facts.
// Data comes from Open Food Facts (crowd-sourced) plus your allergy list. Nothing is logged unless you tap Log.
import { S, save } from '../state.js';
import { $, esc } from '../util.js';
import { reg, nav, rerender, ACT } from '../core.js';
import { toast, busy } from '../ui.js';
import * as BC from '../barcode.js';
import { logEntry, scanLogConfirm } from './food.js';
import { scanCard, wireScanCard, allergyPanel, containerAmount } from '../healthcard.js';

let stop = null, product = null, allergy = null, state = 'idle', err = '', getAmount = null;
export const stopScanner = () => { stop?.(); stop = null; };
document.addEventListener('visibilitychange', () => { if (document.hidden && stop) { stopScanner(); state = 'idle'; if (nav.sub.health === 'scan') rerender(); } });
window.addEventListener('popstate', () => { if (nav.sub.health !== 'scan') stopScanner(); });

const ICO = {
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const hist = () => (S.scans = S.scans || []);
const DOT = { A: 'sA', B: 'sB', C: 'sC', D: 'sD' };

function resultCard() {
  if (state === 'loading') return `<section class="fx-card">${busy('Looking it up…')}</section>`;
  if (state === 'error') return `<section class="fx-card"><div class="alert">${esc(err)}</div><div class="btnrow mt"><button class="btn ghost" data-act="scan.again">Scan another</button><button class="btn" data-act="food.manual">Enter from label</button></div></section>`;
  if (state === 'missing') return `<section class="fx-card"><div class="sc2">${allergyPanel({ state: 'D', title: 'Not enough information', body: 'This barcode isn’t in Open Food Facts. Read the package before eating.' })}</div>
    <div class="btnrow mt"><button class="btn ghost" data-act="scan.again">Scan another</button><button class="btn" data-act="food.manual">Enter from label</button></div></section>`;
  if (state !== 'done' || !product) return '';
  const canLog = !!(product.perServing || product.per100);
  return `<section class="fx-card" id="sc-result">${scanCard(product, allergy)}
    <div class="btnrow mt"><button class="btn ghost" data-act="scan.again">Scan another</button>${canLog ? `<button class="btn${allergy.state === 'A' ? ' danger' : ''}" data-act="scan.log">${BC.LOG_LABEL[allergy.state]}</button>` : `<button class="btn" data-act="food.manual">Enter from label</button>`}</div></section>`;
}
export function render() {
  const live = BC.canScan(), h = hist().slice(0, 8);
  return `<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Health</span><h1>Food scanner</h1><p>Allergy check first, then the nutrition facts for the amount you eat. A scan can flag an allergen; it can’t confirm a food is free of one.</p></header>
  <section class="fx-card sc-cam">
    ${live ? `<div class="scanbox sc-box${state === 'scanning' ? ' on' : ''}"><video id="sc-video" playsinline muted></video><div class="scanline"></div>
      ${state !== 'scanning' ? `<button class="sc-start" data-act="scan.start">${ICO.scan}<span>${state === 'done' || state === 'missing' ? 'Scan another' : 'Start scanning'}</span></button>` : ''}</div>
      <p class="fx-fine center">${state === 'scanning' ? 'Hold the barcode inside the frame, about a hand-width away.' : 'Uses the rear camera. Nothing is recorded.'}</p>`
    : `<p class="fx-empty">Live scanning isn't available in this browser. Type the number under the barcode instead.</p>`}
    <div class="inline mt"><input id="sc-code" inputmode="numeric" placeholder="Barcode number" autocomplete="off"><button class="btn" data-act="scan.lookup">Check</button></div>
  </section>
  ${resultCard()}
  ${h.length ? `<section class="fx-card"><header class="fx-head"><h2>Recent scans</h2><button class="fx-link" data-act="scan.clear">Clear all</button></header>
    ${h.map(x => { const st = BC.histState(x); return `<div class="sc-histrow"><button class="sc-hist" data-act="scan.recheck" data-code="${esc(x.code)}"><i class="sc-dot ${DOT[st]}"></i><span class="fx-tt"><b>${esc(x.name)}</b><small>${esc(x.state ? x.title : 'Scanned before v19 — tap to recheck')}${x.brand ? ' · ' + esc(x.brand) : ''}</small></span></button><button class="sc-del" data-act="scan.forget" data-code="${esc(x.code)}" aria-label="Delete scan">${ICO.x}</button></div>`; }).join('')}</section>` : ''}
  </div>`;
}
export async function mount(root) {
  if (state === 'scanning') { stopScanner(); startCam(); }
  const card = root?.querySelector?.('#sc-result') || document.getElementById('sc-result');
  if (state === 'done' && product && card) getAmount = wireScanCard(card, product, { onWrong: () => ACT['food.manual']() });
}
async function startCam() {
  const v = document.getElementById('sc-video'); if (!v) return;
  try { stop = await BC.startScan(v, code => { stop = null; navigator.vibrate?.(40); check_(code); }); }
  catch (e) { state = 'error'; err = e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access for this app in Chrome’s site settings, or type the barcode number.' : 'The camera couldn’t start. Type the barcode number instead.'; stopScanner(); rerender(); }
}
async function check_(code) {
  stopScanner(); state = 'loading'; rerender();
  try { product = await BC.lookup(code); }
  catch (e) { state = 'error'; err = e.message || BC.OFFLINE_MSG; rerender(); return; }
  if (!product) { state = 'missing'; rerender(); return; }
  allergy = BC.allergyCheck(product, S.settings.allergens);
  BC.remember(product, allergy); state = 'done'; rerender(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
reg('scan.start', () => { state = 'scanning'; product = null; rerender(); });
reg('scan.again', () => { state = BC.canScan() ? 'scanning' : 'idle'; product = null; rerender(); });
reg('scan.lookup', () => { const c = $('#sc-code').value.trim().replace(/\D/g, ''); if (c.length < 6) return toast('Enter the full barcode number.'); check_(c); });
reg('scan.recheck', el => check_(el.dataset.code));
reg('scan.forget', el => { BC.forget(el.dataset.code); rerender(); });
reg('scan.clear', () => { S.scans = []; save(); rerender(); });
reg('scan.log', async () => {
  if (!product) return;
  if (!(await scanLogConfirm(product, allergy))) return;
  const serv = !!product.perServing, base = product.perServing || product.per100;
  await logEntry({ name: product.name, base: { kcal: base.kcal, p: base.p, c: base.c, f: base.f }, mode: serv ? 'serving' : 'gram',
    amount: getAmount ? getAmount() : (serv ? 1 : product.servingG || 100), container: containerAmount(product), servingG: product.servingG, src: 'barcode' }, null);
});
