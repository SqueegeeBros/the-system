// Files (DEXA reports, medical records, progress photos): stored on this device, mirrored to your account.
import { S, save } from './state.js';
import { fileGet, filePut, fileDel, photoList, photoDel } from './db.js';
import { uid, shrinkImage, dkey } from './util.js';

let remote = { download: async () => null, remove: async () => {}, kick: () => {} };
export const setRemote = r => { remote = r; };

const urls = new Map();

// Save a File/Blob. Photos are shrunk to keep storage small. Returns the file id.
export async function putFile(file, { shrink = true } = {}) {
  let blob = file, type = file.type || 'application/octet-stream';
  if (shrink && type.startsWith('image/')) {
    try { blob = await shrinkImage(file, 1800, 0.85); type = 'image/jpeg'; } catch { blob = file; }
  }
  const id = 'f_' + uid();
  await filePut(id, blob);
  S.files[id] = { name: file.name || 'file', type, size: blob.size, t: Date.now(), up: false };
  save();
  remote.kick();
  return id;
}

export const localBlob = id => fileGet(id);

// Local copy first; otherwise fetch from your account and cache it.
export async function getBlob(id) {
  let b = await fileGet(id);
  if (b) return b;
  try { b = await remote.download(id); } catch { b = null; }
  if (b) await filePut(id, b);
  return b;
}

export async function fileUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await getBlob(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}

export async function delFile(id) {
  await fileDel(id);
  if (S.files[id]?.up) { try { await remote.remove(id); } catch { } }
  delete S.files[id];
  const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); }
  save();
}

export const isImage = id => (S.files[id]?.type || '').startsWith('image/');

// Fill <img data-file> and <a data-file> after a render.
export async function hydrate(root = document) {
  for (const el of root.querySelectorAll('[data-file]')) {
    const id = el.dataset.file;
    const u = await fileUrl(id);
    if (!u) { if (el.tagName === 'IMG') el.alt = 'File not available on this device yet'; continue; }
    if (el.tagName === 'IMG') el.src = u; else el.href = u;
  }
}

// One-time move of old progress photos (v1 'photos' store) into synced files.
export async function migrateLegacyPhotos() {
  let old = [];
  try { old = await photoList(); } catch { return; }
  if (!old.length) return;
  for (const p of old) {
    const id = 'f_' + uid();
    await filePut(id, p.blob);
    S.files[id] = { name: 'progress.jpg', type: p.blob?.type || 'image/jpeg', size: p.blob?.size || 0, t: p.t || Date.now(), up: false };
    S.health.photos.push({ id: 'p_' + uid(), date: p.date || dkey(new Date(p.t || Date.now())), pose: 'Front', fileId: id });
    await photoDel(p.id);
  }
  save();
}
