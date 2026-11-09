// IndexedDB storage, with an in-memory fallback if the browser refuses storage.
const DB = 'the-system', VER = 1;
let dbp = null;
const mem = new Map(), memPhotos = new Map();
export let storageOK = true;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export async function kvGet(k) {
  try { return await run('kv', 'readonly', s => s.get(k)); }
  catch { storageOK = false; return mem.get(k); }
}
export async function kvSet(k, v) {
  try { await run('kv', 'readwrite', s => s.put(v, k)); }
  catch { storageOK = false; mem.set(k, v); }
}

export async function photoAdd(p) {
  try { await run('photos', 'readwrite', s => s.put(p)); }
  catch { storageOK = false; memPhotos.set(p.id, p); }
}
export async function photoList() {
  try { return (await run('photos', 'readonly', s => s.getAll())) || []; }
  catch { return [...memPhotos.values()]; }
}
export async function photoDel(id) {
  try { await run('photos', 'readwrite', s => s.delete(id)); }
  catch { memPhotos.delete(id); }
}
