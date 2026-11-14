// DEV ONLY. Loaded when the app is opened with ?fixtures=face. Writes to a separate
// database (the-system-face-dev), never to your real Face records.
import { dkey, addDays, uid } from '../util.js';

async function samplePhoto(label, tint, side) {
  const c = document.createElement('canvas'); c.width = 600; c.height = 800;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 800); g.addColorStop(0, tint); g.addColorStop(1, '#1a1612'); x.fillStyle = g; x.fillRect(0, 0, 600, 800);
  x.fillStyle = 'rgba(255,255,255,.10)';
  if (side) { x.beginPath(); x.ellipse(320, 330, 150, 205, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(190, 340); x.lineTo(150, 380); x.lineTo(190, 400); x.fill(); }
  else { x.beginPath(); x.ellipse(300, 330, 165, 215, 0, 0, Math.PI * 2); x.fill(); }
  x.fillRect(240, 520, 120, 200);
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '700 30px sans-serif'; x.textAlign = 'center'; x.fillText('SAMPLE · ' + label, 300, 770);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
}

export async function seed({ putPhoto }) {
  const today = dkey(), mon = addDays(today, -((new Date().getDay() + 6) % 7));
  const weeks = [-21, -14, -7].map(n => addDays(mon, n));
  const checkins = [];
  for (const [i, d] of weeks.entries()) {
    const front = await putPhoto(await samplePhoto('FRONT W' + (i + 1), ['#4a3c2c', '#4d3e2e', '#4f402f'][i], false));
    const sideP = await putPhoto(await samplePhoto('LEFT SIDE W' + (i + 1), ['#3c3226', '#3e3428', '#40352a'][i], true));
    checkins.push({ id: 'c_' + uid(), date: d, photos: { front, side: sideP, opposite: null }, side: 'left', note: i === 0 ? 'Baseline. Window light, 5 PM.' : '', light: 'Window', time: '17:00' });
  }
  const skin = [];
  const lv = [[2, 1, 1, 2, 2], [2, 1, 2, 2, 1], [1, 1, 1, 2, 1], [1, 0, 0, 2, 1], [1, 1, 0, 1, 1], [1, 0, 0, 1, 1]];
  [-26, -19, -12, -8, -4, -1].forEach((n, i) => {
    const [b, r, tnd, m, p] = lv[i];
    skin.push({ id: 's_' + uid(), date: addDays(today, n), t: Date.now(), breakouts: b, count: i === 3 ? 3 : null, countSrc: i === 3 ? 'manual' : null,
      areas: i % 2 ? ['chin', 'jaw'] : ['forehead', 'chin'], redness: r, irritation: i === 1 ? 2 : 0, tender: tnd, marks: m, puffiness: p, note: i === 1 ? 'Dry around nose after new product.' : '' });
  });
  const products = [
    { id: 'pr1', name: 'Gentle cleanser', active: '', strength: '', how: 'Pea-size amount, lukewarm water.', slots: ['am', 'pm'], days: null, start: addDays(today, -40), stop: null, paused: false, notes: 'Sample product' },
    { id: 'pr2', name: 'Moisturizer', active: '', strength: '', how: 'After cleansing.', slots: ['am', 'pm'], days: null, start: addDays(today, -40), stop: null, paused: false, notes: 'Sample product' },
    { id: 'pr3', name: 'Sunscreen', active: '', strength: 'SPF 30', how: 'Last step in the morning.', slots: ['am'], days: null, start: addDays(today, -40), stop: null, paused: false, notes: 'Sample product' },
    { id: 'pr4', name: 'Sample topical', active: 'Example active', strength: '', how: 'Thin layer, evenings.', slots: ['pm'], days: [1, 3, 5], start: addDays(today, -20), stop: null, paused: false, notes: 'Sample product' },
  ];
  const routineLog = {};
  for (let n = 1; n <= 10; n++) { const d = addDays(today, -n); routineLog[d] = { 'pr1@am': 'done', 'pr2@am': n % 3 ? 'done' : 'skipped', 'pr3@am': n % 2 ? 'done' : undefined, 'pr1@pm': 'done', 'pr2@pm': 'done' }; }
  routineLog[today] = { 'pr1@am': 'done', 'pr2@am': 'done' };
  const grooming = [
    { id: 'g1', name: 'Brow tidy', every: 14, last: addDays(today, -12), note: 'Strays only.', on: true },
    { id: 'g2', name: 'Shave or tidy facial hair', every: 3, last: addDays(today, -3), note: '', on: true },
    { id: 'g3', name: 'Lip balm', every: 1, last: addDays(today, -1), note: '', on: true },
  ];
  return { v: 1, createdAt: Date.now(), checkins, skin, products, routineLog, grooming, analyses: [], reviews: [], settings: { bottleOz: 128, overlay: true, guaSha: false, clinicianSeen: 0 }, seenIntro: true, _fixture: true };
}
