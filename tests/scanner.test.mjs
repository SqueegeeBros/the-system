// Node unit tests for the v19 scanner and allergy safety rules. Run: node tests/scanner.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
globalThis.window = globalThis.window || {};
const BC = await import('../js/barcode.js');
const H = await import('../js/data/health-data.js');
let n = 0; const t = (name, fn) => { fn(); n++; };
const LIST = ['peanut', 'tree nut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut'];
const prod = o => ({ name: 'Test', allergens: [], traces: [], tracesText: '', ingredients: '', ...o });

// --- four states ---
t('A from allergen tag (peanut)', () => assert.equal(BC.allergyCheck(prod({ allergens: ['en:peanuts'], ingredients: 'sugar' }), LIST).state, 'A'));
t('A from ingredient (almond) names the nut', () => { const a = BC.allergyCheck(prod({ ingredients: 'Oats, almonds, honey' }), LIST); assert.equal(a.state, 'A'); assert.equal(a.title, 'Contains almond (tree nut)'); });
t('B from traces tag', () => { const a = BC.allergyCheck(prod({ traces: ['en:nuts'], ingredients: 'oats, sugar' }), LIST); assert.equal(a.state, 'B'); assert.match(a.body, /may contain tree nuts/); });
t('B from precautionary text in ingredients, not A', () => assert.equal(BC.allergyCheck(prod({ ingredients: 'Oats, sugar. May contain tree nuts and peanuts.' }), LIST).state, 'B'));
t('B from facility statement', () => assert.equal(BC.allergyCheck(prod({ ingredients: 'Rice, salt. Processed in a facility that also processes peanuts.' }), LIST).state, 'B'));
t('C when ingredients present and no match', () => { const a = BC.allergyCheck(prod({ ingredients: 'Whole grain oats' }), LIST); assert.equal(a.state, 'C'); assert.match(a.body, /No peanut or tree-nut ingredient found/); });
t('D when no ingredient list', () => assert.equal(BC.allergyCheck(prod({}), LIST).state, 'D'));
t('peanut-free claim does not trigger A', () => assert.equal(BC.allergyCheck(prod({ ingredients: 'Sunflower seeds, salt. Made in a peanut-free facility.' }), LIST).state, 'C'));
t('coconut, nutmeg, butternut, doughnut are not tree nuts', () => assert.equal(BC.allergyCheck(prod({ ingredients: 'coconut, nutmeg, butternut squash, doughnut glaze' }), LIST).state, 'C'));
t('high nutrition never overrides A', () => { const a = BC.allergyCheck(prod({ allergens: ['en:nuts'], ingredients: 'almonds', per100: { kcal: 600, p: 21, c: 22, f: 50 } }), LIST); assert.equal(a.state, 'A'); assert.equal(BC.LOG_LABEL[a.state], 'Log anyway'); });

// --- all 12 FDA tree nuts, singular and plural, detected even when not on the stored list ---
const NUTS = ['almond', 'black walnut', 'Brazil nut', 'California walnut', 'cashew', 'filbert', 'hazelnut', 'heartnut', 'Japanese walnut', 'macadamia', 'bush nut', 'pecan', 'pine nut', 'pinon', 'pistachio', 'English walnut', 'Persian walnut'];
for (const nut of NUTS) for (const form of [nut, nut + (nut.endsWith('o') ? 'es' : 's')]) {
  t(`tree nut: ${form}`, () => assert.equal(BC.allergyCheck(prod({ ingredients: `Flour, ${form}, salt` }), ['peanut', 'tree nut']).state, 'A', form));
}
t('pistachios plural', () => assert.equal(BC.allergyCheck(prod({ ingredients: 'pistachios' }), ['tree nut']).state, 'A'));

// --- sample data and wording rules ---
t('sample day has no tagged or tree-nut/peanut items', () => {
  for (const m of H.SAMPLE_DAY) for (const [id] of m.items) { const f = H.FOODS.find(x => x.id === id); assert.ok(f, id); assert.ok(!f.allergen, `${id} is tagged ${f.allergen}`);
    assert.ok(!BC.TREE_RE.test(f.n) && !BC.PEANUT_RE.test(f.n), `${f.n} looks like a nut`); }
});
t('almonds carry an intrinsic tree-nut tag', () => assert.equal(H.FOODS.find(f => f.id === 'almonds').allergen, 'tree nut'));
const files = []; const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|html)$/.test(f)) files.push(p); } };
walk(new URL('../js', import.meta.url).pathname); files.push(new URL('../index.html', import.meta.url).pathname);
t('no banned reassurance phrases in UI text', () => {
  for (const f of files) { const s = readFileSync(f, 'utf8');
    for (const re of [/peanut-free(?!\]|\\b|-free)/i, /\bnut-free\b/i, /allergy[- ]safe/i, /safe for you/i, /eat freely/i]) {
      for (const m of s.matchAll(new RegExp(re.source, 'gi'))) { const ctx = s.slice(Math.max(0, m.index - 60), m.index + 40);
        const line = s.slice(s.lastIndexOf('\n', m.index) + 1, m.index);
        if (/^\s*(\/\/|\*)/.test(line)) continue;   // code comments, not UI text
        assert.fail(`${f}: "${m[0]}" in …${ctx}…`); } } }
});

// --- data quality ---
t('stale entry warning', () => assert.equal(BC.quality({ modified: Date.now() - 400 * 864e5 }).length, 1));
t('kcal mismatch warning', () => assert.match(BC.quality({ per100: { kcal: 500, p: 10, c: 10, f: 5 } })[0], /don’t add up/));
t('consistent numbers: no warning', () => assert.equal(BC.quality({ per100: { kcal: 140, p: 13, c: 17, f: 2 }, modified: Date.now() }).length, 0));
console.log(`ok ${n} tests`);
