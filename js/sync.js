// Cross-device sync with a free Supabase account (email + password login).
// Your whole app state is one private row; files live in a private storage folder only you can read.
import { S, replace, flush, markClean, setFlushHook, save } from './state.js';
import { kvSet } from './db.js';
import { CONFIG } from './config.js';
import * as F from './files.js';
import { notice } from './ui.js';

const TABLE = 'system_state', BUCKET = 'files';
let client = null, session = null, pushT = null, busy = false;
export const status = { state: 'off', at: 0, email: '', err: '' };   // off | out | idle | syncing | offline | error
let onChange = () => {};
export const onStatus = fn => { onChange = fn; };
const set = (state, err = '') => { status.state = state; status.err = err; onChange(status); };

const cfg = () => ({
  url: (S.settings?.syncUrl || CONFIG.supabaseUrl || '').trim().replace(/\/$/, ''),
  key: (S.settings?.syncKey || CONFIG.supabaseAnonKey || '').trim(),
});
export const configured = () => { const c = cfg(); return !!(c.url && c.key); };
export const signedIn = () => !!session;
const uidOf = () => session?.user?.id;

async function getClient() {
  if (client) return client;
  if (!configured()) { set('off'); return null; }
  if (!navigator.onLine) { set('offline'); return null; }
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const c = cfg();
    client = createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'the-system-auth' } });
    const { data } = await client.auth.getSession();
    session = data.session;
    status.email = session?.user?.email || '';
    client.auth.onAuthStateChange((_e, s) => { session = s; status.email = s?.user?.email || ''; if (!s) set('out'); });
    set(session ? 'idle' : 'out');
    return client;
  } catch (e) { client = null; set('error', 'Couldn’t reach the sync service. Check your connection.'); return null; }
}
export function resetClient() { client = null; session = null; }

// ---------- Auth ----------
const plain = e => /fetch|network/i.test(e?.message || '') ? 'Couldn’t reach your Supabase project. Check the project URL in Settings, and your internet connection.'
  : /invalid login/i.test(e?.message || '') ? 'Wrong email or password.' : (e?.message || 'Something went wrong.');
// fresh = this device has nothing worth keeping (first-run setup), so account data always wins.
export async function signIn(email, password, { fresh = false } = {}) {
  const c = await getClient(); if (!c) throw new Error(configured() ? 'No connection.' : 'Add your Supabase URL and key first.');
  let data, error;
  try { ({ data, error } = await c.auth.signInWithPassword({ email, password })); } catch (e) { throw new Error(plain(e)); }
  if (error) throw new Error(plain(error));
  session = data.session; status.email = email;
  await reconcile(fresh);
}
export async function signUp(email, password) {
  const c = await getClient(); if (!c) throw new Error(configured() ? 'No connection.' : 'Add your Supabase URL and key first.');
  let data, error;
  try { ({ data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })); } catch (e) { throw new Error(plain(e)); }
  if (error) throw new Error(plain(error));
  if (!data.session) return 'confirm';
  session = data.session; status.email = email;
  await reconcile();
  return 'ok';
}
export async function signOut() {
  const c = await getClient(); if (c) await c.auth.signOut();
  session = null; set('out');
}

// ---------- Data ----------
async function fetchRemote(full = true) {
  const { data, error } = await client.from(TABLE).select(full ? 'data, updated_at' : 'updated_at, m:data->_mtime').eq('user_id', uidOf()).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function applyRemote(remote) {
  const keep = { syncUrl: S.settings.syncUrl, syncKey: S.settings.syncKey };
  replace(remote);
  if (!S.settings.syncUrl) S.settings.syncUrl = keep.syncUrl;
  if (!S.settings.syncKey) S.settings.syncKey = keep.syncKey;
  markClean();
  await flush();
}

// First sign-in on a device: choose which data wins.
async function reconcile(fresh = false) {
  set('syncing');
  const row = await fetchRemote();
  if (!row) { S.syncUser = uidOf(); save(); await flush(); await pushNow(true); return; }
  if (S.syncUser === uidOf()) { await pull(); return; }
  const when = new Date(row.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const useAccount = fresh || await notice({
    title: 'Sync this device',
    html: `<div class="msg sm">Your account already has data (last saved ${when}).<br><br><b>Use account data</b> replaces what's on this device with it. <b>Keep this device</b> overwrites your account with this device's data instead.</div>`,
    btn: 'Use account data', cancel: 'Keep this device',
  });
  if (useAccount) { await kvSet('pre-sync-backup', JSON.parse(JSON.stringify(S))); await applyRemote(row.data); S.syncUser = uidOf(); save(); await flush(); }
  else { S.syncUser = uidOf(); save(); await flush(); await pushNow(true); }
  status.at = Date.now(); set('idle');
  location.reload();
}

// Bring in newer data from another device. Returns true if local data was replaced.
export async function pull() {
  const c = await getClient(); if (!c || !session || busy) return false;
  if (S.syncUser !== uidOf()) return false;
  busy = true; set('syncing');
  try {
    const row = await fetchRemote();
    let replaced = false;
    if (!row) await pushNow(true);
    else if ((row.data?._mtime || 0) > (S._mtime || 0)) { await applyRemote(row.data); replaced = true; }
    else if ((row.data?._mtime || 0) < (S._mtime || 0)) await pushNow(true);
    status.at = Date.now(); set('idle');
    uploadPending();
    return replaced;
  } catch (e) { set('error', e.message); return false; }
  finally { busy = false; }
}

async function pushNow(force = false) {
  const c = await getClient(); if (!c || !session) return;
  if (!force && S.syncUser !== uidOf()) return;
  if (!navigator.onLine) { set('offline'); return; }
  set('syncing');
  try {
    if (!force) {
      const r = await fetchRemote(false);
      if (r && (+r.m || 0) > (S._mtime || 0)) { const full = await fetchRemote(); await applyRemote(full.data); set('idle'); onChange({ ...status, replaced: true }); return; }
    }
    const { error } = await client.from(TABLE).upsert({ user_id: uidOf(), data: JSON.parse(JSON.stringify(S)), updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    status.at = Date.now(); set('idle');
  } catch (e) { set('error', e.message); }
}
export const syncNow = async () => { await pull(); await pushNow(); await uploadPending(); };

function schedulePush() {
  if (!session) return;
  clearTimeout(pushT);
  pushT = setTimeout(() => pushNow(), 2500);
}

// ---------- Files ----------
let uploading = false;
async function uploadPending() {
  if (uploading || !session || !client) return;
  uploading = true;
  try {
    let changed = false;
    for (const [id, meta] of Object.entries(S.files || {})) {
      if (meta.up) continue;
      const blob = await F.localBlob(id); if (!blob) continue;
      const { error } = await client.storage.from(BUCKET).upload(`${uidOf()}/${id}`, blob, { upsert: true, contentType: meta.type || 'application/octet-stream' });
      if (!error) { meta.up = true; changed = true; }
    }
    if (changed) save();
  } finally { uploading = false; }
}
F.setRemote({
  download: async id => { const c = await getClient(); if (!c || !session) return null; const { data, error } = await c.storage.from(BUCKET).download(`${uidOf()}/${id}`); return error ? null : data; },
  remove: async id => { const c = await getClient(); if (!c || !session) return; await c.storage.from(BUCKET).remove([`${uidOf()}/${id}`]); },
  kick: () => setTimeout(uploadPending, 500),
});

// ---------- Boot ----------
setFlushHook(schedulePush);
export async function boot() {
  if (!configured()) { set('off'); return false; }
  const c = await getClient(); if (!c || !session) return false;
  return pull();
}
window.addEventListener('online', () => { if (session) syncNow(); });
