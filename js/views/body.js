// BODY (inside Health): weight trend, tape measurements, DEXA scans, labs, records, progress photos.
import { S, save } from '../state.js';
import { $, esc, uid, dkey, addDays, parseKey, num, r1, niceDate, lineChart } from '../util.js';
import { reg, rerender } from '../core.js';
import { confirmBox, sheet, closeSheet, toast } from '../ui.js';
import * as H from '../data/health-data.js';
import * as F from '../files.js';

const HS = () => S.health;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
const kg = lb => lb * 0.45359237;
const fmtD = (k, o = { month: 'short', day: 'numeric', year: 'numeric' }) => parseKey(k).toLocaleDateString('en-US', o);
const dayDiff = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const optNum = v => (v === '' || v == null || isNaN(parseFloat(v))) ? null : parseFloat(v);
const withFiles = { onMount: card => F.hydrate(card) };

/* ---------- weight trend (exponential moving average, like Happy Scale / MacroFactor) ---------- */
const sortedW = () => [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
export function trendSeries() {
  const ws = sortedW(); if (!ws.length) return [];
  const map = Object.fromEntries(ws.map(w => [w.date, w.lb])), today = dkey();
  const end = today > ws[ws.length - 1].date ? today : ws[ws.length - 1].date;
  const out = []; let t = ws[0].lb, pi = 0;
  for (let k = ws[0].date; k <= end; k = addDays(k, 1)) {
    while (pi < ws.length - 1 && ws[pi + 1].date <= k) pi++;
    let v = map[k];
    if (v == null && pi < ws.length - 1) { const a = ws[pi], b = ws[pi + 1]; v = a.lb + (b.lb - a.lb) * dayDiff(a.date, k) / dayDiff(a.date, b.date); }
    if (v != null) t += 0.1 * (v - t);
    out.push({ k, w: map[k] ?? null, t });
  }
  return out;
}
export const curWeight = () => { const t = trendSeries(); return t.length ? t[t.length - 1].t : 180; };
export const startWeight = () => { const w = sortedW(); return w.length ? w[0].lb : 180; };
export function weeklyRate() { const t = trendSeries(); if (t.length < 8) return null; const n = Math.min(14, t.length - 1); return (t[t.length - 1].t - t[t.length - 1 - n].t) / n * 7; }

// Two-series chart: daily dots + trend line
function weightChart(pts) {
  const W = 320, Hh = 170, ys = pts.flatMap(p => [p.w, p.t]).filter(v => v != null);
  if (pts.length < 2 || ys.length < 2) return '<div class="empty">Log at least two weigh-ins to see a trend.</div>';
  let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1) { lo -= .5; hi += .5; } const pad = (hi - lo) * .12; lo -= pad; hi += pad;
  const L = 36, R = 8, T = 10, B = 22, X = i => L + i / (pts.length - 1) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (Hh - T - B);
  let g = '';
  for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" class="lbl">${Math.round(v)}</text>`; }
  pts.forEach((p, i) => { if (p.w != null) g += `<circle cx="${X(i)}" cy="${Y(p.w)}" r="3" fill="var(--muted)"/>`; });
  g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p.t).toFixed(1)).join('')}" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linejoin="round"/>`;
  g += `<text x="${L}" y="${Hh - 4}" class="lbl">${esc(niceDate(pts[0].k))}</text><text x="${W - R}" y="${Hh - 4}" text-anchor="end" class="lbl">${esc(niceDate(pts[pts.length - 1].k))}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Weight chart">${g}</svg>`;
}

const MF = [['waist', 'Waist (at navel)'], ['chest', 'Chest'], ['shoulders', 'Shoulders'], ['arm', 'Arm (flexed)'], ['thigh', 'Thigh'], ['calf', 'Calf'], ['neck', 'Neck']];
function bodyView() {
  const tr = trendSeries(), range = HS().wRange ?? 30, from = range ? addDays(dkey(), -range) : '0000', pts = tr.filter(x => x.k >= from), rate = weeklyRate();
  const p = HS().profile, ms = [...HS().measures].sort((a, b) => a.d.localeCompare(b.d)), lm = ms[ms.length - 1], fm = ms[0];
  const navy = lm?.waist && lm?.neck ? 86.010 * Math.log10(lm.waist - lm.neck) - 70.041 * Math.log10(p.heightIn) + 36.76 : null;
  let advice = 'Weigh in every morning. The trend needs about 2 weeks to settle.';
  if (rate != null && tr.length >= 14) advice = rate < p.goalRate - 0.2 ? `Gaining slower than your +${p.goalRate} lb/week goal. Add ~150–200 kcal/day (Fuel → Plan can update your targets).`
    : rate > p.goalRate + 0.25 ? 'Gaining faster than planned, and the extra is mostly fat. Trim ~150 kcal/day.' : 'Right on pace. Keep calories where they are.';
  return `<section class="panel"><div class="ptitle"><span>Weight</span></div>
    <div class="grid3 stats3" style="margin-top:0;border-top:0;padding-top:0"><div><div class="k">Trend</div><div class="v">${r1(curWeight())}</div></div><div><div class="k">Per week</div><div class="v sm">${rate == null ? '—' : sgn(rate, 2)}</div></div><div><div class="k">Goal</div><div class="v sm">${p.goalWeight}</div></div></div>
    <div class="inline mt"><input id="bw-in" type="number" inputmode="decimal" step="0.1" placeholder="Today’s weight (lb)" aria-label="Today's weight"><button class="btn" data-act="body.weigh">Log</button></div>
    <div class="donebox">${advice}</div>
    <div class="seg3 mt">${[[30, '30 days'], [90, '90 days'], [0, 'All']].map(([v, n]) => `<button class="${range === v ? 'on' : ''}" data-act="body.range" data-v="${v}">${n}</button>`).join('')}</div>
    ${weightChart(pts)}<div class="note"><span style="color:var(--gold)">━</span> trend (what matters) &nbsp; ● daily weigh-ins (noisy)</div>
    ${S.weights.length ? `<details><summary class="linkbtn">Entries ›</summary>${sortedW().reverse().slice(0, 21).map(w => `<div class="row"><span class="grow">${niceDate(w.date)}</span><span>${r1(w.lb)} lb</span><button class="iconbtn red" data-act="body.delweigh" data-d="${w.date}" aria-label="Delete">×</button></div>`).join('')}</details>` : ''}</section>
  <section class="panel"><div class="ptitle"><span>Tape measurements</span></div>
    ${lm ? `<div class="rs">Latest ${niceDate(lm.d)}${fm !== lm ? ` · change since ${niceDate(fm.d)}` : ''}</div>
      ${MF.filter(([k]) => lm[k]).map(([k, n]) => `<div class="row"><span class="grow">${n}</span><b>${r1(lm[k])}"</b>${fm !== lm && fm[k] ? `<span class="rs">${sgn(lm[k] - fm[k], 1)}</span>` : ''}</div>`).join('')}
      ${navy ? `<div class="note">Tape estimate of body fat (US Navy formula): <b>${r1(navy)}%</b>. Rough only; DEXA is far more accurate.</div>` : ''}
      <div class="note">On a lean bulk, arms, chest and thighs should grow faster than your waist.</div>` : '<div class="empty">Measure every 2–4 weeks, at the same time of day.</div>'}
    <button class="btn ghost full mt" data-act="body.addmeasure">+ Add measurements</button></section>`;
}
reg('body.weigh', () => {
  const v = num($('#bw-in').value); if (v < 80 || v > 500) return toast('Enter your weight in lb.');
  const k = dkey(); S.weights = S.weights.filter(w => w.date !== k); S.weights.push({ date: k, lb: r1(v) });
  save(); rerender(); toast(`Logged ${r1(v)} lb`);
});
reg('body.delweigh', el => { S.weights = S.weights.filter(w => w.date !== el.dataset.d); save(); rerender(); });
reg('body.range', el => { HS().wRange = +el.dataset.v; save(); rerender(); });
reg('body.addmeasure', () => sheet('Tape measurements (inches)', `<label class="field"><span>Date</span><input id="ms-d" type="date" value="${dkey()}"></label>
  <div class="grid2">${MF.map(([k, n]) => `<label class="field"><span>${n}</span><input id="ms-${k}" type="number" inputmode="decimal" step="0.1"></label>`).join('')}</div>
  <button class="btn full mt" data-act="body.savemeasure">Save</button>`));
reg('body.savemeasure', () => {
  const m = { d: $('#ms-d').value || dkey() }; MF.forEach(([k]) => { const v = optNum($('#ms-' + k).value); if (v) m[k] = v; });
  if (Object.keys(m).length < 2) return toast('Enter at least one measurement.');
  HS().measures = HS().measures.filter(x => x.d !== m.d); HS().measures.push(m); save(); closeSheet(); rerender();
});

/* ---------- DEXA ---------- */
export function dexaCalc(x) {
  const hm = HS().profile.heightIn * 0.0254, h2 = hm * hm;
  const ffm = x.lean != null ? x.lean + (x.bmc || 0) : (x.total != null && x.fat != null ? x.total - x.fat : null);
  const ffmi = ffm != null ? kg(ffm) / h2 : null;
  const alm = [x.armL, x.armR, x.legL, x.legR].every(v => v != null) ? x.armL + x.armR + x.legL + x.legR : null;
  return { nffmi: ffmi != null ? ffmi + 6.1 * (1.8 - hm) : null, almi: alm != null ? kg(alm) / h2 : null, fmi: x.fat != null ? kg(x.fat) / h2 : null,
    armAsym: x.armL && x.armR ? Math.abs(x.armL - x.armR) / Math.max(x.armL, x.armR) * 100 : null, legAsym: x.legL && x.legR ? Math.abs(x.legL - x.legR) / Math.max(x.legL, x.legR) * 100 : null };
}
const stat = (k, v) => `<div><div class="k">${k}</div><div class="v sm">${v}</div></div>`;
function dexaView() {
  const scans = [...HS().dexa].sort((a, b) => a.d.localeCompare(b.d)), L = scans[scans.length - 1], P = scans[scans.length - 2];
  let top;
  if (!L) {
    const p = HS().profile, w = curWeight(), lean = w * (1 - p.bf / 100), est = dexaCalc({ lean, fat: w - lean });
    top = `<section class="panel"><div class="ptitle"><span>DEXA scans</span></div><p class="para">No scans yet. From your profile (${r1(w)} lb at ${p.bf}% body fat), your estimated lean mass is <b>${r1(lean)} lb</b>. Your muscle-for-height score (normalized FFMI) is <b>${r1(est.nffmi)}</b>. Typical untrained men score 18–20; very muscular natural lifters reach about 23–25.</p>
      <button class="btn full big mt" data-act="body.adddexa">+ Add your first scan</button></section>`;
  } else {
    const c = dexaCalc(L);
    let cmp = '';
    if (P) { const dl = (L.lean ?? 0) - (P.lean ?? 0), df = (L.fat ?? 0) - (P.fat ?? 0), tot = dl + df;
      cmp = `<div class="donebox"><b>Since ${niceDate(P.d)}:</b> lean ${sgn(dl, 1)} lb, fat ${sgn(df, 1)} lb.${tot > 0 ? ` <b>${Math.round(clamp(dl / tot, 0, 1) * 100)}%</b> of the weight you gained was lean. ${dl / tot >= 0.5 ? 'That’s a high-quality bulk.' : 'Mostly fat. Consider a smaller surplus.'}` : ''}</div>`; }
    top = `<section class="panel"><div class="ptitle"><span>Latest scan</span></div><div class="rs center">${fmtD(L.d, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <div class="grid3 stats3">${stat('Body fat', L.bf != null ? r1(L.bf) + '%' : '—')}${stat('Lean lb', L.lean != null ? r1(L.lean) : '—')}${stat('Fat lb', L.fat != null ? r1(L.fat) : '—')}${stat('FFMI', c.nffmi ? r1(c.nffmi) : '—')}${stat('ALMI', c.almi ? c.almi.toFixed(2) : '—')}${stat('Visceral', L.vat != null ? L.vat + ' lb' : '—')}</div>
      ${cmp}${c.armAsym > 5 || c.legAsym > 5 ? `<div class="alert">Left/right difference: arms ${r1(c.armAsym)}%, legs ${r1(c.legAsym)}%. Above ~5%, add single-arm or single-leg work.</div>` : ''}
      <div class="btnrow mt"><button class="btn ghost" data-act="body.dexadetail" data-id="${L.id}">Details${L.files?.length ? ' & file' : ''}</button><button class="btn" data-act="body.adddexa">+ Add scan</button></div></section>
    ${scans.length >= 2 ? `<section class="panel"><div class="ptitle"><span>Lean mass (lb)</span></div>${lineChart(scans.filter(s => s.lean != null).map(s => ({ x: niceDate(s.d), y: s.lean })), { color: 'var(--green)' })}</section>
      <section class="panel"><div class="ptitle"><span>Fat mass (lb)</span></div>${lineChart(scans.filter(s => s.fat != null).map(s => ({ x: niceDate(s.d), y: s.fat })), { color: 'var(--red)' })}</section>` : ''}
    <section class="panel"><div class="ptitle"><span>All scans</span></div>${scans.slice().reverse().map(s => `<button class="row btnrowitem" data-act="body.dexadetail" data-id="${s.id}"><div class="grow"><div class="rt sm">${niceDate(s.d)}</div><div class="rs">${s.bf != null ? r1(s.bf) + '% fat · ' : ''}${s.lean != null ? r1(s.lean) + ' lb lean' : ''}${s.files?.length ? ' · 📎' : ''}</div></div><span class="rs">›</span></button>`).join('')}</section>`;
  }
  return `${top}<section class="panel"><div class="ptitle"><span>How to read a DEXA</span></div>
    <p class="para">• <b>Lean mass change</b> is the real scorecard for a bulk. The scale can't tell muscle from fat.</p>
    <p class="para">• <b>ALMI</b> (arm + leg muscle ÷ height²): below ~7 is low for men; ~8.5+ is well-muscled.</p>
    <p class="para">• <b>Visceral fat</b> sits around your organs. Lean men are usually well under 1 lb (under 100 cm²).</p>
    <p class="para">• <b>Keep scans consistent:</b> same machine, morning, fasted, normal hydration, no workout first. Scan every 8–12 weeks, since water and carbs alone can move lean mass by 1–2 lb.</p></section>`;
}
const DXF = [['total', 'Total weight (lb)'], ['bf', 'Body fat %'], ['lean', 'Lean mass (lb)'], ['fat', 'Fat mass (lb)'], ['bmc', 'Bone mineral content (lb)'], ['vat', 'Visceral fat (lb)'], ['armL', 'Left arm lean (lb)'], ['armR', 'Right arm lean (lb)'], ['legL', 'Left leg lean (lb)'], ['legR', 'Right leg lean (lb)'], ['trunk', 'Trunk lean (lb)'], ['tscore', 'Bone T-score']];
reg('body.adddexa', () => sheet('Add DEXA scan', `
  <label class="field"><span>Upload the report (photo or PDF)</span><input id="dx-file" type="file" accept="image/*,application/pdf" multiple></label>
  <label class="field"><span>Scan date</span><input id="dx-d" type="date" value="${dkey()}"></label>
  <div class="note">Copy the numbers from your report. Leave blank anything you don't have. If you enter total weight and body fat %, lean and fat mass fill in automatically.</div>
  <div class="grid2">${DXF.map(([k, n]) => `<label class="field"><span>${n}</span><input id="dx-${k}" type="number" inputmode="decimal" step="any"></label>`).join('')}</div>
  <label class="field"><span>Notes</span><input id="dx-n" placeholder="Provider, conditions"></label>
  <button class="btn full big mt" data-act="body.savedexa">Save scan</button>`));
reg('body.savedexa', async () => {
  const x = { id: 'dx_' + uid(), d: $('#dx-d').value || dkey(), notes: $('#dx-n').value.trim() };
  DXF.forEach(([k]) => { x[k] = optNum($('#dx-' + k).value); });
  if (x.total != null && x.bf != null) { if (x.fat == null) x.fat = r1(x.total * x.bf / 100); if (x.lean == null) x.lean = r1(x.total - x.fat - (x.bmc || 0)); }
  if (x.bf == null && x.total && x.fat != null) x.bf = r1(x.fat / x.total * 100);
  const files = [...$('#dx-file').files];
  if (x.bf == null && x.lean == null && !files.length) return toast('Enter some numbers or upload the report.');
  toast('Saving…');
  x.files = [];
  for (const f of files) x.files.push(await F.putFile(f));
  HS().dexa.push(x);
  if (x.files.length) HS().records.push({ id: 'r_' + uid(), d: x.d, cat: 'DEXA', title: 'DEXA scan', notes: x.notes, files: x.files });
  if (x.total) { S.weights = S.weights.filter(w => w.date !== x.d); S.weights.push({ date: x.d, lb: x.total }); }
  save(); closeSheet(); rerender(); toast('Scan saved');
});
function filesHTML(ids) {
  return (ids || []).map(id => F.isImage(id) ? `<img class="fullph mt" data-file="${id}" alt="Uploaded file">` : `<a class="btn ghost full mt" data-file="${id}" target="_blank" rel="noopener">📄 Open ${esc(S.files[id]?.name || 'file')}</a>`).join('');
}
reg('body.dexadetail', el => {
  const x = HS().dexa.find(s => s.id === el.dataset.id); if (!x) return; const c = dexaCalc(x);
  const rows = [...DXF.map(([k, n]) => [n, x[k]]), ['FFMI (normalized)', c.nffmi && r1(c.nffmi)], ['ALMI (kg/m²)', c.almi && c.almi.toFixed(2)], ['Fat mass index', c.fmi && r1(c.fmi)]];
  sheet(`DEXA · ${niceDate(x.d)}`, `${filesHTML(x.files)}${rows.filter(r => r[1] != null).map(([n, v]) => `<div class="row"><span class="grow muted">${n}</span><b>${v}</b></div>`).join('')}
    ${x.notes ? `<div class="note">${esc(x.notes)}</div>` : ''}<button class="btn ghost danger full mt" data-act="body.deldexa" data-id="${x.id}">Delete scan</button>`, withFiles);
});
reg('body.deldexa', async el => {
  if (!(await confirmBox('Delete scan', 'Remove these numbers? Uploaded files stay in Records.', 'Delete', true))) return;
  HS().dexa = HS().dexa.filter(s => s.id !== el.dataset.id); save(); closeSheet(); rerender();
});

/* ---------- labs ---------- */
const labFlag = (L, v) => !L ? 'ok' : (L.lo != null && v < L.lo) ? 'low' : (L.hi != null && v > L.hi) ? 'high' : 'ok';
export function latestLabs() {
  const by = {}; [...HS().labs].sort((a, b) => a.d.localeCompare(b.d)).forEach(l => { by[l.m] = l; });
  return Object.values(by).map(l => { const L = H.LABS.find(x => x.id === l.m); return { ...l, L, flag: labFlag(L, l.v) }; });
}
const rangeTxt = L => L && (L.lo != null || L.hi != null) ? `typical ${L.lo != null && L.hi != null ? `${L.lo}–${L.hi}` : L.lo != null ? `${L.lo}+` : `under ${L.hi}`}` : '';
function labsView() {
  const latest = latestLabs();
  return `<section class="panel"><div class="ptitle"><span>Lab results</span></div><button class="btn full big" data-act="body.addlab">+ Add lab results</button>
    <div class="note">Also upload the PDF or a photo in Records so the original is always with you.</div></section>
  <section class="panel"><div class="ptitle"><span>Latest values</span></div>${latest.length ? latest.map(l => `<button class="row btnrowitem" data-act="body.labhist" data-m="${l.m}"><div class="grow"><div class="rt sm">${esc(l.L?.n || l.m)}</div><div class="rs">${niceDate(l.d)}${rangeTxt(l.L) ? ' · ' + rangeTxt(l.L) : ''}</div></div><b>${r1(l.v)} <span class="rs">${l.L?.u || ''}</span></b><span class="badge ${l.flag === 'ok' ? '' : 'red'}">${l.flag === 'ok' ? 'OK' : l.flag.toUpperCase()}</span></button>`).join('')
    : '<div class="empty">No results yet. A yearly panel with vitamin D, testosterone, lipids, ferritin and a metabolic panel is a smart baseline.</div>'}</section>
  <div class="note center">Typical adult ranges. Your lab's report has the final say. Talk to your doctor about anything flagged.</div>`;
}
reg('body.addlab', () => sheet('Add lab results', `<label class="field"><span>Test date</span><input id="lb-d" type="date" value="${dkey()}"></label>
  <div class="note">Fill in only what's on your report.</div>
  ${H.LABS.map(L => `<label class="field"><span>${L.n} (${L.u})</span><input id="lb-${L.id}" type="number" inputmode="decimal" step="any"></label>`).join('')}
  <button class="btn full big mt" data-act="body.savelabs">Save results</button>`));
reg('body.savelabs', () => {
  const d = $('#lb-d').value || dkey(); let n = 0;
  H.LABS.forEach(L => { const v = optNum($('#lb-' + L.id).value); if (v != null) { HS().labs = HS().labs.filter(x => !(x.m === L.id && x.d === d)); HS().labs.push({ d, m: L.id, v }); n++; } });
  if (!n) return toast('Enter at least one value.');
  save(); closeSheet(); rerender(); toast(`${n} result${n > 1 ? 's' : ''} saved`);
});
reg('body.labhist', el => {
  const m = el.dataset.m, L = H.LABS.find(x => x.id === m), hist = HS().labs.filter(x => x.m === m).sort((a, b) => a.d.localeCompare(b.d));
  sheet(L?.n || m, `${L?.note ? `<div class="note" style="margin-top:0">${esc(L.note)}</div>` : ''}${hist.length >= 2 ? lineChart(hist.map(h => ({ x: niceDate(h.d), y: h.v }))) : ''}
    ${hist.slice().reverse().map(h => `<div class="row"><span class="grow">${niceDate(h.d)}</span><b>${r1(h.v)} ${L?.u || ''}</b><span class="badge ${labFlag(L, h.v) === 'ok' ? '' : 'red'}">${labFlag(L, h.v).toUpperCase()}</span><button class="iconbtn red" data-act="body.dellab" data-m="${m}" data-d="${h.d}" aria-label="Delete">×</button></div>`).join('')}`);
});
reg('body.dellab', el => { HS().labs = HS().labs.filter(x => !(x.m === el.dataset.m && x.d === el.dataset.d)); save(); closeSheet(); rerender(); });

/* ---------- records ---------- */
const CATS = ['Lab report', 'DEXA', 'Imaging (X-ray, MRI)', 'Doctor note', 'Prescription', 'Vaccination', 'Insurance', 'Other'];
function recordsView() {
  const recs = [...HS().records].sort((a, b) => b.d.localeCompare(a.d));
  return `<section class="panel"><div class="ptitle"><span>Records</span></div><button class="btn full big" data-act="body.addrec">+ Upload a record</button>
    <div class="note">Take a photo or pick a PDF of any medical document. When you're signed in, it syncs to your other devices, so you can add files from your computer too.</div></section>
  <section class="panel">${recs.length ? recs.map(r => `<button class="row btnrowitem" data-act="body.recdetail" data-id="${r.id}"><div class="grow"><div class="rt sm">${esc(r.title)}</div><div class="rs">${esc(r.cat)} · ${niceDate(r.d)}${r.files?.length ? ` · ${r.files.length} file${r.files.length > 1 ? 's' : ''}` : ''}</div></div><span class="rs">›</span></button>`).join('') : '<div class="empty">No records yet.</div>'}</section>`;
}
reg('body.addrec', () => sheet('Upload a record', `<label class="field"><span>Photo or PDF</span><input id="rc-f" type="file" accept="image/*,application/pdf" multiple></label>
  <label class="field"><span>Title</span><input id="rc-t" placeholder="e.g. Annual bloodwork"></label>
  <div class="grid2"><label class="field"><span>Type</span><select id="rc-c">${CATS.map(c => `<option>${c}</option>`).join('')}</select></label><label class="field"><span>Date</span><input id="rc-d" type="date" value="${dkey()}"></label></div>
  <label class="field"><span>Notes</span><textarea id="rc-n" rows="3" placeholder="Doctor, findings, follow-ups"></textarea></label>
  <button class="btn full big mt" data-act="body.saverec">Save</button>`));
reg('body.saverec', async () => {
  const files = [...$('#rc-f').files], title = $('#rc-t').value.trim();
  if (!files.length && !title) return toast('Add a file or a title.');
  toast('Saving…');
  const ids = []; for (const f of files) ids.push(await F.putFile(f));
  const r = { id: 'r_' + uid(), d: $('#rc-d').value || dkey(), cat: $('#rc-c').value, title: title || $('#rc-c').value, notes: $('#rc-n').value.trim(), files: ids };
  HS().records.push(r); save(); closeSheet(); rerender();
  toast(r.cat === 'Lab report' ? 'Saved. Add the numbers in Lab results to track them.' : 'Saved');
});
reg('body.recdetail', el => {
  const r = HS().records.find(x => x.id === el.dataset.id); if (!r) return;
  sheet(r.title, `<div class="rs">${esc(r.cat)} · ${fmtD(r.d, { month: 'long', day: 'numeric', year: 'numeric' })}</div>${filesHTML(r.files)}${r.notes ? `<div class="note">${esc(r.notes)}</div>` : ''}
    <button class="btn ghost danger full mt" data-act="body.delrec" data-id="${r.id}">Delete record</button>`, withFiles);
});
reg('body.delrec', async el => {
  if (!(await confirmBox('Delete record', 'Delete this record and its files from all your devices? This can’t be undone.', 'Delete', true))) return;
  const r = HS().records.find(x => x.id === el.dataset.id);
  for (const id of r?.files || []) { if (!HS().dexa.some(d => d.files?.includes(id))) await F.delFile(id); }
  HS().records = HS().records.filter(x => x.id !== el.dataset.id); save(); closeSheet(); rerender();
});

/* ---------- progress photos ---------- */
const POSES = ['Front', 'Side', 'Back'];
function photosView() {
  const ph = [...HS().photos].sort((a, b) => b.date.localeCompare(a.date));
  const cmp = POSES.map(p => { const xs = ph.filter(x => x.pose === p); return xs.length >= 2 ? { p, first: xs[xs.length - 1], last: xs[0] } : null; }).filter(Boolean);
  return `<section class="panel"><div class="ptitle"><span>Progress photos</span></div>
    <label class="field"><span>Add photo</span><input id="ph-f" type="file" accept="image/*"></label>
    <div class="inline"><select id="ph-p" aria-label="Pose">${POSES.map(p => `<option>${p}</option>`).join('')}</select><button class="btn" data-act="body.savephoto">Save photo</button></div>
    <div class="note">Same light, same spot, same time of day, every 2–4 weeks. Photos sync to your account when you're signed in.</div></section>
  ${cmp.map(c => `<section class="panel"><div class="ptitle"><span>${c.p}: first vs latest</span></div><div class="cmp"><div><img data-file="${c.first.fileId}" alt="First ${c.p}"><div class="rs center">${niceDate(c.first.date)}</div></div><div><img data-file="${c.last.fileId}" alt="Latest ${c.p}"><div class="rs center">${niceDate(c.last.date)}</div></div></div></section>`).join('')}
  <section class="panel">${ph.length ? `<div class="photogrid">${ph.map(x => `<button class="ph" data-act="body.viewphoto" data-id="${x.id}"><img data-file="${x.fileId}" alt="${x.pose}"><span>${x.pose} · ${niceDate(x.date)}</span></button>`).join('')}</div>` : '<div class="empty">No photos yet.</div>'}</section>`;
}
reg('body.savephoto', async () => {
  const f = $('#ph-f').files[0]; if (!f) return toast('Pick a photo first.');
  toast('Saving…');
  const fileId = await F.putFile(f);
  HS().photos.push({ id: 'p_' + uid(), date: dkey(), pose: $('#ph-p').value, fileId }); save(); rerender(); toast('Photo saved');
});
reg('body.viewphoto', el => {
  const x = HS().photos.find(p => p.id === el.dataset.id); if (!x) return;
  sheet(`${x.pose} · ${niceDate(x.date)}`, `<img class="fullph" data-file="${x.fileId}" alt=""><button class="btn ghost danger full mt" data-act="body.delphoto" data-id="${x.id}">Delete photo</button>`, { ...withFiles, wide: true });
});
reg('body.delphoto', async el => {
  if (!(await confirmBox('Delete photo', 'Delete this photo from all your devices?', 'Delete', true))) return;
  const x = HS().photos.find(p => p.id === el.dataset.id); if (x) await F.delFile(x.fileId);
  HS().photos = HS().photos.filter(p => p.id !== el.dataset.id); save(); closeSheet(); rerender();
});

export const SUBVIEWS = { body: bodyView, dexa: dexaView, labs: labsView, records: recordsView, photos: photosView };
