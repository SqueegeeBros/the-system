// Barcode scanning (Chrome on Android has a built-in detector) + Open Food Facts lookup (free, crowd-sourced).
// v19: no overall health score. A scan reports allergy status first (four explicit states), then plain
// nutrition facts for the amount you eat. A scan can flag an allergen; it can never confirm a product is free of one.
import { S, save } from './state.js';
export const canScan = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

export async function startScan(video, onCode) {
  const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
  let formats = wanted;
  try { const sup = await BarcodeDetector.getSupportedFormats(); formats = wanted.filter(f => sup.includes(f)); } catch {}
  const det = new BarcodeDetector({ formats });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  await video.play();
  let stopped = false;
  const stop = () => { stopped = true; stream.getTracks().forEach(t => t.stop()); };
  const loop = async () => {
    if (stopped) return;
    try {
      const codes = await det.detect(video);
      if (codes.length) { stop(); onCode(codes[0].rawValue); return; }
    } catch {}
    setTimeout(loop, 200);
  };
  loop();
  return stop;
}

export const OFFLINE_MSG = 'Can’t reach the database. Log from the label or try again.';
const FIELDS = 'product_name,brands,serving_size,serving_quantity,product_quantity,quantity,nutriments,allergens_tags,traces_tags,traces,ingredients_text,nova_group,image_front_small_url,last_modified_t';

export async function lookup(code, { timeoutMs = 8000 } = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  let r;
  try { r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal: ctl.signal }); }
  catch { throw new Error(OFFLINE_MSG); }
  finally { clearTimeout(timer); }
  if (!r.ok && r.status !== 404) throw new Error(OFFLINE_MSG);
  const j = await r.json().catch(() => ({}));
  if (j.status !== 1 || !j.product) return null;
  return normalize(code, j.product);
}

const numOrNull = v => (v == null || v === '' || !Number.isFinite(+v)) ? null : +v;
function nutrients(n, suf) {
  const g = k => numOrNull(n[`${k}_${suf}`]);
  let kcal = g('energy-kcal');
  if (kcal == null && g('energy') != null) kcal = g('energy') / 4.184;
  if (kcal == null) return null;
  const sodium = g('sodium');
  return { kcal, p: g('proteins') ?? 0, c: g('carbohydrates') ?? 0, f: g('fat') ?? 0, fiber: g('fiber'), sugar: g('sugars'),
    added: g('added-sugars'), sodiumMg: sodium != null ? sodium * 1000 : null, satfat: g('saturated-fat') };
}
export function normalize(code, p) {
  const n = p.nutriments || {};
  return {
    code, name: p.product_name || 'Unnamed product', brand: (p.brands || '').split(',')[0].trim(),
    servingSize: p.serving_size || '', servingG: numOrNull(p.serving_quantity),
    packageG: numOrNull(p.product_quantity), packageLabel: p.quantity || '',
    per100: nutrients(n, '100g'), perServing: nutrients(n, 'serving'),
    allergens: p.allergens_tags || [], traces: p.traces_tags || [], tracesText: p.traces || '',
    ingredients: p.ingredients_text || '', nova: [1, 2, 3, 4].includes(+p.nova_group) ? +p.nova_group : null,
    image: p.image_front_small_url || '', modified: p.last_modified_t ? p.last_modified_t * 1000 : null,
  };
}

// ---------- Allergy check ----------
// FDA's tree-nut list (Edition 5 guidance, Jan 2025) plus common synonyms and nut-based ingredients.
// Peanuts are a legume and a separate group. Coconut is not on the FDA list; add it to your allergy list if your plan says so.
const TREE_WORDS = ['almond', 'black walnut', 'brazil nut', 'california walnut', 'english walnut', 'persian walnut', 'japanese walnut', 'walnut',
  'cashew', 'filbert', 'hazelnut', 'heartnut', 'macadamia', 'bush nut', 'pecan', 'pine nut', 'pinon', 'piñon', 'pignoli', 'pignolia',
  'pistachio', 'tree nut', 'marzipan', 'praline', 'gianduja', 'frangipane', 'nut butter', 'nut oil', 'nut'];
const PEANUT_WORDS = ['peanut', 'groundnut', 'arachis'];
const words2re = list => new RegExp(`(?<![\\p{L}])(${list.map(w => w.replace(/ /g, '[\\s-]+')).join('|')})(e?s)?(?![\\p{L}])`, 'iu');
export const TREE_RE = words2re(TREE_WORDS);
export const PEANUT_RE = words2re(PEANUT_WORDS);
const TREE_TAG = /en:(nuts|almonds?|cashews?|walnuts?|hazelnuts?|pecans?|pistachios?|macadamias?|brazil-nuts?|pine-nuts?)\b/i;
const PEANUT_TAG = /en:peanuts?\b/i;
// Phrases that start a precautionary statement inside an ingredient list.
const PRECAUTION = /(may contain|may also contain|may be present|traces? of|made (in|on) (a |the )?(same )?(facility|equipment|line)|manufactured (in|on)|processed (in|on)|produced (in|on)|packaged (in|on)|packed (in|on)|shares? (a )?(facility|equipment|line)|same (facility|equipment|line))/i;
// "Peanut-free", "free from nuts" and similar are claims, not ingredients; they must not trigger a match.
const FREE_CLAIMS = /\b(peanut|tree[\s-]*nut|nut)s?[\s-]*free\b|\bfree (from|of) (peanuts?|tree[\s-]*nuts?|nuts)((,| and| or| &) (peanuts?|tree[\s-]*nuts?|nuts))*/gi;

export function splitIngredients(text) {
  const t = String(text || '');
  let main = '', prec = '';
  for (const seg of t.split(/(?<=[.;])\s+|\n+/)) {
    const m = seg.match(PRECAUTION);
    if (m) { main += ' ' + seg.slice(0, m.index); prec += ' ' + seg.slice(m.index); }
    else main += ' ' + seg;
  }
  return { main: main.replace(FREE_CLAIMS, ' '), prec: prec.replace(FREE_CLAIMS, ' ') };
}
export function groupsFor(list = []) {
  const ws = list.filter(Boolean).map(w => String(w).toLowerCase().trim());
  const isPeanut = w => PEANUT_RE.test(w), isTree = w => !isPeanut(w) && (TREE_RE.test(w) || /tree ?nut/.test(w));
  return { peanut: ws.some(isPeanut), tree: ws.some(isTree), other: ws.filter(w => w && !isPeanut(w) && !isTree(w)) };
}
const groupLabel = g => [g.peanut && 'peanut', g.tree && 'tree-nut'].filter(Boolean).join(' or ') || 'allergy-list';
const singular = w => w.toLowerCase().replace(/[\s-]+/g, ' ').replace(/(nut|almond|cashew|walnut|pecan|filbert|hazelnut|heartnut|macadamia|pistachio|pignolia)(e?s)$/, '$1');
const otherRe = w => new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu');

// Returns { state: 'A' | 'B' | 'C' | 'D', title, body, word }. Never returns anything that means "safe".
export function allergyCheck(p, allergyList = []) {
  const g = groupsFor(allergyList);
  const { main, prec } = splitIngredients(p.ingredients);
  const declaredText = `${main} ${p.name || ''}`, tags = (p.allergens || []).join(' '), traces = (p.traces || []).join(' ');
  const precText = `${prec} ${p.tracesText || ''}`;
  // A: declared
  let hit = null;
  if (g.peanut && (PEANUT_TAG.test(tags) || PEANUT_RE.test(declaredText))) hit = { word: 'peanut', title: 'Contains peanut' };
  if (!hit && g.tree) {
    const m = declaredText.match(TREE_RE);
    if (m) { const w = singular(m[1]); hit = { word: w, title: w === 'tree nut' || w === 'nut' ? 'Contains tree nuts' : `Contains ${w} (tree nut)` }; }
    else if (TREE_TAG.test(tags)) hit = { word: 'tree nuts', title: 'Contains tree nuts' };
  }
  if (!hit) for (const w of g.other) if (otherRe(w).test(declaredText) || tags.toLowerCase().includes(w)) { hit = { word: w, title: `Contains ${w}` }; break; }
  if (hit) return { state: 'A', title: hit.title, body: 'On your allergy list.', word: hit.word };
  // B: precautionary
  const may = [];
  if (g.peanut && (PEANUT_TAG.test(traces) || PEANUT_RE.test(precText))) may.push('peanut');
  if (g.tree && (TREE_TAG.test(traces) || TREE_RE.test(precText))) may.push('tree nuts');
  for (const w of g.other) if (otherRe(w).test(precText) || traces.toLowerCase().includes(w)) may.push(w);
  if (may.length) {
    const what = may.join(' and ');
    return { state: 'B', title: `May contain ${what}`, body: `Label data says it may contain ${what}. The risk varies by product. Check the package and follow your allergy plan.`, word: what };
  }
  // C or D
  if (String(p.ingredients || '').trim().length > 3) {
    return { state: 'C', title: 'Not found in this entry', body: `No ${groupLabel(g)} ingredient found in this database entry. Entries can be wrong or out of date, and cross-contact isn’t always labeled. Check the package.` };
  }
  return { state: 'D', title: 'Not enough information', body: 'Not enough information to check allergens. Read the package before eating.' };
}
export const LOG_LABEL = { A: 'Log anyway', B: 'Log', C: 'Log', D: 'Log after checking label' };

// ---------- Data-quality warnings ----------
export function quality(p, now = Date.now()) {
  const out = [];
  if (p.modified && now - p.modified > 365 * 864e5) out.push('This entry is over a year old. Check the label.');
  const b = p.per100 || p.perServing;
  if (b && b.kcal > 20) { const calc = 4 * (b.p || 0) + 4 * (b.c || 0) + 9 * (b.f || 0); if (Math.abs(calc - b.kcal) / b.kcal > 0.15) out.push('These numbers don’t add up. Check the label.'); }
  return out;
}

// ---------- Scan history (last 20; name and allergy state only) ----------
export function remember(p, a) {
  S.scans = S.scans || [];
  const i = S.scans.findIndex(x => x.code === p.code); if (i >= 0) S.scans.splice(i, 1);
  S.scans.unshift({ code: p.code, name: p.name, brand: p.brand, state: a.state, title: a.title, at: Date.now() });
  S.scans.splice(20); save();
}
export function forget(code) { S.scans = (S.scans || []).filter(x => x.code !== code); save(); }
// Older history entries (v16–v18) carried a score; map them to a neutral state so no score is shown.
export const histState = x => x.state || (x.tier === 'stop' ? 'A' : 'D');
