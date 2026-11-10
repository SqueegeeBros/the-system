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
  const fields = 'product_name,brands,serving_size,serving_quantity,product_quantity,quantity,nutriments,allergens_tags,traces_tags,ingredients_text';
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
  };
}
