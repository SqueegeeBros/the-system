// WATER: one authoritative record per day (S.days[k].water, in US fl oz), shared by Fuel and Face.
// "Add" adds an amount you drank. "Set total" replaces today's total. Every change can be undone.
import { S, day, save } from './state.js';
import { esc, dkey, fmt, r1, pct, num } from './util.js';
import { reg, rerender } from './core.js';
import { sheet, closeSheet, toast, confirmBox, sheetOpen } from './ui.js';

export const bottleOz = () => Math.max(1, num(S.settings.bottleOz) || 128);
const ML = 29.5735;
const FR = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, '1']];
const fracLabel = f => (FR.find(x => x[0] === f) || [, r1(f)])[1];
export const bottles = oz => r1(oz / bottleOz());
const bottleName = () => { const b = bottleOz(); return b === 128 ? '1 gal bottle' : `${fmt(b)} oz bottle`; };
export const waterLine = oz => `${fmt(oz)} oz · ${bottles(oz)} bottle${bottles(oz) === 1 ? '' : 's'} · ${r1(oz * ML / 1000)} L`;

function record(kind, after, label) {
  const d = day(), before = d.water || 0;
  d.waterLog = d.waterLog || [];
  d.water = Math.max(0, Math.round(after * 10) / 10);
  d.waterLog.push({ t: Date.now(), kind, before, after: d.water, label });
  if (d.waterLog.length > 30) d.waterLog.splice(0, d.waterLog.length - 30);
  if (sheetOpen()) closeSheet();
  save(); rerender();
  toast(kind === 'set' ? `Total set: ${fmt(d.water)} oz` : `+${label} · ${fmt(d.water)} oz`, { label: 'Undo', run: undoWater });
}
export async function addWater(oz, label) {
  const d = day(), last = (d.waterLog || []).slice(-1)[0];
  if (last && last.kind === 'add' && last.label === label && Date.now() - last.t < 20000) {
    if (!(await confirmBox('Add again?', `You added <b>${esc(label)}</b> a few seconds ago. Add another ${esc(label)}?`, 'Add again'))) return;
  }
  record('add', (d.water || 0) + oz, label);
}
export function undoWater() {
  const d = day(), last = (d.waterLog || []).pop();
  if (!last) return toast('Nothing to undo today.');
  d.water = last.before; save(); rerender(); toast(`Undone · ${fmt(d.water)} oz today`);
}

export function waterPanel(k, editable) {
  const d = S.days[k] || {}, oz = d.water || 0, T = S.settings.targets, b = bottleOz();
  return `<section class="panel water">
    <div class="ptitle"><span>Water</span><button class="linkbtn" style="margin-left:auto" data-act="water.bottle">${esc(bottleName())}</button></div>
    <div class="bigline"><div><b>${fmt(oz)}</b><span> oz</span></div><div><b>${bottles(oz)}</b><span> bottle${bottles(oz) === 1 ? '' : 's'}</span></div></div>
    <div class="bar"><i style="width:${pct(oz, T.waterOz)}%"></i></div>
    <div class="note" style="margin-top:8px">Goal ${fmt(T.waterOz)} oz (set in Settings). The bottle size is only a unit, not a target.</div>
    ${editable ? `<div class="wfr">${FR.map(([f, l]) => `<button class="wbtn" data-act="water.add" data-f="${f}"><b>${l}</b><span>${fmt(b * f)} oz</span></button>`).join('')}</div>
    <div class="btnrow mt"><button class="btn ghost sm" data-act="water.custom">+ Custom</button><button class="btn ghost sm" data-act="water.set">Set total</button>
      <button class="btn ghost sm" data-act="water.undo" ${(d.waterLog || []).length ? '' : 'disabled'} aria-label="Undo last water change">Undo</button></div>` : ''}
  </section>`;
}
reg('water.add', el => { const f = +el.dataset.f; addWater(bottleOz() * f, `${fracLabel(f)} bottle`); });
reg('water.undo', () => undoWater());
reg('water.custom', () => {
  sheet('Add water you drank', `<div class="note" style="margin-top:0">This adds to today's total (${fmt(day().water || 0)} oz now).</div>
    <div class="grid2"><label class="field"><span>Amount</span><input id="wc-n" type="number" inputmode="decimal" min="0" step="any" placeholder="16"></label>
    <label class="field"><span>Unit</span><select id="wc-u"><option value="oz">fl oz</option><option value="ml">ml</option><option value="b">bottles</option></select></label></div>
    <button class="btn full big mt" data-act="water.customgo">Add</button>`);
});
reg('water.customgo', () => {
  const n = num(document.getElementById('wc-n').value), u = document.getElementById('wc-u').value;
  if (!(n > 0)) return toast('Enter an amount.');
  const oz = u === 'ml' ? n / ML : u === 'b' ? n * bottleOz() : n;
  closeSheet(); addWater(oz, u === 'b' ? `${r1(n)} bottle` : u === 'ml' ? `${fmt(n)} ml` : `${fmt(n)} oz`);
});
reg('water.set', () => {
  sheet("Set today's total", `<div class="alert" style="background:rgba(226,196,138,.08);border-color:#3a2f1b;color:var(--acc1)">This <b>replaces</b> today's total. It doesn't add to it. Use it to fix a mistake.</div>
    <div class="grid2"><label class="field"><span>Today's total</span><input id="ws-n" type="number" inputmode="decimal" min="0" step="any" value="${day().water || 0}"></label>
    <label class="field"><span>Unit</span><select id="ws-u"><option value="oz">fl oz</option><option value="b">bottles</option></select></label></div>
    <button class="btn full big mt" data-act="water.setgo">Replace total</button>`);
});
reg('water.setgo', () => {
  const n = num(document.getElementById('ws-n').value), u = document.getElementById('ws-u').value;
  if (n < 0) return toast('Enter zero or more.');
  closeSheet(); record('set', u === 'b' ? n * bottleOz() : n, 'set');
});
reg('water.bottle', () => {
  sheet('Bottle size', `<div class="note" style="margin-top:0">Used for the quick-add buttons. It doesn't change your water goal.</div>
    <div class="chipgrid mt">${[[128, '1 gal'], [64, '64 oz'], [40, '40 oz'], [32, '32 oz']].map(([v, l]) => `<button class="pill${bottleOz() === v ? ' on' : ''}" data-act="water.bottlego" data-v="${v}">${l}</button>`).join('')}</div>
    <label class="field"><span>Custom (fl oz)</span><input id="wb-n" type="number" inputmode="decimal" value="${bottleOz()}"></label>
    <button class="btn full mt" data-act="water.bottlego">Save</button>`);
});
reg('water.bottlego', el => { const v = el.dataset.v ? +el.dataset.v : num(document.getElementById('wb-n').value); if (!(v > 0)) return toast('Enter a size.'); S.settings.bottleOz = v; save(); closeSheet(); rerender(); toast('Bottle size saved'); });
reg('water.sheet', () => sheet('Water today', waterPanel(dkey(), true).replace('<section class="panel water">', '<section class="water" style="padding:0">')));
export const todayWater = () => (S.days[dkey()]?.water || 0);
