// FACE module storage. Kept in its own IndexedDB database so it never syncs to your account
// or rides along in the main backup: photos and skin records stay on this device.
// Dev fixtures (?fixtures=face) use a separate database so they never touch real records.
import { dkey, uid } from '../util.js';

const DEV = new URLSearchParams(location.search).get('fixtures') === 'face';
const DB = DEV ? 'the-system-face-dev' : 'the-system-face', VER = 1;
export const isDev = DEV;

let dbp = null;
const memKV = new Map(), memPh = new Map();
export let faceStorageOK = true;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}
function run(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode), req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}

/* ---------- records ---------- */
export const F = {};
export function faceDefaults() {
  return {
    v: 1, createdAt: Date.now(),
    checkins: [],      // weekly photo sets {id, date, photos:{front, side, opposite}, side:'left'|'right', note, light, time}
    skin: [],          // {id, date, t, breakouts, count, countSrc, areas[], redness, irritation, tender, marks, puffiness, note}
    products: [],      // {id, name, active, strength, how, slots:['am','pm'], days:null|[0..6], start, stop, paused, notes}
    routineLog: {},    // 'YYYY-MM-DD' -> { 'productId@am': 'done'|'skipped' }
    grooming: [],      // {id, name, every, last, note, on}
    analyses: [],      // {id, at, a, b, view, result, sent}
    reviews: [],       // {id, week, at, ...}
    settings: { bottleOz: 128, overlay: true, guaSha: false, clinicianSeen: 0 },
    seenIntro: false,
  };
}
function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base, ...saved };
  out.settings = { ...base.settings, ...(saved.settings || {}) };
  return out;
}
export async function loadFace() {
  let saved = null;
  try { saved = await run('kv', 'readonly', s => s.get('face')); } catch { faceStorageOK = false; saved = memKV.get('face'); }
  if (!saved && DEV) { const fx = await import('../dev/face-fixtures.js'); saved = await fx.seed({ putPhoto }); }
  Object.keys(F).forEach(k => delete F[k]);
  Object.assign(F, merge(faceDefaults(), saved));
  return F;
}
let t = null;
export function saveFace() { clearTimeout(t); t = setTimeout(flushFace, 150); }
export async function flushFace() {
  clearTimeout(t);
  const plain = JSON.parse(JSON.stringify(F));
  try { await run('kv', 'readwrite', s => s.put(plain, 'face')); } catch { faceStorageOK = false; memKV.set('face', plain); }
}
export function replaceFace(obj) { Object.keys(F).forEach(k => delete F[k]); Object.assign(F, merge(faceDefaults(), obj)); }

/* ---------- photo blobs ---------- */
const urls = new Map();
export async function putPhoto(blob, id = 'fp_' + uid()) {
  try { await run('photos', 'readwrite', s => s.put(blob, id)); } catch { faceStorageOK = false; memPh.set(id, blob); }
  return id;
}
export async function getPhoto(id) {
  try { return await run('photos', 'readonly', s => s.get(id)); } catch { return memPh.get(id); }
}
export async function delPhoto(id) {
  try { await run('photos', 'readwrite', s => s.delete(id)); } catch { memPh.delete(id); }
  const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); }
}
export async function photoKeys() {
  try { return (await run('photos', 'readonly', s => s.getAllKeys())) || []; } catch { return [...memPh.keys()]; }
}
export async function photoUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const b = await getPhoto(id); if (!b) return null;
  const u = URL.createObjectURL(b); urls.set(id, u); return u;
}
export async function hydrateFace(root) {
  for (const el of root.querySelectorAll('[data-fphoto]')) {
    const u = await photoUrl(el.dataset.fphoto);
    if (u) { el.src = u; el.classList.add('ld'); } else el.alt = 'Photo missing on this device';
  }
}
export async function wipeFace() {
  try { await run('photos', 'readwrite', s => s.clear()); await run('kv', 'readwrite', s => s.clear()); } catch { memKV.clear(); memPh.clear(); }
  urls.forEach(u => URL.revokeObjectURL(u)); urls.clear();
  replaceFace(faceDefaults()); await flushFace();
}
export const todayKey = () => dkey();
