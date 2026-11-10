// Health data: muscles, supplements, labs, foods, news sources, starter workouts.

export const MUSCLES = {
  chest: 'Chest', lats: 'Lats', upperBack: 'Upper back', frontDelts: 'Front delts', sideDelts: 'Side delts', rearDelts: 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads', hams: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', abs: 'Abs',
};
// Weekly hard-set targets (direct = 1, assisting = ½)
export const VOL_TARGET = { default: [10, 20], frontDelts: [4, 12], sideDelts: [8, 20], rearDelts: [4, 14], abs: [4, 12], calves: [6, 16], glutes: [6, 16] };

// Exercise name → [primary, assisting[]]. Order matters (first match wins).
const RULES = [
  [/leg curl|hamstring curl|nordic/, 'hams', []],
  [/romanian|\brdl\b|stiff.?leg|good morning/, 'hams', ['glutes']],
  [/calf/, 'calves', []],
  [/hip thrust|glute/, 'glutes', ['hams']],
  [/trap.?bar|deadlift/, 'glutes', ['hams', 'quads']],
  [/leg extension/, 'quads', []],
  [/squat|leg press|lunge|step.?up|hack/, 'quads', ['glutes']],
  [/lateral raise|side raise|lat raise|lateral/, 'sideDelts', []],
  [/rear delt|reverse fly|reverse pec|face pull/, 'rearDelts', ['upperBack']],
  [/shoulder press|overhead press|military|\bohp\b|arnold/, 'frontDelts', ['sideDelts', 'triceps']],
  [/pull.?down|pull.?up|chin.?up|pullover|lat prayer/, 'lats', ['biceps']],
  [/row/, 'upperBack', ['lats', 'biceps', 'rearDelts']],
  [/shrug/, 'upperBack', []],
  [/curl/, 'biceps', []],
  [/pushdown|push.?down|tricep|skull|kickback|french press/, 'triceps', []],
  [/fly|flye|pec deck|crossover/, 'chest', []],
  [/bench|chest press|push.?up|incline|decline|dip|chest/, 'chest', ['triceps', 'frontDelts']],
  [/crunch|leg raise|\babs?\b|plank|sit.?up|wheel|core/, 'abs', []],
];
export function classify(name, overrides = {}) {
  const n = String(name || '').toLowerCase().trim();
  if (overrides[n]) return { m: overrides[n], s: [] };
  for (const [re, m, s] of RULES) if (re.test(n)) return { m, s };
  return null;
}

// Starter sessions for empty templates (picked for a tall, long-limbed lifter)
const x = (name, sets, reps, rest) => ({ name, sets, reps, rest });
export const STARTER = {
  lower: [x('Hack squat', 3, '6–10', 180), x('Romanian deadlift', 3, '6–10', 180), x('Leg extension', 2, '10–15', 90), x('Seated leg curl', 3, '10–15', 90), x('Standing calf raise', 3, '10–15', 90), x('Cable crunch', 2, '10–15', 60)],
  push: [x('Barbell bench press', 3, '6–10', 180), x('Seated dumbbell shoulder press', 2, '8–12', 150), x('Cable fly', 2, '12–15', 90), x('Cable lateral raise', 4, '12–20', 60), x('Overhead cable triceps extension', 3, '10–15', 90)],
  pull: [x('Weighted pull-up', 3, '6–10', 180), x('Chest-supported row', 3, '8–12', 150), x('Cable pullover', 2, '12–15', 90), x('Reverse pec deck', 3, '12–20', 60), x('Incline dumbbell curl', 2, '10–15', 90), x('Hammer curl', 2, '10–15', 90)],
  legs: [x('Trap-bar deadlift', 3, '5–8', 180), x('Bulgarian split squat', 3, '8–12', 120), x('Lying leg curl', 3, '10–15', 90), x('Leg press', 2, '10–15', 120), x('Seated calf raise', 3, '12–20', 60), x('Hanging leg raise', 2, '10–15', 60)],
};

export const TIPS = {
  'hack squat': 'Long femurs turn barbell squats into a hip movement. The hack squat keeps the tension on your quads.',
  'trap-bar deadlift': 'Easier on long-limbed lifters than the conventional deadlift.',
  'seated leg curl': 'Grew hamstrings more than lying curls in a direct comparison: bending at the hip stretches them.',
  'overhead cable triceps extension': 'The overhead position stretches the long head. It grew triceps more than pushdowns in a direct comparison.',
  'incline dumbbell curl': 'With the arm behind your body, the biceps work in a stretch.',
  'cable lateral raise': 'Side delts make a tall frame look wide. Train them hard and often.',
  'weighted pull-up': 'Long arms give a huge range of motion. Start each rep from a full dead hang.',
  'chest-supported row': 'The chest pad takes your lower back out of it, which helps on a long torso.',
};

export const SCIENCE = [
  ['Volume drives growth', 'More weekly hard sets per muscle means more growth, with diminishing returns (Pelland et al. meta-regression, 67 studies). Aim for about 10–20 sets per muscle per week.'],
  ['Frequency is for convenience', 'Once weekly volume is equal, training a muscle more often adds little. Twice a week just spreads the work so every set is high quality.'],
  ['Go close to failure', 'Muscle growth improves as sets get closer to failure (Robinson et al. 2024). Finish most sets 0–3 reps short of failure.'],
  ['Bias the stretch', 'Exercises loaded at long muscle lengths (seated leg curls, overhead triceps, incline curls, deep presses) out-grew their short-length versions in head-to-head trials.'],
  ['Rest long enough', 'Rest 2–3 min on compound lifts and ~90 s on isolation lifts. Longer rests beat 1-minute rests because you keep doing more reps.'],
  ['Progression rule', 'Once every set hits the top of the rep range, add weight. Otherwise, try to beat last time\'s reps.'],
];

/* ---------- Supplements ---------- */
// ctx = { kg, vitd }
export const SUPPS = [
  { id: 'creatine', n: 'Creatine monohydrate', slots: ['am'], dose: () => '5 g', tier: 'A', on: true,
    why: 'The most-studied legal performance supplement. It raises muscle creatine stores by ~20–40%, so you get more reps per set and, over time, more lean mass. It also helps your brain when you\'re short on sleep.',
    how: 'Mix it into any drink. Timing barely matters; taking it every day does. 5 g/day fills your muscles in 3–4 weeks.',
    note: 'Expect 1–3 lb of water weight inside the muscle at first (not fat). It nudges up blood creatinine, so tell your doctor before kidney labs.',
    buy: 'Plain creatine monohydrate (Creapure or third-party tested). Skip HCl and "buffered" versions: they cost more and work no better.' },
  { id: 'vitd', n: 'Vitamin D3', slots: ['am'], tier: 'A*', on: true,
    dose: p => p.vitd == null ? '2,000 IU (get your level tested)' : p.vitd < 30 ? `2,000–4,000 IU · your level ${p.vitd} is low, retest in 8–12 wks` : p.vitd > 60 ? `1,000 IU or pause · your level ${p.vitd} is high` : `2,000 IU · your level ${p.vitd} is good`,
    why: 'Low vitamin D is common when you train indoors or it\'s winter, and low levels are linked to weaker muscles. It helps most when your level is low.',
    how: 'Take with a meal that has some fat. Test your 25-OH vitamin D level and aim for about 30–50 ng/mL. When you log the result in Labs, this dose updates automatically.',
    note: '*Strong evidence if your level is low, moderate otherwise. Stay at or under 4,000 IU/day long-term unless bloodwork says otherwise.', buy: 'D3 softgel or drops, USP Verified.' },
  { id: 'omega3', n: 'Fish oil (EPA + DHA)', slots: ['am', 'pm'], dose: () => '1 g EPA+DHA', tier: 'B', on: true,
    why: 'Most people who don\'t eat fatty fish fall short. It supports heart health and may reduce soreness. Direct muscle-gain effects are small.',
    how: 'Split it between breakfast and dinner (2 g total), with food. Count the EPA+DHA on the label, not the total fish oil.',
    note: 'If you eat salmon 2–3 times a week, the morning dose is optional. Ask your doctor first if you take blood thinners.', buy: 'IFOS-certified fish oil.' },
  { id: 'multi', n: 'Multivitamin', slots: ['am'], dose: () => '1 serving', tier: 'C', on: false,
    why: 'Insurance for a narrow diet. Not a muscle builder.', how: 'With breakfast.', note: 'Skip it if you eat a wide variety of foods.', buy: 'USP Verified basic multi.' },
  { id: 'caffeine', n: 'Caffeine', slots: ['mid'], dose: p => `${Math.round(p.kg * 3 / 25) * 25} mg (~3 mg/kg)`, tier: 'A', on: true,
    why: 'Reliably boosts strength, power and total work at 3–6 mg/kg. 3 mg/kg gets most of the benefit with fewer jitters.',
    how: '30–60 min before training. One cup of coffee has about 95 mg.',
    note: 'Have your last caffeine 8–10 h before bed. With an 8 PM bedtime, that means none after about 11 AM.', buy: 'Coffee, or 200 mg tablets. Skip proprietary-blend pre-workouts.' },
  { id: 'whey', n: 'Whey protein shake', slots: ['mid'], dose: () => '1 scoop (25–40 g protein)', tier: 'Food', on: true,
    why: 'Not magic. Just the easiest way to hit your protein.', how: 'After training, or any time a meal comes up short on protein.', note: 'Log it in Food too.', buy: 'Third-party tested whey. Skip mass gainers.' },
  { id: 'citrulline', n: 'L-Citrulline', slots: ['mid'], dose: () => '6–8 g', tier: 'C', on: false,
    why: 'Small, inconsistent effects on reps and fatigue.', how: '60 min before training.', note: 'Use pure L-citrulline, not citrulline malate.', buy: 'Unflavored powder.' },
  { id: 'magnesium', n: 'Magnesium glycinate', slots: ['pm'], dose: () => '200–400 mg elemental', tier: 'B', on: true,
    why: 'Many lifters run low, and some is lost in sweat. It fixes a shortfall; the evidence for better sleep is mixed. Glycinate is easy on the gut.',
    how: '30–60 min before bed.', note: 'Check the "elemental magnesium" amount on the label.', buy: 'Magnesium bisglycinate, third-party tested.' },
  { id: 'casein', n: 'Pre-bed protein', slots: ['pm'], dose: () => '~40 g protein', tier: 'B', on: true,
    why: 'About 40 g of slow-digesting protein before sleep boosts overnight muscle building, and it adds calories on a bulk.',
    how: 'A casein shake, Greek yogurt, or cottage cheese. Log it in Food.', note: 'Your total daily protein still matters most.', buy: 'Micellar casein, or real food.' },
  { id: 'glycine', n: 'Glycine', slots: ['pm'], dose: () => '3 g', tier: 'C', on: false,
    why: 'Small trials show better sleep quality at 3 g before bed. Cheap and very safe.', how: 'In water before bed.', note: 'Turn it on if your sleep scores are low.', buy: 'Glycine powder.' },
  { id: 'ashwagandha', n: 'Ashwagandha (KSM-66)', slots: ['pm'], dose: () => '300–600 mg', tier: 'C', on: false,
    why: 'Modest evidence for lower stress and better sleep, plus small strength gains.', how: 'Evening. Cycle 8 weeks on, then 2–4 weeks off.',
    note: 'Rare reports of liver injury. Avoid it if you have a thyroid condition or take sedatives.', buy: 'KSM-66 extract only.' },
];
export const SKIP_LIST = [
  ['BCAAs / EAAs', 'Redundant if you hit your protein.'],
  ['"Test boosters"', 'No meaningful testosterone or muscle gain in trained men.'],
  ['Mass gainers', 'Mostly sugar at a premium. A homemade shake is better.'],
  ['Glutamine', 'No muscle benefit in healthy lifters.'],
  ['Turkesterone', 'No quality human evidence, and products are often mislabeled.'],
  ['Fat burners', "You're bulking. They're also a common source of contamination."],
];
export const SLOTS = { am: 'Morning', mid: 'Pre-workout', pm: 'Night' };

/* ---------- Labs ---------- */
export const LABS = [
  { id: 'vitd', n: '25-OH Vitamin D', u: 'ng/mL', lo: 30, hi: 60, note: 'Keep it around 30–50. Your vitamin D dose in Pills follows this result.' },
  { id: 'tt', n: 'Total testosterone', u: 'ng/dL', lo: 264, hi: 916, note: 'Test at 7–10 AM, fasted.' },
  { id: 'ft', n: 'Free testosterone', u: 'pg/mL', lo: null, hi: null, note: 'Ranges vary by lab. Use the range on your report.' },
  { id: 'ferritin', n: 'Ferritin', u: 'ng/mL', lo: 30, hi: 300 },
  { id: 'hgb', n: 'Hemoglobin', u: 'g/dL', lo: 13.5, hi: 17.5 },
  { id: 'glu', n: 'Fasting glucose', u: 'mg/dL', lo: 70, hi: 99 },
  { id: 'a1c', n: 'HbA1c', u: '%', lo: 4, hi: 5.6 },
  { id: 'ldl', n: 'LDL-C', u: 'mg/dL', lo: null, hi: 99 },
  { id: 'hdl', n: 'HDL-C', u: 'mg/dL', lo: 40, hi: null },
  { id: 'tg', n: 'Triglycerides', u: 'mg/dL', lo: null, hi: 149 },
  { id: 'apob', n: 'ApoB', u: 'mg/dL', lo: null, hi: 89 },
  { id: 'alt', n: 'ALT', u: 'U/L', lo: null, hi: 44, note: 'Hard lifting raises it for days. Test after 48–72 h with no training.' },
  { id: 'ast', n: 'AST', u: 'U/L', lo: null, hi: 40, note: 'Lifting raises it temporarily.' },
  { id: 'creat', n: 'Creatinine', u: 'mg/dL', lo: 0.7, hi: 1.3, note: 'Creatine and a lot of muscle raise it without kidney harm. If it\'s flagged, ask for a cystatin C test.' },
  { id: 'tsh', n: 'TSH', u: 'mIU/L', lo: 0.4, hi: 4.0 },
];

/* ---------- Foods (per serving) ---------- */
export const FOODS = [
  ['chicken', 'Chicken breast, cooked', '6 oz', 280, 53, 0, 6], ['beef90', 'Ground beef 90/10, cooked', '6 oz', 360, 44, 0, 20],
  ['beef80', 'Ground beef 80/20, cooked', '6 oz', 460, 41, 0, 32], ['sirloin', 'Sirloin steak, cooked', '6 oz', 350, 52, 0, 14],
  ['salmon', 'Salmon, cooked', '6 oz', 350, 38, 0, 21], ['tuna', 'Tuna in water', '1 can', 120, 26, 0, 1],
  ['turkey', 'Turkey deli slices', '3 oz', 90, 15, 3, 1.5], ['egg', 'Egg, large', '1 egg', 72, 6.3, 0.4, 4.8],
  ['eggwhite', 'Egg whites', '1 cup', 125, 26, 2, 0.4], ['milk', 'Whole milk', '1 cup', 150, 8, 12, 8],
  ['milk2', '2% milk', '1 cup', 122, 8, 12, 5], ['chocmilk', 'Chocolate milk (whole)', '1 cup', 210, 8, 26, 8],
  ['greek', 'Greek yogurt 2%', '1 cup', 165, 23, 9, 4.5], ['cottage', 'Cottage cheese 2%', '1 cup', 183, 24, 10, 5],
  ['whey', 'Whey protein', '1 scoop', 120, 24, 3, 1.5], ['casein', 'Casein protein', '1 scoop', 120, 24, 3, 1],
  ['cheddar', 'Cheddar cheese', '1 oz', 115, 7, 0.4, 9.5], ['oats', 'Oats, dry', '1 cup (80 g)', 303, 10.5, 54, 5.4],
  ['rice', 'White rice, cooked', '1 cup', 205, 4.3, 45, 0.4], ['pasta', 'Pasta, dry', '2 oz', 200, 7, 42, 1],
  ['potato', 'Potato, baked', '1 medium', 160, 4.3, 37, 0.2], ['sweetpot', 'Sweet potato', '1 medium', 103, 2.3, 24, 0.2],
  ['bagel', 'Bagel, plain', '1 bagel', 280, 11, 55, 1.5], ['bread', 'Whole wheat bread', '1 slice', 80, 4, 14, 1],
  ['tortilla', 'Flour tortilla, large', '1', 210, 6, 35, 5], ['cereal', 'Cereal', '1 cup', 140, 3, 29, 2],
  ['granola', 'Granola', '½ cup', 280, 6, 40, 11], ['ricecake', 'Rice cakes', '2 cakes', 70, 1.5, 15, 0.5],
  ['beans', 'Black beans', '1 cup', 227, 15, 41, 0.9], ['banana', 'Banana', '1 medium', 105, 1.3, 27, 0.4],
  ['apple', 'Apple', '1 medium', 95, 0.5, 25, 0.3], ['blueberry', 'Blueberries', '1 cup', 85, 1.1, 21, 0.5],
  ['oj', 'Orange juice', '1 cup', 112, 1.7, 26, 0.5], ['dates', 'Medjool dates', '2', 133, 0.9, 36, 0.1],
  ['honey', 'Honey', '1 tbsp', 64, 0, 17, 0], ['almonds', 'Almonds', '1 oz', 164, 6, 6, 14],
  ['olive', 'Olive oil', '1 tbsp', 119, 0, 0, 13.5], ['butter', 'Butter', '1 tbsp', 102, 0.1, 0, 11.5],
  ['avocado', 'Avocado', '½ fruit', 120, 1.5, 6, 11], ['broccoli', 'Broccoli', '1 cup', 31, 2.5, 6, 0.3],
  ['sunbutter', 'Sunflower seed butter (peanut-free)', '2 tbsp', 200, 7, 7, 17],
  ['massshake', 'Mass shake (peanut-free)', '1 shake', 1148, 83, 118, 42],
].map(([id, n, sv, kcal, p, c, f]) => ({ id, n, sv, kcal, p, c, f }));
export const MASS_SHAKE_NOTE = '2 cups whole milk · 2 scoops whey · 1 cup oats · 1 banana · 2 tbsp sunflower seed butter (peanut-free). Blend.';

export const MEAL_SLOTS = [['b', 'Breakfast'], ['pre', 'Pre-workout'], ['post', 'Post-workout'], ['l', 'Lunch'], ['d', 'Dinner'], ['s', 'Snacks & pre-bed']];
export const TAG_TO_SLOT = { 'Breakfast': 'b', 'Pre-gym': 'pre', 'Post-gym': 'post', 'Lunch': 'l', 'Dinner': 'd' };

export const SAMPLE_DAY = [
  { meal: 'pre', items: [['ricecake', 1], ['banana', 1]] },
  { meal: 'post', items: [['egg', 4], ['bagel', 1], ['milk', 1]] },
  { meal: 'b', items: [['oats', 1], ['greek', 1], ['blueberry', 1], ['honey', 1], ['whey', 1]] },
  { meal: 'l', items: [['beef90', 1], ['rice', 2], ['broccoli', 1]] },
  { meal: 'd', items: [['chicken', 1], ['potato', 1], ['butter', 1], ['avocado', 1]] },
  { meal: 's', items: [['cottage', 1], ['honey', 1], ['almonds', 1]] },
];

/* ---------- News ---------- */
export const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
export const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
const RCT = '(randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt])';
export const PUBMED_QUERIES = [
  { cat: 'training', q: `(resistance training[tiab] OR strength training[tiab]) AND (hypertrophy[tiab] OR muscle mass[tiab] OR lean mass[tiab]) AND ${RCT}` },
  { cat: 'nutrition', q: `(protein intake[tiab] OR protein supplementation[tiab] OR energy surplus[tiab] OR caloric surplus[tiab]) AND (muscle[tiab] OR lean mass[tiab]) AND ${RCT}` },
  { cat: 'supplements', q: `(creatine[tiab] OR caffeine[tiab] OR omega-3[tiab] OR vitamin D[tiab] OR ashwagandha[tiab] OR magnesium[tiab]) AND (resistance training[tiab] OR muscle[tiab] OR strength[tiab]) AND ${RCT}` },
  { cat: 'sleep', q: `sleep[tiab] AND (athletes[tiab] OR resistance training[tiab] OR muscle recovery[tiab]) AND ${RCT}` },
];
export const FEEDS = [
  { name: 'Stronger By Science', url: 'https://www.strongerbyscience.com/feed/', cat: 'training' },
  { name: 'ScienceDaily · Fitness', url: 'https://www.sciencedaily.com/rss/health_medicine/fitness.xml', cat: 'training' },
  { name: 'ScienceDaily · Nutrition', url: 'https://www.sciencedaily.com/rss/health_medicine/nutrition.xml', cat: 'nutrition' },
  { name: 'ScienceDaily · Sleep', url: 'https://www.sciencedaily.com/rss/mind_brain/sleep_disorders.xml', cat: 'sleep' },
];
