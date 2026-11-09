// Service worker: offline app shell + best-effort evening reminder.
const VERSION = 'system-v9';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/core.js', 'js/state.js', 'js/engine.js', 'js/db.js', 'js/util.js', 'js/ui.js', 'js/ai.js', 'js/barcode.js', 'js/camera.js', 'js/backup.js',
  'js/views/quests.js', 'js/views/food.js', 'js/views/train.js', 'js/views/work.js', 'js/views/status.js', 'js/views/settings.js', 'js/views/coach.js', 'js/views/onboard.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && !k.startsWith('fonts')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Fonts: cache after first load
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open('fonts').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // APIs (Gemini, Open Food Facts, Google) go straight to network
  // App files: network first so updates arrive, cache as offline fallback
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

// ---------- Evening reminder (Periodic Background Sync, installed app only) ----------
function idbGet(key) {
  return new Promise(res => {
    const r = indexedDB.open('the-system', 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }); };
    r.onerror = () => res(null);
    r.onsuccess = () => {
      try {
        const t = r.result.transaction('kv', 'readonly'), q = t.objectStore('kv').get(key);
        q.onsuccess = () => res(q.result); q.onerror = () => res(null);
      } catch { res(null); }
    };
  });
}
function idbSet(key, val) {
  return new Promise(res => {
    const r = indexedDB.open('the-system', 1);
    r.onerror = () => res();
    r.onsuccess = () => { try { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = () => res(); t.onerror = () => res(); } catch { res(); } };
  });
}
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function eveningCheck() {
  const h = new Date().getHours();
  if (h < 18 || h > 21) return;
  const st = await idbGet('status'), notified = await idbGet('notified'), k = todayKey();
  if (!st || !st.notify || notified === k) return;
  const open = st.date === k ? st.open : 99; // app not opened today = everything open
  if (!open) return;
  await self.registration.showNotification('The System', {
    body: open === 99 ? 'You haven’t opened today’s quests. Midnight is coming.' : `${open} daily quest${open > 1 ? 's' : ''} still open. Midnight is coming.`,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'evening', renotify: false,
  });
  await idbSet('notified', k);
}
self.addEventListener('periodicsync', e => { if (e.tag === 'evening-check') e.waitUntil(eveningCheck()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => (cs[0] ? cs[0].focus() : self.clients.openWindow('./#quests'))));
});
