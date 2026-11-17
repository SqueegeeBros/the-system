// Barcode scanning (Chrome on Android has a built-in detector) + Open Food Facts lookup (free).
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
    n100: { sugar: n.sugars_100g, fiber: n.fiber_100g, protein: n.proteins_100g, salt: n.salt_100g, satfat: n['saturated-fat_100g'], kcal: kcal100 },
  };
}

// ---------- Health check: a transparent rating from Open Food Facts data + your allergy list and goals ----------
// Not a medical judgement. Missing data is shown as missing, never guessed.
const NUT = { a: [2, 'Nutri-Score A: strong overall nutrition profile'], b: [1, 'Nutri-Score B: good overall nutrition profile'], c: [0, 'Nutri-Score C: middle of the range'], d: [-1, 'Nutri-Score D: weaker nutrition profile'], e: [-2, 'Nutri-Score E: weakest nutrition profile'] };
const TREE = /\b(almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia|brazil nut|tree nut)s?\b/i;
export function healthCheck(p, allergenWords = []) {
  const reasons = [], notes = [];
  // 1. allergies first
  const tagTxt = p.allergens.join(' '), trTxt = p.traces.join(' ');
  const words = allergenWords.filter(Boolean).map(w => w.toLowerCase());
  const inText = t => words.find(w => String(t || '').toLowerCase().includes(w));
  const wantsPeanut = words.some(w => w.includes('peanut')), wantsTree = words.some(w => TREE.test(w) || w.includes('tree nut'));
  const allergen = (wantsPeanut && /peanut/.test(tagTxt) && 'peanuts') || (wantsTree && /en:nuts/.test(tagTxt) && 'tree nuts') || inText(p.ingredients) || inText(p.name) || null;
  const trace = !allergen && ((wantsPeanut && /peanut/.test(trTxt) && 'peanuts') || (wantsTree && /en:nuts/.test(trTxt) && 'tree nuts') || null);
  if (allergen) return { allergen, tier: 'stop', title: 'Not safe for you', sub: `Lists ${allergen}, which is on your allergy list.`, reasons: [{ s: -9, t: `Ingredients or allergen list include ${allergen}.` }], notes: ['Check the physical label: product recipes change and the database can be out of date.'], score: null };
  // 2. score
  let score = 0, known = 0;
  const L = p.levels || {}, n = p.n100 || {};
  if (p.nutri) { const [v, t] = NUT[p.nutri]; score += v; known += 2; reasons.push({ s: v, t }); }
  if (p.nova) { const v = p.nova === 1 ? 1 : p.nova === 4 ? -1 : 0; score += v; known++; reasons.push({ s: v, t: ['', 'Unprocessed or minimally processed', 'Processed culinary ingredient', 'Processed food', 'Ultra-processed food (NOVA 4)'][p.nova] }); }
  const lvl = (k, label, unit = 'g') => { const v = L[k]; if (!v) return; known++;
    const amt = n[{ sugars: 'sugar', 'saturated-fat': 'satfat', salt: 'salt' }[k] || k]; const a = amt != null ? ` (${amt > 0 && amt < 0.1 ? '<0.1' : Math.round(amt * 10) / 10} ${unit} per 100 g)` : '';
    if (v === 'high') { score -= 1; reasons.push({ s: -1, t: `High ${label}${a}` }); } else if (v === 'low') reasons.push({ s: 0, t: `Low ${label}${a}` }); };
  lvl('sugars', 'sugar'); lvl('saturated-fat', 'saturated fat'); lvl('salt', 'salt');
  if (n.protein != null && n.kcal) { known++; const share = (n.protein * 4) / n.kcal; if (share >= 0.2) { score += 1; reasons.push({ s: 1, t: `Good protein: ${Math.round(n.protein)} g per 100 g` }); } }
  if (n.fiber != null) { known++; if (n.fiber >= 6) { score += 1; reasons.push({ s: 1, t: `High fiber: ${Math.round(n.fiber)} g per 100 g` }); } }
  // 3. personal notes (no score change)
  if (trace) notes.push(`May contain ${trace} (shared equipment or facility). You've said same-building foods are acceptable, but check this label against your allergy plan.`);
  if (L.sugars === 'high') notes.push('Your acne-conscious plan favors lower-sugar, lower-glycemic choices. One food won\'t make or break it.');
  if (/milk|whey|casein/i.test(p.ingredients) || p.categories.some(c => /dair|milk|cheese|yogurt/.test(c))) notes.push('Contains milk or whey, which your plan keeps out of the current acne trial.');
  if (n.kcal >= 400 && score >= 0) notes.push('Calorie-dense, which helps on a bulk if it fits your day.');
  if (known < 3) return { tier: 'unknown', title: 'Not enough data', sub: 'Open Food Facts doesn\'t have enough nutrition detail to rate this product. Check the label.', reasons, notes, score: null };
  const tier = score >= 2 ? 'good' : score >= 0 ? 'ok' : 'limit';
  const T = { good: ['Good everyday pick', 'Solid nutrition for your goals.'], ok: ['Okay sometimes', 'Fine in your day, not a staple.'], limit: ['Better as a treat', 'Fits occasionally. Not a great everyday choice.'] }[tier];
  return { tier, title: T[0], sub: T[1], reasons: reasons.sort((a, b) => tier === 'good' ? b.s - a.s : a.s - b.s), notes, score };
}
export const allergenFound = (p, words) => healthCheck(p, words).tier === 'stop';
