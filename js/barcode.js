// Barcode scanning (Chrome on Android has a built-in detector) + Open Food Facts lookup (free).
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

export async function lookup(code) {
  const fields = 'product_name,brands,serving_size,serving_quantity,product_quantity,quantity,nutriments,allergens_tags,traces_tags,ingredients_text,nutriscore_grade,nova_group,nutrient_levels,additives_n,categories_tags,image_front_small_url';
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  if (!r.ok && r.status !== 404) throw new Error('Lookup failed. Check your connection.');
  const j = await r.json().catch(() => ({}));
  if (j.status !== 1 || !j.product) return null;
  const p = j.product, n = p.nutriments || {};
  const kcal100 = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  const per100 = kcal100 != null ? { kcal: kcal100, p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0 } : null;
  const perServing = n['energy-kcal_serving'] != null
    ? { kcal: n['energy-kcal_serving'], p: n.proteins_serving || 0, c: n.carbohydrates_serving || 0, f: n.fat_serving || 0 } : null;
  const tags = [...(p.allergens_tags || []), ...(p.traces_tags || [])].join(' ');
  return {
    code, name: p.product_name || 'Unnamed product', brand: (p.brands || '').split(',')[0].trim(),
    servingSize: p.serving_size || '', servingG: parseFloat(p.serving_quantity) || null,
    packageG: parseFloat(p.product_quantity) || null, packageLabel: p.quantity || '',
    per100, perServing,
    peanut: /peanut/i.test(tags) || /peanut/i.test(p.ingredients_text || ''),
    allergens: p.allergens_tags || [], traces: p.traces_tags || [], ingredients: p.ingredients_text || '',
    nutri: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade : null, nova: [1, 2, 3, 4].includes(+p.nova_group) ? +p.nova_group : null,
    levels: p.nutrient_levels || {}, additives: p.additives_n ?? null, categories: p.categories_tags || [], image: p.image_front_small_url || '',
    n100: { sugar: n.sugars_100g, fiber: n.fiber_100g, protein: n.proteins_100g, salt: n.salt_100g, satfat: n['saturated-fat_100g'], fat: n.fat_100g, kcal: kcal100 },
  };
}

// ---------- Health check (strict, whole-foods standard) ----------
// Score 0–100 from Open Food Facts data. Starts at 100 and loses points for processing, a weaker
// nutrition grade, added sugar, refined grains, long ingredient lists, additives, salt and saturated fat.
// Ultra-processed food can't score above 40. Calories and total fat are never penalized (you're bulking).
// Missing data is shown as missing, never guessed. Not medical advice.
const NUT = { a: [0, 'Nutri-Score A'], b: [-8, 'Nutri-Score B'], c: [-20, 'Nutri-Score C'], d: [-35, 'Nutri-Score D: weak nutrition profile'], e: [-50, 'Nutri-Score E: weakest nutrition profile'] };
const TREE = /\b(almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia|brazil nut|tree nut)s?\b/i;
const ADDED_SUGAR = /\b(sugar|cane sugar|brown sugar|corn syrup|high[- ]fructose|glucose syrup|syrup|dextrose|fructose|maltodextrin|sucrose|invert sugar|molasses|honey|agave|fruit juice concentrate|malt)\b/i;
const REFINED = /\b(enriched (wheat )?flour|bleached flour|wheat flour|white flour|white rice|rice flour|corn starch|cornstarch|modified (food )?starch)\b/i;
const HYDRO = /hydrogenated/i;
const SWEET = /\b(sucralose|aspartame|acesulfame|saccharin|neotame)\b/i;
const COLORS = /\b(red|yellow|blue) ?(no\.? ?)?\d+\b|\bcaramel colou?r\b/i;
export const TIERS = {
  great: { title: 'Whole food', sub: 'Minimally processed and nutritious. Eat freely.', color: '#2fb35a' },
  good: { title: 'Good pick', sub: 'Close to a whole food. Fine as a regular.', color: '#8cc63f' },
  ok: { title: 'Okay sometimes', sub: 'Some processing or added extras. Not an everyday staple.', color: '#e8c33a' },
  poor: { title: 'Not a whole food', sub: 'Processed, with things a whole-foods diet avoids. Mostly skip.', color: '#f08a3a' },
  avoid: { title: 'Avoid', sub: 'Ultra-processed or high in added sugar. Not a fit for how you eat.', color: '#e5484d' },
  stop: { title: 'Not safe for you', sub: '', color: '#e5484d' },
  unknown: { title: 'Not enough data', sub: 'The database is missing the details needed to rate this. Check the label.', color: '#6b6b72' },
};
const ingCount = t => { if (!t) return null; const top = String(t).replace(/\([^)]*\)|\[[^\]]*\]/g, ''); return top.split(/[,;]/).map(x => x.trim()).filter(x => x.length > 1).length; };
export function healthCheck(p, allergenWords = []) {
  const R = [], notes = [], add = (s, t) => R.push({ s, t });
  // 1. allergies first
  const tagTxt = p.allergens.join(' '), trTxt = p.traces.join(' ');
  const words = allergenWords.filter(Boolean).map(w => w.toLowerCase());
  const inText = t => words.find(w => String(t || '').toLowerCase().includes(w));
  const wantsPeanut = words.some(w => w.includes('peanut')), wantsTree = words.some(w => TREE.test(w) || w.includes('tree nut'));
  const allergen = (wantsPeanut && /peanut/.test(tagTxt) && 'peanuts') || (wantsTree && /en:nuts/.test(tagTxt) && 'tree nuts') || inText(p.ingredients) || inText(p.name) || null;
  const trace = !allergen && ((wantsPeanut && /peanut/.test(trTxt) && 'peanuts') || (wantsTree && /en:nuts/.test(trTxt) && 'tree nuts') || null);
  if (allergen) return { allergen, tier: 'stop', ...TIERS.stop, sub: `Lists ${allergen}, which is on your allergy list.`, score: null, reasons: [{ s: -100, t: `Ingredients or allergen list include ${allergen}.` }], notes: ['Check the physical label: recipes change and the database can be out of date.'] };

  const ing = p.ingredients || '', n = p.n100 || {}, L = p.levels || {};
  const count = ingCount(ing);
  // processing: NOVA, or an estimate from the ingredient list when NOVA is missing
  let nova = p.nova, novaEst = false;
  if (!nova && count != null) { novaEst = true; nova = count <= 1 ? 1 : (SWEET.test(ing) || COLORS.test(ing) || HYDRO.test(ing) || count > 10) ? 4 : count > 4 ? 3 : 2; }
  const hasData = p.nutri || nova || n.sugar != null;
  if (!hasData) return { tier: 'unknown', ...TIERS.unknown, score: null, reasons: [], notes: trace ? [`May contain ${trace}. Check the label against your allergy plan.`] : [] };

  let score = 100, cap = 100;
  if (nova) {
    const pen = { 1: 0, 2: -10, 3: -25, 4: -50 }[nova]; score += pen;
    add(pen, ['', 'Whole or minimally processed', 'Processed culinary ingredient (oil, flour, butter…)', 'Processed food', 'Ultra-processed food'][nova] + (novaEst ? ' (estimated from ingredients)' : ''));
    if (nova === 4) cap = 40;
  }
  if (p.nutri) { const [v, t] = NUT[p.nutri]; score += v; add(v, t); }
  // sugar: naturally occurring sugar in a whole food (fruit, plain dairy) isn't penalized
  const addedSugar = ADDED_SUGAR.test(ing);
  if (addedSugar) { score -= 15; add(-15, 'Contains added sugar or syrup'); }
  if (n.sugar != null && (nova !== 1 || addedSugar)) {
    const v = n.sugar > 22.5 ? -25 : n.sugar > 10 ? -15 : n.sugar > 5 ? -8 : 0;
    if (v) { score += v; add(v, `Sugar: ${Math.round(n.sugar)} g per 100 g`); }
  }
  if (REFINED.test(ing)) { score -= 12; add(-12, 'Refined flour or starch, not whole grain'); }
  if (HYDRO.test(ing)) { score -= 25; add(-25, 'Hydrogenated oil (a source of trans fat)'); }
  if (SWEET.test(ing)) { score -= 10; add(-10, 'Artificial sweetener'); }
  if (COLORS.test(ing)) { score -= 8; add(-8, 'Added coloring'); }
  if (p.additives != null && p.additives > 0) { const v = -Math.min(20, p.additives * 4); score += v; add(v, `${p.additives} additive${p.additives > 1 ? 's' : ''}`); }
  if (count != null && count > 5) { const v = count > 10 ? -15 : -8; score += v; add(v, `${count} ingredients (whole foods usually have 1–5)`); }
  if (n.salt != null) { const v = n.salt > 1.5 ? -15 : n.salt > 0.75 ? -8 : 0; if (v) { score += v; add(v, `Salt: ${Math.round(n.salt * 10) / 10} g per 100 g`); } }
  // saturated fat judged by its share of the fat, so olive oil isn't treated like butter or shortening
  if (n.satfat != null) { const share = n.fat ? n.satfat / n.fat : 1; const v = share < 0.33 ? 0 : n.satfat > 10 ? -15 : n.satfat > 5 ? -8 : 0; if (v) { score += v; add(v, `Saturated fat: ${Math.round(n.satfat * 10) / 10} g per 100 g`); } }
  // small bonuses (can't lift processed food into the top tier)
  if (n.fiber != null && n.fiber >= 6) { score += 5; add(5, `High fiber: ${Math.round(n.fiber)} g per 100 g`); }
  if (n.protein != null && n.kcal && (n.protein * 4) / n.kcal >= 0.2) { score += 5; add(5, `High protein: ${Math.round(n.protein)} g per 100 g`); }
  if (count === 1) add(0, 'Single ingredient');
  score = Math.max(0, Math.min(cap, Math.round(score)));
  if (nova === 3) score = Math.min(score, 74);   // processed food can reach "Good pick", never "Whole food"

  // personal notes (no score change)
  if (trace) notes.push(`May contain ${trace} (shared equipment or facility). You've said same-building foods are acceptable, but check this label against your allergy plan.`);
  if (addedSugar || (n.sugar != null && n.sugar > 10 && nova !== 1)) notes.push('Your acne-conscious plan favors lower-sugar, lower-glycemic choices.');
  if (/milk|whey|casein/i.test(ing) || p.categories.some(c => /dair|milk|cheese|yogurt/.test(c))) notes.push('Contains milk or whey, which your plan keeps out of the current acne trial.');
  if (!p.nutri && !p.nova) notes.push('Rated from the ingredient list only; the database has no Nutri-Score or processing level for this product.');

  const tier = score >= 85 ? 'great' : score >= 70 ? 'good' : score >= 50 ? 'ok' : score >= 30 ? 'poor' : 'avoid';
  const reasons = R.sort((a, b) => a.s - b.s);
  return { tier, ...TIERS[tier], score, reasons, notes };
}
export const scoreColor = s => s == null ? '#6b6b72' : s >= 85 ? TIERS.great.color : s >= 70 ? TIERS.good.color : s >= 50 ? TIERS.ok.color : s >= 30 ? TIERS.poor.color : TIERS.avoid.color;
export function remember(p, c) {
  S.scans = S.scans || [];
  const i = S.scans.findIndex(x => x.code === p.code); if (i >= 0) S.scans.splice(i, 1);
  S.scans.unshift({ code: p.code, name: p.name, brand: p.brand, tier: c.tier, title: c.title, score: c.score, at: Date.now() });
  S.scans.splice(20); save();
}
