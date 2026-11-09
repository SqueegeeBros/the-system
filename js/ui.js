// Notices (modal queue), bottom sheets, toasts, confirm dialogs.
import { $, esc } from './util.js';

const queue = [];
let showing = false;

// notice({title, html, btn, cancel, onOk, onCancel, tone})
export function notice(opts) {
  return new Promise(resolve => {
    queue.push({ ...opts, resolve });
    if (!showing) nextNotice();
  });
}
function nextNotice() {
  const item = queue.shift(), ov = $('#overlay');
  if (!item) { ov.className = 'overlay'; ov.innerHTML = ''; showing = false; return; }
  showing = true;
  ov.className = 'overlay show' + (item.tone ? ' ' + item.tone : '');
  ov.innerHTML = `<div class="modal"><div class="panel">
    <div class="ptitle"><span>${esc(item.title || 'Notice')}</span></div>
    ${item.html || ''}
    <div class="mbtns">
      ${item.cancel ? `<button class="btn ghost" data-m="cancel">${esc(item.cancel)}</button>` : ''}
      <button class="btn${item.danger ? ' danger' : ''}" data-m="ok">${esc(item.btn || 'Confirm')}</button>
    </div></div></div>`;
  ov.onclick = e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const ok = b.dataset.m === 'ok';
    ok ? item.onOk?.() : item.onCancel?.();
    item.resolve(ok);
    nextNotice();
  };
}

export const confirmBox = (title, html, btn = 'Confirm', danger = false) =>
  notice({ title, html: `<div class="msg sm">${html}</div>`, btn, cancel: 'Cancel', danger });

// ---------- Bottom sheet ----------
let sheetClose = null;
export function sheet(title, html, { onMount, onClose, wide } = {}) {
  closeSheet();
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-bg" data-close></div>
    <div class="sheet-card${wide ? ' wide' : ''}">
      <div class="sheet-head"><span>${esc(title)}</span><button class="x" data-close aria-label="Close">×</button></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  el.className = 'sheet show';
  document.body.classList.add('noscroll');
  const card = el.querySelector('.sheet-card');
  el.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheet());
  sheetClose = onClose || null;
  onMount?.(card);
  return card;
}
export function closeSheet() {
  const el = $('#sheet');
  if (!el || !el.classList.contains('show')) return;
  const fn = sheetClose; sheetClose = null;
  el.className = 'sheet'; el.innerHTML = '';
  document.body.classList.remove('noscroll');
  fn?.();
}
export const sheetOpen = () => $('#sheet')?.classList.contains('show');

// ---------- Toast ----------
let toastT = null;
export function toast(text, action) {
  const el = $('#toast');
  el.innerHTML = '';
  el.append(document.createTextNode(text));
  if (action) {
    const b = document.createElement('button');
    b.className = 'toastbtn'; b.textContent = action.label;
    b.onclick = () => { el.className = 'toast'; action.run(); };
    el.append(b);
  }
  el.className = 'toast show' + (action ? ' act' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.className = 'toast'), action ? 4500 : 2400);
}

export const busy = text => `<div class="busy"><div class="spin"></div><div>${esc(text)}</div></div>`;
