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
  dragToClose(card, el.querySelector('.sheet-body'));
  onMount?.(card);
  return card;
}
// Swipe down to close: drag from the header/handle, or from the content when it's scrolled to the top.
function dragToClose(card, body) {
  let y0 = null, dy = 0, t0 = 0, active = false;
  const Y = e => (e.touches ? e.touches[0] : e).clientY;
  const start = e => {
    const fromHead = !!e.target.closest('.sheet-head') || Y(e) - card.getBoundingClientRect().top < 28;
    if (!fromHead && (body.scrollTop > 0 || e.target.closest('input,textarea,select,.fx-slider'))) return;
    y0 = Y(e); dy = 0; t0 = Date.now(); active = false;
  };
  const move = e => {
    if (y0 == null) return;
    const d = Y(e) - y0;
    if (!active) {
      if (d > 6 && (body.scrollTop <= 0 || e.target.closest('.sheet-head'))) { active = true; card.style.transition = 'none'; card.style.animation = 'none'; }
      else if (d < -6) { y0 = null; return; } else return;
    }
    dy = Math.max(0, d); card.style.transform = `translateY(${dy}px)`;
    if (e.cancelable) e.preventDefault();
  };
  const end = () => {
    if (y0 == null) return; y0 = null; if (!active) return; active = false;
    const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
    card.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
    if (dy > Math.min(140, card.offsetHeight * 0.3) || (fast && dy > 40)) { card.style.transform = 'translateY(110%)'; setTimeout(() => closeSheet(), 200); }
    else card.style.transform = '';
  };
  if ('ontouchstart' in window) {
    card.addEventListener('touchstart', start, { passive: true });
    card.addEventListener('touchmove', move, { passive: false });
    card.addEventListener('touchend', end); card.addEventListener('touchcancel', end);
  } else {
    card.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: false });
  }
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
