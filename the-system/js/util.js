// Small shared helpers
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const dkey = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };

export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
export const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const r1 = n => Math.round((Number(n) || 0) * 10) / 10;
export const pct = (a, b) => (b ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

export const clock = sec => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const niceDate = k => {
  const today = dkey();
  if (k === today) return 'Today';
  if (k === addDays(today, -1)) return 'Yesterday';
  const d = parseKey(k);
  return `${DOW3[d.getDay()]}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

export const timeStr = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Minimal line chart (SVG). points: [{x:label, y:number}]
export function lineChart(points, { h = 120, color = 'var(--gold)', unit = '' } = {}) {
  if (points.length < 2) return `<div class="empty">Log at least two entries to see a trend.</div>`;
  const W = 320, H = h, pad = 22;
  const ys = points.map(p => p.y), min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const X = i => pad + (i * (W - pad * 2)) / (points.length - 1);
  const Y = v => H - pad - ((v - min) / span) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="${pad}" x2="${W - pad}" y1="${Y(max)}" y2="${Y(max)}" class="grid"/>
    <line x1="${pad}" x2="${W - pad}" y1="${Y(min)}" y2="${Y(min)}" class="grid"/>
    <text x="${W - pad}" y="${Y(max) - 5}" text-anchor="end" class="lbl">${r1(max)}${unit}</text>
    <text x="${W - pad}" y="${Y(min) + 13}" text-anchor="end" class="lbl">${r1(min)}${unit}</text>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/>
    <circle cx="${X(points.length - 1)}" cy="${Y(last.y)}" r="3" fill="${color}"/>
    <text x="${pad}" y="${H - 5}" class="lbl">${esc(points[0].x)}</text>
    <text x="${W - pad}" y="${H - 5}" text-anchor="end" class="lbl">${esc(last.x)}</text>
  </svg>`;
}

// Minimal bar chart. bars: [{label, v, goal?}]
export function barChart(bars, { h = 110, goal = null } = {}) {
  const W = 320, H = h, pad = 18, max = Math.max(goal || 0, ...bars.map(b => b.v), 1);
  const bw = (W - pad * 2) / bars.length;
  const Y = v => H - pad - (v / max) * (H - pad * 2);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    ${goal ? `<line x1="${pad}" x2="${W - pad}" y1="${Y(goal)}" y2="${Y(goal)}" class="goal"/>` : ''}
    ${bars.map((b, i) => `
      <rect x="${(pad + i * bw + bw * 0.22).toFixed(1)}" y="${Y(b.v).toFixed(1)}" width="${(bw * 0.56).toFixed(1)}"
        height="${Math.max(0, H - pad - Y(b.v)).toFixed(1)}" class="${goal && b.v >= goal ? 'barok' : 'bar'}"/>
      <text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="lbl">${esc(b.label)}</text>`).join('')}
  </svg>`;
}

export function downloadText(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// Downscale an image file to a JPEG blob (max side px)
export async function shrinkImage(file, max = 1024, q = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(res, 'image/jpeg', q));
}

export const blobToBase64 = blob => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1]);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});
