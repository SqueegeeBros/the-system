// Backups: file export/import, and Google Drive (needs a free OAuth Client ID — see SETUP.md).
import { S, save, flush, replace } from './state.js';
import { downloadText, dkey } from './util.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'the-system-backup.json';
let tokenClient = null, token = null, tokenExp = 0;

try {
  const t = JSON.parse(sessionStorage.getItem('drive-token') || 'null');
  if (t && t.exp > Date.now()) { token = t.token; tokenExp = t.exp; }
} catch {}

export const payload = () => JSON.stringify({ app: 'the-system', v: 1, exportedAt: new Date().toISOString(), state: S });

export function exportFile() {
  downloadText(`the-system-backup-${dkey()}.json`, payload());
}

export async function importFile(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'the-system' || !data.state) throw new Error('That file isn’t a backup from this app.');
  replace(data.state);
  await flush();
}

// ---------- Google Drive ----------
export const driveReady = () => !!S.settings.driveClientId?.trim();
export const driveConnected = () => !!token && tokenExp > Date.now();
export const backupDue = () => driveReady() && Date.now() - (S.backup.lastAt || 0) > 24 * 3600e3;

function loadGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = () => rej(new Error('Couldn’t load Google sign-in. Check your connection.'));
    document.head.appendChild(s);
  });
}

async function getToken(interactive) {
  if (driveConnected()) return token;
  if (!interactive) return null;
  await loadGIS();
  return new Promise((res, rej) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: S.settings.driveClientId.trim(),
      scope: SCOPE,
      callback: r => {
        if (r.error) return rej(new Error(`Google sign-in failed: ${r.error}`));
        token = r.access_token;
        tokenExp = Date.now() + (r.expires_in - 60) * 1000;
        try { sessionStorage.setItem('drive-token', JSON.stringify({ token, exp: tokenExp })); } catch {}
        res(token);
      },
      error_callback: e => rej(new Error(e?.message || 'Google sign-in was closed.')),
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function upload(tok) {
  const body = payload();
  if (S.backup.fileId) {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${S.backup.fileId}?uploadType=media`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body,
    });
    if (r.ok) return;
    if (r.status !== 404) throw new Error(`Drive backup failed (${r.status}).`);
    S.backup.fileId = null;
  }
  const boundary = 'sys' + Date.now();
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  if (!r.ok) throw new Error(`Drive backup failed (${r.status}).`);
  S.backup.fileId = (await r.json()).id;
}

export async function driveBackup(interactive = true) {
  if (!driveReady()) throw new Error('Add your Google Client ID in Settings first.');
  const tok = await getToken(interactive);
  if (!tok) return false;
  await upload(tok);
  S.backup.lastAt = Date.now();
  save();
  return true;
}

export async function driveRestore() {
  const tok = await getToken(true);
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const list = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`, {
    headers: { Authorization: `Bearer ${tok}` },
  }).then(r => r.json());
  const f = list.files?.[0];
  if (!f) throw new Error('No backup found in your Drive.');
  const data = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
  if (data.app !== 'the-system') throw new Error('The Drive file isn’t a valid backup.');
  replace(data.state);
  S.backup.fileId = f.id;
  await flush();
}

// Called on app open: backs up silently if a sign-in from this session is still valid.
export async function autoBackup() {
  if (!backupDue() || !driveConnected()) return false;
  try { return await driveBackup(false); } catch { return false; }
}
