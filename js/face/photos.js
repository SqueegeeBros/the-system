// FACE · weekly photo check-ins: capture (camera or gallery), timeline, compare, explicit AI analysis.
import { S } from '../state.js';
import { $, esc, uid, dkey, addDays, shrinkImage, blobToBase64, r1, fmt } from '../util.js';
import { reg, regChg, nav, rerender } from '../core.js';
import { sheet, closeSheet, toast, confirmBox, busy } from '../ui.js';
import * as AI from '../ai.js';
import { F, saveFace, putPhoto, delPhoto, getPhoto, hydrateFace } from './store.js';
import { I, fOpen, fBack, backBtn, fmtShort, fmtLong, sortedCheckins, mondayOf, daysBetween, range, routineStats, productEvents, SCALES, weekContext } from './common.js';

const VIEWS = { front: 'Front', side: 'Side', opposite: 'Opposite side' };
const LIGHTS = ['Window', 'Overhead', 'Bathroom', 'Outdoors', 'Other'];
const sideName = (c, v) => v === 'front' ? 'Front' : v === 'side' ? `${c.side === 'right' ? 'Right' : 'Left'} side` : `${c.side === 'right' ? 'Left' : 'Right'} side`;
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const hm12 = t => t ? new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

/* =================== CAPTURE (new or edit) =================== */
let draft = null;   // {id?, date, light, time, side, note, photos:{front,side,opposite}: {blob?, id?, url}}
export function startCapture(editId) {
  const c = editId && F.checkins.find(x => x.id === editId), last = sortedCheckins().pop();
  draft = c ? { id: c.id, date: c.date, light: c.light || '', time: c.time || '', side: c.side || 'left', note: c.note || '', photos: Object.fromEntries(Object.entries(c.photos).filter(([, v]) => v).map(([k, v]) => [k, { id: v }])), removed: [] }
    : { date: dkey(), light: last?.light || 'Window', time: nowHM(), side: last?.side || 'left', note: '', photos: {}, removed: [] };
  fOpen('capture');
}
export function captureView() {
  if (!draft) return `${backBtn('face')}<div class="fx-card"><p class="fx-empty">Nothing in progress.</p></div>`;
  const last = sortedCheckins().filter(c => c.id !== draft.id).pop();
  const slot = (v, req) => {
    const p = draft.photos[v];
    return `<div class="fx-shot${p ? ' has' : ''}">
      <div class="fx-shotimg">${p ? `<img ${p.url ? `src="${p.url}" class="ld"` : `data-fphoto="${p.id}"`} alt="${esc(VIEWS[v])}">` : `<span>${v === 'front' ? I.camera : I.camera}</span>`}</div>
      <div class="fx-shotinfo"><b>${v === 'front' ? 'Front' : v === 'side' ? `${draft.side === 'right' ? 'Right' : 'Left'} side` : `${draft.side === 'right' ? 'Left' : 'Right'} side`}</b><small>${req ? 'Required' : 'Optional'}</small>
        <div class="fx-shotbtns"><button class="btn sm" data-act="face.shoot" data-v="${v}">${I.camera}${p ? 'Retake' : 'Camera'}</button>
        <label class="btn sm ghost">${I.gallery}${p ? 'Replace' : 'Gallery'}<input type="file" accept="image/*" hidden data-chg="face.pickfile" data-v="${v}"></label>
        ${p ? `<button class="fx-x" data-act="face.dropshot" data-v="${v}" aria-label="Remove ${esc(VIEWS[v])} photo">${I.trash}</button>` : ''}</div></div></div>`;
  };
  const ok = draft.photos.front && draft.photos.side;
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">${draft.id ? 'Edit check-in' : 'Weekly check-in'}</span><h1>Photos</h1><p>Front plus one side. The other side is optional.</p></header>
  <details class="fx-card fx-guide" ${F.checkins.length ? '' : 'open'}><summary><span>${I.info}</span><b>Capture guide</b>${I.chev}</summary>
    <ul class="fx-sum"><li>Same spot and light each week. Facing a window works well.</li><li>Phone at eye height, about an arm's length away. Use a shelf or timer if you can.</li><li>Relaxed face, mouth closed, hair off your forehead.</li><li>Similar time of day${last?.time ? ` (last time: ${hm12(last.time)})` : ''}.</li><li>Turn off your camera's beauty or face filters. This app never edits your photos.</li></ul></details>
  <section class="fx-card"><header class="fx-head"><h2>Details</h2></header>
    <div class="grid2"><label class="field"><span>Date</span><input type="date" value="${draft.date}" max="${dkey()}" data-chg="face.dfield" data-k="date"></label>
    <label class="field"><span>Time</span><input type="time" value="${draft.time}" data-chg="face.dfield" data-k="time"></label></div>
    <div class="field"><span>Light</span><div class="fx-chips">${LIGHTS.map(l => `<button class="fx-chip${draft.light === l ? ' on' : ''}" data-act="face.dset" data-k="light" data-v="${l}">${l}</button>`).join('')}</div></div>
    <div class="field"><span>Side view</span><div class="fx-seg">${['left', 'right'].map(s => `<button class="${draft.side === s ? 'on' : ''}" data-act="face.dset" data-k="side" data-v="${s}">${s === 'left' ? 'Left side' : 'Right side'}</button>`).join('')}</div>
      ${last && last.side !== draft.side ? `<div class="fx-warn">Last week was the ${last.side} side. Using the same side keeps comparisons fair.</div>` : ''}</div>
  </section>
  <section class="fx-card"><header class="fx-head"><h2>Photos</h2><label class="fx-toggle"><input type="checkbox" ${F.settings.overlay ? 'checked' : ''} data-chg="face.overlay"><span>Outline</span></label></header>
    ${slot('front', true)}${slot('side', true)}${slot('opposite', false)}</section>
  <section class="fx-card"><label class="field" style="margin-top:0"><span>Note (optional)</span><textarea rows="2" data-chg="face.dfield" data-k="note" placeholder="e.g. slept badly, new cleanser this week">${esc(draft.note)}</textarea></label></section>
  <button class="btn full big" data-act="face.savecheck" ${ok ? '' : 'disabled'}>${draft.id ? 'Save changes' : 'Save check-in'}</button>
  ${!ok ? `<p class="fx-fine center">Add a front and a side photo to save.</p>` : ''}
  </div>`;
}
reg('face.dset', el => { draft[el.dataset.k] = el.dataset.v; rerender(); });
regChg('face.dfield', el => { if (draft) draft[el.dataset.k] = el.value; });
regChg('face.overlay', el => { F.settings.overlay = el.checked; saveFace(); });
regChg('face.pickfile', async el => { const f = el.files[0]; el.value = ''; if (f) await setShot(el.dataset.v, f); });
reg('face.dropshot', el => { const v = el.dataset.v, p = draft.photos[v]; if (p?.id) draft.removed.push(p.id); if (p?.url) URL.revokeObjectURL(p.url); delete draft.photos[v]; rerender(); });
async function setShot(v, file) {
  try {
    const blob = await shrinkImage(file, 1600, 0.88);   // keeps orientation (EXIF) and proportions
    const old = draft.photos[v]; if (old?.id) draft.removed.push(old.id); if (old?.url) URL.revokeObjectURL(old.url);
    draft.photos[v] = { blob, url: URL.createObjectURL(blob) };
    rerender();
  } catch { toast('That image couldn’t be read. Try another one.'); }
}
reg('face.shoot', el => openCamera(el.dataset.v));
reg('face.savecheck', async () => {
  if (!draft?.photos.front || !draft?.photos.side) return;
  const ids = {};
  for (const [v, p] of Object.entries(draft.photos)) ids[v] = p.blob ? await putPhoto(p.blob) : p.id;
  for (const id of draft.removed) if (!Object.values(ids).includes(id)) await delPhoto(id);
  const rec = { id: draft.id || 'c_' + uid(), date: draft.date || dkey(), photos: { front: ids.front, side: ids.side, opposite: ids.opposite || null }, side: draft.side, light: draft.light, time: draft.time, note: draft.note.trim() };
  if (draft.id) Object.assign(F.checkins.find(c => c.id === draft.id), rec); else F.checkins.push(rec);
  F.checkins.sort((a, b) => a.date.localeCompare(b.date));
  Object.values(draft.photos).forEach(p => p.url && URL.revokeObjectURL(p.url));
  const editing = !!draft.id; draft = null; saveFace();
  nav.sub.face = null; history.replaceState({ hsub: 'face' }, '', '#health'); rerender(); window.scrollTo(0, 0);
  toast(editing ? 'Check-in updated' : 'Weekly photos saved');
});

/* ---------- in-app camera with positioning outline ---------- */
let stream = null;
const stopCam = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); });
function outline(v) {
  if (v === 'front') return `<svg viewBox="0 0 300 400" class="fx-outline"><ellipse cx="150" cy="185" rx="92" ry="122"/><path d="M84 168h132M150 120v120" class="fx-guideline"/><path d="M110 330c10 20 70 20 80 0"/></svg>`;
  return `<svg viewBox="0 0 300 400" class="fx-outline"><path d="M178 70c-60-8-100 30-100 100 0 40 14 78 40 104 12 12 30 22 52 24 12 1 22-10 22-22v-30l18-6-10-22 8-6-14-30c6-30-2-104-16-112z"/><path d="M60 180h180" class="fx-guideline"/></svg>`;
}
async function openCamera(v) {
  const prev = sortedCheckins().filter(c => c.id !== draft?.id).pop(), ghostId = prev?.photos?.[v];
  let facing = 'user';
  const el = document.createElement('div'); el.className = 'fx-cam'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Camera');
  el.innerHTML = `<div class="fx-camtop"><button class="fx-camx" data-c="close" aria-label="Close camera">×</button><span>${esc(v === 'front' ? 'Front' : v === 'side' ? `${draft.side === 'right' ? 'Right' : 'Left'} side` : 'Opposite side')}</span>
      ${ghostId ? `<button class="fx-camchip" data-c="ghost" aria-pressed="false">Last week</button>` : '<span></span>'}</div>
    <div class="fx-camstage"><video playsinline muted autoplay></video>${ghostId ? '<img class="fx-ghost" alt="">' : ''}${F.settings.overlay ? outline(v) : ''}<div class="fx-camerr" hidden></div></div>
    <div class="fx-camhint">${v === 'front' ? 'Face the lens, eyes level, relaxed expression.' : 'Turn so your nose points to the edge of the frame. Keep your chin level.'}</div>
    <div class="fx-cambar"><label class="fx-camside" aria-label="Choose from gallery"><input type="file" accept="image/*" hidden>${I.gallery}</label>
      <button class="fx-shutter" data-c="shoot" aria-label="Take photo"></button>
      <button class="fx-camside" data-c="flip" aria-label="Switch camera"><svg viewBox="0 0 24 24"><path d="M4 7h4l2-3h4l2 3h4v12H4z"/><path d="M9 13a3 3 0 0 0 5.6 1.5M15 12a3 3 0 0 0-5.6-1.5"/></svg></button></div>`;
  document.body.appendChild(el); document.body.classList.add('noscroll');
  history.pushState({ hsub: 'face', fsub: 'capture', cam: 1 }, '', '#health');
  const video = el.querySelector('video'), err = el.querySelector('.fx-camerr');
  const close = (fromPop) => { stopCam(); el.remove(); document.body.classList.remove('noscroll'); window.removeEventListener('popstate', onPop); if (!fromPop && history.state?.cam) history.back(); };
  const onPop = () => close(true); window.addEventListener('popstate', onPop);
  const start = async () => {
    stopCam(); err.hidden = true;
    if (!navigator.mediaDevices?.getUserMedia) { err.hidden = false; err.textContent = 'Live camera isn’t available here. Use the gallery button.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      video.srcObject = stream; video.classList.toggle('mirror', facing === 'user'); el.querySelector('.fx-ghost')?.classList.toggle('mirror', facing === 'user'); await video.play().catch(() => {});
    } catch (e) {
      err.hidden = false;
      err.innerHTML = e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera for this app in Chrome’s site settings, or pick a photo from the gallery.' : 'The camera couldn’t start. Pick a photo from the gallery instead.';
    }
  };
  if (ghostId) {
    const g = el.querySelector('.fx-ghost'); const b = await getPhoto(ghostId); if (b) g.src = URL.createObjectURL(b);
  }
  el.addEventListener('click', e => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'close') close();
    if (c === 'flip') { facing = facing === 'user' ? 'environment' : 'user'; start(); }
    if (c === 'ghost') { const b = e.target.closest('[data-c]'), on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); el.querySelector('.fx-ghost').classList.toggle('on', on); }
    if (c === 'shoot') {
      if (!video.videoWidth) return toast('Camera is still starting…');
      const cv = document.createElement('canvas'); cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext('2d').drawImage(video, 0, 0);   // saved unmirrored: how the camera actually sees you
      cv.toBlob(async b => { close(); if (b) await setShot(v, b); }, 'image/jpeg', 0.92);
    }
  });
  el.querySelector('input[type=file]').onchange = async e => { const f = e.target.files[0]; if (!f) return; close(); await setShot(v, f); };
  start();
}

/* =================== TIMELINE =================== */
export function timelineView() {
  const cks = sortedCheckins().reverse();
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Weekly photos</span><h1>Timeline</h1><p>${cks.length ? `${cks.length} check-in${cks.length > 1 ? 's' : ''} · baseline ${fmtShort(cks[cks.length - 1].date)}` : 'No check-ins yet'}</p></header>
  <div class="btnrow"><button class="btn" data-act="face.photos">${I.camera}New check-in</button><button class="btn ghost" data-act="face.compare" ${cks.length < 2 ? 'disabled' : ''}>${I.compare}Compare</button></div>
  ${cks.length ? cks.map((c, i) => `<article class="fx-card fx-tl">
    <header class="fx-head"><h2>${fmtShort(c.date)}</h2><span class="fx-meta">${i === cks.length - 1 ? 'Baseline' : 'Week ' + (cks.length - i)}${c.light || c.time ? ' · ' + [c.light, hm12(c.time)].filter(Boolean).join(', ') : ''}</span></header>
    <div class="fx-tlimgs">${['front', 'side', 'opposite'].filter(v => c.photos[v]).map(v => `<button class="fx-thumb" data-act="face.viewphoto" data-c="${c.id}" data-v="${v}"><img data-fphoto="${c.photos[v]}" alt="${sideName(c, v)} · ${fmtShort(c.date)}"><figcaption>${sideName(c, v)}</figcaption></button>`).join('')}</div>
    ${c.note ? `<p class="fx-note">${esc(c.note)}</p>` : ''}
    <div class="fx-tlacts"><button class="fx-link" data-act="face.editcheck" data-id="${c.id}">Edit or annotate</button><button class="fx-link red" data-act="face.delcheck" data-id="${c.id}">Delete</button></div>
  </article>`).join('') : `<div class="fx-card"><p class="fx-empty">Your first check-in becomes the baseline.</p></div>`}
  </div>`;
}
reg('face.editcheck', el => startCapture(el.dataset.id));
reg('face.delcheck', async el => {
  const c = F.checkins.find(x => x.id === el.dataset.id); if (!c) return;
  if (!(await confirmBox('Delete check-in', `Delete the ${fmtShort(c.date)} check-in and its photos from this device? Saved analyses that used it are deleted too.`, 'Delete', true))) return;
  for (const id of Object.values(c.photos)) if (id) await delPhoto(id);
  F.checkins = F.checkins.filter(x => x.id !== c.id);
  F.analyses = F.analyses.filter(a => a.a !== c.id && a.b !== c.id);
  saveFace(); rerender(); toast('Check-in deleted');
});
reg('face.viewphoto', el => {
  const c = F.checkins.find(x => x.id === el.dataset.c), v = el.dataset.v; if (!c) return;
  sheet(`${sideName(c, v)} · ${fmtShort(c.date)}`, `<img class="fx-full" data-fphoto="${c.photos[v]}" alt="${sideName(c, v)}">
    <p class="fx-fine">${[c.light && c.light + ' light', c.time && hm12(c.time)].filter(Boolean).join(' · ') || 'No conditions recorded'}${c.note ? ' · ' + esc(c.note) : ''}</p>
    <div class="btnrow mt"><button class="btn ghost" data-act="face.editcheck" data-id="${c.id}">Replace or edit</button>
    ${v !== 'front' && v !== 'side' ? `<button class="btn danger" data-act="face.delopp" data-id="${c.id}">Delete photo</button>` : ''}</div>`, { onMount: card => hydrateFace(card) });
});
reg('face.delopp', async el => {
  const c = F.checkins.find(x => x.id === el.dataset.id); if (!c?.photos.opposite) return;
  if (!(await confirmBox('Delete photo', 'Delete the optional opposite-side photo from this check-in?', 'Delete', true))) return;
  await delPhoto(c.photos.opposite); c.photos.opposite = null; saveFace(); closeSheet(); rerender(); toast('Photo deleted');
});

/* =================== COMPARE =================== */
const cmp = { view: 'front', a: null, b: null, mode: 'side', pos: 50 };
export function openCompare(a, b) { const cks = sortedCheckins(); cmp.a = a || cks[0]?.id; cmp.b = b || cks[cks.length - 1]?.id; fOpen('compare'); }
function withView(v) { return sortedCheckins().filter(c => c.photos[v]); }
export function compareView() {
  let list = withView(cmp.view);
  if (list.length < 2 && cmp.view !== 'front') { cmp.view = 'front'; list = withView('front'); }
  if (list.length < 2) return `${backBtn('face')}<div class="fx"><header class="fx-title"><span class="fx-eyebrow">Weekly photos</span><h1>Compare</h1></header><div class="fx-card"><p class="fx-empty">Comparisons need two check-ins with the same view. Take your next weekly photos to unlock this.</p><button class="btn full" data-act="face.photos">Take weekly photos</button></div></div>`;
  if (!list.find(c => c.id === cmp.a)) cmp.a = list[0].id;
  if (!list.find(c => c.id === cmp.b) || cmp.b === cmp.a) cmp.b = list[list.length - 1].id === cmp.a ? list[0].id : list[list.length - 1].id;
  let A = list.find(c => c.id === cmp.a), B = list.find(c => c.id === cmp.b);
  if (A.date > B.date) { [A, B] = [B, A]; [cmp.a, cmp.b] = [A.id, B.id]; }
  const issues = [];
  if (cmp.view !== 'front' && A.side !== B.side) issues.push(`different sides (${A.side} vs ${B.side})`);
  if (A.light && B.light && A.light !== B.light) issues.push(`different light (${A.light} vs ${B.light})`);
  if (A.time && B.time && Math.abs(parseInt(A.time) - parseInt(B.time)) >= 3) issues.push(`different time of day (${hm12(A.time)} vs ${hm12(B.time)})`);
  const views = ['front', 'side', 'opposite'].filter(v => withView(v).length >= 2);
  const saved = F.analyses.filter(x => x.a === A.id && x.b === B.id && x.view === cmp.view).sort((x, y) => y.at - x.at)[0];
  const opt = (sel) => list.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${fmtShort(c.date)}</option>`).join('');
  return `${backBtn('face')}<div class="fx">
  <header class="fx-title"><span class="fx-eyebrow">Weekly photos</span><h1>Compare</h1><p>${daysBetween(A.date, B.date)} days apart · matching ${cmp.view === 'front' ? 'front' : 'side'} views</p></header>
  <div class="fx-seg">${views.map(v => `<button class="${cmp.view === v ? 'on' : ''}" data-act="face.cview" data-v="${v}">${v === 'front' ? 'Front' : v === 'side' ? 'Side' : 'Other side'}</button>`).join('')}</div>
  <div class="fx-pair"><label><span>Earlier</span><select data-chg="face.cpick" data-k="a">${opt(A.id)}</select></label><label><span>Later</span><select data-chg="face.cpick" data-k="b">${opt(B.id)}</select></label></div>
  <div class="fx-chips"><button class="fx-chip" data-act="face.cpreset" data-p="base">Baseline vs latest</button><button class="fx-chip" data-act="face.cpreset" data-p="last">Last two</button></div>
  <section class="fx-card fx-cmpcard">
    <div class="fx-seg sm">${[['side', 'Side by side'], ['slider', 'Slider']].map(([m, l]) => `<button class="${cmp.mode === m ? 'on' : ''}" data-act="face.cmode" data-m="${m}">${l}</button>`).join('')}</div>
    ${cmp.mode === 'side'
      ? `<div class="fx-sbs"><figure><img data-fphoto="${A.photos[cmp.view]}" alt="Earlier, ${fmtShort(A.date)}"><figcaption>${fmtShort(A.date)}</figcaption></figure><figure><img data-fphoto="${B.photos[cmp.view]}" alt="Later, ${fmtShort(B.date)}"><figcaption>${fmtShort(B.date)}</figcaption></figure></div>`
      : `<div class="fx-slider" style="--pos:${cmp.pos}%"><img data-fphoto="${A.photos[cmp.view]}" alt="Earlier, ${fmtShort(A.date)}"><div class="fx-top"><img data-fphoto="${B.photos[cmp.view]}" alt="Later, ${fmtShort(B.date)}"></div><div class="fx-handle"><i></i></div>
          <span class="fx-tag l">${fmtShort(A.date)}</span><span class="fx-tag r">${fmtShort(B.date)}</span></div>
        <input type="range" min="0" max="100" value="${cmp.pos}" class="fx-range" aria-label="Before and after slider" data-chg="face.cpos">`}
    <p class="fx-fine">Original photos, unedited. ${A.light || B.light ? `Earlier: ${[A.light, hm12(A.time)].filter(Boolean).join(', ') || '—'} · Later: ${[B.light, hm12(B.time)].filter(Boolean).join(', ') || '—'}` : ''}</p>
    ${issues.length ? `<div class="fx-warn">Not a like-for-like pair: ${issues.join('; ')}. Treat any difference with caution.</div>` : ''}
  </section>
  ${analysisCard(A, B, saved)}
  </div>`;
}
reg('face.cview', el => { cmp.view = el.dataset.v; rerender(); });
reg('face.cmode', el => { cmp.mode = el.dataset.m; rerender(); });
regChg('face.cpick', el => { cmp[el.dataset.k] = el.value; rerender(); });
regChg('face.cpos', el => { cmp.pos = +el.value; document.querySelector('.fx-slider')?.style.setProperty('--pos', cmp.pos + '%'); });
document.addEventListener('input', e => { if (e.target.classList?.contains('fx-range')) { cmp.pos = +e.target.value; document.querySelector('.fx-slider')?.style.setProperty('--pos', cmp.pos + '%'); } });
document.addEventListener('pointerdown', e => {
  const s = e.target.closest('.fx-slider'); if (!s) return;
  const set = ev => { const r = s.getBoundingClientRect(); cmp.pos = Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100)); s.style.setProperty('--pos', cmp.pos + '%'); const rg = document.querySelector('.fx-range'); if (rg) rg.value = cmp.pos; };
  set(e); s.setPointerCapture?.(e.pointerId);
  const mv = ev => set(ev), up = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', up); };
  s.addEventListener('pointermove', mv); s.addEventListener('pointerup', up);
});
reg('face.cpreset', el => { const l = withView(cmp.view); if (l.length < 2) return; if (el.dataset.p === 'base') { cmp.a = l[0].id; cmp.b = l[l.length - 1].id; } else { cmp.a = l[l.length - 2].id; cmp.b = l[l.length - 1].id; } rerender(); });

/* ---------- logged context between two dates (shown to you, and sent with an analysis) ---------- */
export function contextBetween(a, b) {
  const sk = F.skin.filter(s => s.date >= a && s.date <= b).sort((x, y) => x.date.localeCompare(y.date));
  const lines = [], mean = (arr) => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
  if (sk.length) {
    const fmtS = k => { const v = sk.map(s => s[k]).filter(x => x != null); return v.length ? `${SCALES[k][Math.round(mean(v))].toLowerCase()}${v.length > 1 ? ` on average (${v.length} entries)` : ' (1 entry)'}` : 'not logged'; };
    lines.push(`Skin check-ins: ${sk.length}. New breakouts ${fmtS('breakouts')}; irritation ${fmtS('irritation')}; tender bumps ${fmtS('tender')}; healing marks ${fmtS('marks')}; puffiness (self-rated) ${fmtS('puffiness')}.`);
    const counts = sk.filter(s => s.count != null); if (counts.length) lines.push(`Manual breakout counts: ${counts.map(s => `${s.count} on ${fmtShort(s.date)}`).join(', ')} (entered by hand).`);
  } else lines.push('Skin check-ins: none logged in this period.');
  const st = routineStats(a, b); if (st.tot) lines.push(`Routine steps marked done: ${st.done} of ${st.tot}${st.unmarked ? ` (${st.unmarked} not marked)` : ''}.`);
  const ev = productEvents(a, b); if (ev.length) lines.push('Product changes: ' + ev.map(e => `${e.p.name} ${e.kind === 'start' ? 'started' : 'stopped'} ${fmtShort(e.d)}`).join('; ') + '.');
  const days = range(a, b), fd = days.filter(k => (S.days[k]?.food || []).length), wd = days.filter(k => (S.days[k]?.water || 0) > 0);
  lines.push(`Food: entries on ${fd.length} of ${days.length} days (entries don't mean a day was fully logged).`);
  if (wd.length) lines.push(`Water: ${fmt(wd.reduce((x, k) => x + S.days[k].water, 0) / wd.length)} oz average on ${wd.length} logged days.`);
  const ses = S.workouts.filter(w => w.date >= a && w.date <= b).length; lines.push(`Training sessions: ${ses}.`);
  const ck = days.map(k => S.health?.checkins?.[k]).filter(c => c && c.sleep != null); if (ck.length) lines.push(`Sleep: ${r1(mean(ck.map(c => c.sleep)))} h average over ${ck.length} check-ins.`);
  return lines;
}

/* ---------- analysis card + explicit request ---------- */
function analysisCard(A, B, saved) {
  const ctx = contextBetween(A.date, B.date);
  const head = `<header class="fx-head"><h2>Visible changes</h2>${saved ? `<span class="fx-meta">Saved ${new Date(saved.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>` : ''}</header>`;
  const ctxBlock = `<div class="fx-sub">Logged context <span class="badge">From your logs</span></div><ul class="fx-sum">${ctx.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  if (!saved) return `<section class="fx-card">${head}
    <p class="fx-empty">Nothing runs automatically. When you tap Analyze, these two photos and the logged context below are sent to Google Gemini with your own key. The result is saved, so it doesn't cost another request.</p>
    ${ctxBlock}
    ${AI.hasKey() ? `<button class="btn full" data-act="face.analyze" data-a="${A.id}" data-b="${B.id}">${I.spark}Analyze comparison</button>` : `<div class="fx-warn">Analysis unavailable: add your Gemini key in Profile → Settings → AI. Manual tracking works without it.</div>`}</section>`;
  const r = saved.result, CH = { 'appears less visible': 'less', 'appears more visible': 'more', 'no clear change': 'none', 'not assessable': 'na' };
  return `<section class="fx-card">${head}
    <div class="fx-verdict ${r.comparable}"><span class="badge ${r.comparable === 'yes' ? 'gold' : ''}">${r.comparable === 'yes' ? 'Fair comparison' : r.comparable === 'limited' ? 'Limited comparison' : 'Not comparable'}</span><p>${esc(r.summary)}</p></div>
    <div class="fx-sub">Visible observations <span class="badge">AI · Gemini</span></div>
    <div class="fx-obs">${r.observations.map(o => `<div class="fx-ob ${CH[o.change] || ''}"><b>${esc(o.area)}</b><em>${esc(o.change)}</em><span>${esc(o.detail)}</span></div>`).join('')}</div>
    ${r.limitations.length ? `<div class="fx-sub">Comparison limitations</div><ul class="fx-sum">${r.limitations.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${ctxBlock}
    <div class="fx-sub">Next steps</div><ol class="fx-steps">${r.nextSteps.slice(0, 3).map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    <p class="fx-fine">AI observations are descriptions of two photos, not measurements or a diagnosis. Analyzed ${new Date(saved.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</p>
    <button class="btn ghost full" data-act="face.analyze" data-a="${A.id}" data-b="${B.id}" data-re="1">Regenerate (new request)</button></section>`;
}
reg('face.analyze', el => {
  const A = F.checkins.find(c => c.id === el.dataset.a), B = F.checkins.find(c => c.id === el.dataset.b); if (!A || !B) return;
  if (!navigator.onLine) return toast('Analysis needs a connection. Your logs and photos still work offline.');
  sheet(el.dataset.re ? 'Regenerate analysis?' : 'Send for analysis?', `
    <p class="para">This sends to <b>Google Gemini</b>, using the API key saved on this phone:</p>
    <ul class="fx-sum mt"><li>Two photos: ${sideName(A, cmp.view)} from ${fmtShort(A.date)} and ${fmtShort(B.date)}, resized to 1024 px.</li><li>The logged-context lines shown on the compare screen (skin check-ins, routine, product changes, food/water/training/sleep summaries).</li><li>Nothing else: no name, no other photos.</li></ul>
    <p class="fx-fine mt">Free-tier requests may be used by Google to improve its products. ${el.dataset.re ? 'The new result replaces the saved one.' : 'The result is saved on this device.'}</p>
    <button class="btn full big mt" data-act="face.analyzego" data-a="${A.id}" data-b="${B.id}">Send and analyze</button>`);
});
reg('face.analyzego', async el => {
  const A = F.checkins.find(c => c.id === el.dataset.a), B = F.checkins.find(c => c.id === el.dataset.b), v = cmp.view;
  const body = document.querySelector('.sheet-body'); if (body) body.innerHTML = busy('Comparing photos…');
  try {
    const prep = async id => blobToBase64(await shrinkImage(await getPhoto(id), 1024, 0.85));
    const [a64, b64] = [await prep(A.photos[v]), await prep(B.photos[v])];
    const ctx = contextBetween(A.date, B.date).join('\n');
    const result = await AI.faceCompare(a64, b64, { a: fmtShort(A.date), b: fmtShort(B.date), view: v === 'front' ? 'front' : 'side profile' }, ctx);
    result.nextSteps = (result.nextSteps || []).slice(0, 3);
    F.analyses = F.analyses.filter(x => !(x.a === A.id && x.b === B.id && x.view === v));
    F.analyses.push({ id: 'an_' + uid(), at: Date.now(), a: A.id, b: B.id, view: v, result, sent: ['2 photos', 'logged context'] });
    saveFace(); closeSheet(); rerender(); toast('Analysis saved');
  } catch (e) {
    if (body) body.innerHTML = `<div class="alert">${esc(e.message || 'Analysis failed.')}</div><p class="fx-fine">Nothing was saved. Your photos and logs are unchanged.</p>`;
  }
});

export { cmp, sideName, hm12 };
reg('face.back', () => fBack());
