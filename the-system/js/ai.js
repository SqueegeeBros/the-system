// Gemini (Google AI Studio free tier). The key is stored only on this phone.
import { S } from './state.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const FALLBACK = 'gemini-flash-lite-latest';

export const hasKey = () => !!S.settings.geminiKey?.trim();

async function request(model, parts, schema) {
  const res = await fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.settings.geminiKey.trim() },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Gemini error ${res.status}`);
    err.status = res.status; err.body = body;
    throw err;
  }
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Gemini returned something unreadable. Try again.');
  }
}

async function call(parts, schema) {
  if (!hasKey()) throw new Error('Add your free Gemini API key in Status → Settings first.');
  const model = S.settings.geminiModel?.trim() || 'gemini-flash-latest';
  try {
    return await request(model, parts, schema);
  } catch (e) {
    // If the main model is limited or unavailable on the free tier, try Flash-Lite once.
    if ([403, 404, 429].includes(e.status) && model !== FALLBACK) {
      try { return await request(FALLBACK, parts, schema); } catch (e2) { e = e2; }
    }
    throw friendly(e);
  }
}

function friendly(e) {
  if (!e.status) return e.message?.includes('Failed to fetch') ? new Error('No connection. Log manually or try again when online.') : e;
  if (e.status === 429) return new Error('Free-tier limit reached for now. Try again later, or log manually.');
  if (e.status === 400 && /api key/i.test(e.body)) return new Error('Gemini rejected the API key. Check it in Settings.');
  if (e.status === 403) return new Error('This key can’t use that model. Check the key and model in Settings.');
  if (e.status === 404) return new Error('Model not found. Change the model name in Settings.');
  return new Error(`Gemini error ${e.status}. Try again.`);
}

const NUM = { type: 'NUMBER' }, STR = { type: 'STRING' };

export async function analyzePhoto(base64) {
  const saved = S.meals.map(m => `${m.id}: ${m.name} (${m.kcal} kcal, ${m.p}P/${m.c}C/${m.f}F per serving)`).join('\n');
  const prompt = `You estimate nutrition from food photos for a 19-year-old lifter tracking macros.
Identify each distinct food, estimate the portion actually shown, and estimate calories, protein, carbs and fat for that portion.
Be realistic: do not lowball oils, sauces or portion sizes.
If the plate clearly matches one of the user's saved meals below, set matchMealId to that id; otherwise leave it empty.
Set containsPeanut true if anything likely contains peanuts or peanut butter.
Saved meals:
${saved}`;
  return call([{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }], {
    type: 'OBJECT',
    properties: {
      items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: STR, portion: STR, kcal: NUM, protein: NUM, carbs: NUM, fat: NUM },
        required: ['name', 'portion', 'kcal', 'protein', 'carbs', 'fat'] } },
      matchMealId: STR,
      containsPeanut: { type: 'BOOLEAN' },
      confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
      note: STR,
    },
    required: ['items', 'containsPeanut', 'confidence'],
  });
}

export async function buildMeal(description) {
  const prompt = `Turn this recipe description into a saved meal for a macro tracker.
Use standard USDA nutrition values. Use the exact quantities given. If a quantity or the number of servings is missing,
assume a typical amount and say exactly what you assumed in "note".
"servings" is how many portions the whole batch makes. perServing macros are for ONE portion.
Ingredients are for the WHOLE batch, with numeric qty and a short unit (lb, oz, cup, tbsp, can, g, or empty for counts).
Set containsPeanut true if any ingredient contains peanuts.
Recipe: ${description}`;
  return call([{ text: prompt }], {
    type: 'OBJECT',
    properties: {
      name: STR, tag: { type: 'STRING', enum: ['Breakfast', 'Pre-gym', 'Post-gym', 'Lunch', 'Dinner', 'Snack', 'Shake'] },
      servings: { type: 'INTEGER' },
      perServing: { type: 'OBJECT', properties: { kcal: NUM, protein: NUM, carbs: NUM, fat: NUM }, required: ['kcal', 'protein', 'carbs', 'fat'] },
      ingredients: { type: 'ARRAY', items: { type: 'OBJECT', properties: { item: STR, qty: NUM, unit: STR }, required: ['item', 'qty', 'unit'] } },
      containsPeanut: { type: 'BOOLEAN' },
      note: STR,
    },
    required: ['name', 'tag', 'servings', 'perServing', 'ingredients', 'containsPeanut'],
  });
}

export async function testKey() {
  const r = await call([{ text: 'Reply with ok set to true.' }], { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] });
  return !!r.ok;
}
