// Gemini (Google AI Studio free tier). The key is stored only on this phone.
import { S } from './state.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const FALLBACK = 'gemini-flash-lite-latest';

export const hasKey = () => !!S.settings.geminiKey?.trim();

function timed(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }

async function request(model, parts, schema) {
  const res = await fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
    signal: timed(30000),
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUSY = [500, 502, 503, 504];

// Tries the main model, then Flash-Lite. Busy servers (5xx) get two quick retries before moving on.
async function withRetry(models, fn) {
  let last;
  for (const m of [...new Set(models)]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await fn(m); }
      catch (e) {
        last = e;
        if (BUSY.includes(e.status) || e.name === 'AbortError') { if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue; } break; }
        if ([403, 404, 429].includes(e.status)) break;
        throw friendly(e);
      }
    }
  }
  throw friendly(last);
}

async function call(parts, schema) {
  if (!hasKey()) throw new Error('Add your free Gemini API key in Profile → Settings first.');
  const model = S.settings.geminiModel?.trim() || 'gemini-flash-latest';
  return withRetry([model, FALLBACK], m => request(m, parts, schema));
}

function friendly(e) {
  if (e.name === 'AbortError') return new Error('Gemini took too long to answer. Try again in a moment.');
  if (!e.status) return e.message?.includes('Failed to fetch') ? new Error('No connection. Log manually or try again when online.') : e;
  if (BUSY.includes(e.status)) return new Error('Google’s AI servers are overloaded right now. That’s on Google’s end, not your key. Try again in a minute, or log manually.');
  if (e.status === 429) return new Error('Free-tier limit reached for now. Try again later, or log manually.');
  if (e.status === 400 && /api key/i.test(e.body)) return new Error('Gemini rejected the API key. Check it in Settings.');
  if (e.status === 403) return new Error('This key can’t use that model. Check the key and model in Settings.');
  if (e.status === 404) return new Error('Model not found. Change the model name in Settings.');
  return new Error(`Gemini error ${e.status}. Try again.`);
}

const NUM = { type: 'NUMBER' }, STR = { type: 'STRING' };

export async function analyzePhoto(base64) {
  const saved = S.meals.map(m => `${m.id}: ${m.name} (${m.kcal} kcal, ${m.p}P/${m.c}C/${m.f}F per serving)`).join('\n');
  const prompt = `You estimate nutrition from food photos for someone tracking macros.
Identify each distinct food, estimate the portion actually shown, and estimate calories, protein, carbs and fat for that portion.
Be realistic: do not lowball oils, sauces or portion sizes.
If the plate clearly matches one of the user's saved meals below, set matchMealId to that id; otherwise leave it empty.
Set containsPeanut true if anything likely contains peanuts or peanut butter.${S.settings.allergens.length ? `\nAlso mention in note if anything likely contains: ${S.settings.allergens.join(', ')}.` : ''}
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

// ---------- Coach chat ----------
export async function coachChat(history, context) {
  if (!hasKey()) throw new Error('Add your free Gemini API key in Profile → Settings first.');
  const name = S.profile.name || 'the user', about = S.profile.about?.trim();
  const system = `You are "the Coach" inside The System, a personal quest-tracker app (gamified, but keep your tone grounded, direct and practical — no roleplay, no hype, no flattery).
You're talking with ${name}.${about ? ` About them, in their words: ${about}` : ''}
${S.settings.allergens.length ? `Hard rule: never suggest anything containing ${S.settings.allergens.join(', ')}.` : ''}
Answer the actual question in a few short lines or a short list. Use real numbers from the context. If they're behind on calories or protein, give concrete foods/amounts that fit what they have (their saved meals first). For work, give specific next actions. Say so when you're unsure.
If they say they ate something or ask you to log food, put each item in "foods" with realistic macros so the app can offer a one-tap log. Otherwise leave "foods" empty. Never claim you logged anything yourself.
Current app data (live):
${context}`;
  const contents = history.slice(-16).map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] }));
  const schema = {
    type: 'OBJECT',
    properties: {
      reply: STR,
      foods: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: STR, kcal: NUM, protein: NUM, carbs: NUM, fat: NUM }, required: ['name', 'kcal', 'protein', 'carbs', 'fat'] } },
    },
    required: ['reply'],
  };
  const body = (model) => fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
    signal: timed(30000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.settings.geminiKey.trim() },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema } }),
  });
  // Chat uses the fast Flash-Lite model first, then the main model; busy servers are retried.
  const main = S.settings.geminiModel?.trim() || 'gemini-flash-latest';
  const res = await withRetry([FALLBACK, main], async m => {
    let r;
    try { r = await body(m); } catch (e) { if (e.name === 'AbortError') throw e; const n = new Error('offline'); n.offline = true; throw n; }
    if (!r.ok) { const e = new Error(); e.status = r.status; e.body = await r.text().catch(() => ''); throw e; }
    return r;
  }).catch(e => { throw e.offline ? new Error('No connection. Try again when you’re online.') : e; });
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  try { return JSON.parse(text); } catch { return { reply: text || 'No answer. Try rephrasing.', foods: [] }; }
}

// ---------- Face: compare two check-in photos (explicit action only) ----------
export async function faceCompare(b64A, b64B, meta, context) {
  const prompt = `You compare two photos of the same person's face for a personal tracking app. Photo 1 is the EARLIER check-in (${meta.a}), photo 2 is the LATER one (${meta.b}). View: ${meta.view}.
Describe only VISIBLE differences, in cautious language ("appears slightly less puffy", "no clear change"). Areas:
- Cheek and under-eye puffiness
- Apparent jawline definition
- Visible breakouts
- Redness and healing marks
- Visible irritation (only if image quality permits)
Rules:
- "No clear change" is a normal, valid result. Do not invent change.
- First check lighting, expression, head angle, camera distance/height, focus and resolution. If differences make the comparison unfair, set comparable to "limited" or "no" and say why.
- Do not estimate body fat, diagnose any skin condition, name hormones, or suggest food intolerances. Do not rate attractiveness or call features flaws.
- Keep observations separate from explanations. Never claim a food, salt, or product caused a change.
- Next steps: 1 to 3, conservative and practical (photo consistency, keeping up the existing routine, documenting irritation, asking a clinician about painful or scarring spots). The person is gaining muscle slowly (lean bulk, lifting 5 days, active job): never suggest a calorie deficit, extra cardio, dehydration, cutting sodium hard, diuretics, detoxes, fasting, or cutting out foods.
- Do not count spots.
Logged context from the user's own records (self-reported, not measured):
${context}`;
  const AREAS = ['Cheek and under-eye puffiness', 'Jawline definition', 'Visible breakouts', 'Redness and healing marks', 'Visible irritation'];
  return call([{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: b64A } }, { inlineData: { mimeType: 'image/jpeg', data: b64B } }], {
    type: 'OBJECT',
    properties: {
      comparable: { type: 'STRING', enum: ['yes', 'limited', 'no'] },
      summary: STR,
      observations: { type: 'ARRAY', items: { type: 'OBJECT', properties: { area: { type: 'STRING', enum: AREAS }, change: { type: 'STRING', enum: ['appears less visible', 'appears more visible', 'no clear change', 'not assessable'] }, detail: STR }, required: ['area', 'change', 'detail'] } },
      limitations: { type: 'ARRAY', items: STR },
      nextSteps: { type: 'ARRAY', items: STR },
    },
    required: ['comparable', 'summary', 'observations', 'limitations', 'nextSteps'],
  });
}
