/**
 * Test the candidate generation logic offline (no n8n needed).
 * Usage: cd n8n-workflows && node test-candidates.mjs
 */

function strip(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

const GENERIC = new Set([
  'autoservis','auto','auta','malirstvi','lakyrnictvi','cistirna','cistirny',
  'instalaterstvi','zamecnictvi','truhlarstvi','zahradnictvi','calounictvi',
  'cukrarna','autopujcovna','uklidova','uklidovy','tiskarna','opravna',
  'pekarstvi','klempirstvi','stavebni','stavba','stavby','stavebniny',
  'obchod','obchodni','doprava','dopravni','logistika','servis','sluzby',
  'sluzba','technika','technicke','technicky','montaz','montazni','udrzba',
  'elektro','poradenstvi','konzultace','zdravotni','lekarna','ordinace',
  'autocentrum','papirnictvi','pohrebni','firma','podnik','centrum',
  'strojirna','strojirny','nakladni','osobni','vyroba','vyrobni',
  'prumysl','prumyslova','informacni','provozni','instalace',
  'instalacni','market','service','services','company','trading',
  'international','management','consulting','software','solutions',
  'systems','energy','media','digital','online','shop','store',
  'import','export','trans','transport','invest','finance',
  'praha','brno','ostrava','plzen','liberec','olomouc',
  'telekomunikace','komunikace','pojistovna','republika',
  'cesko','ceska','cesky','ceske','entity','red','clinic'
]);

function generateCandidates(companyName) {
  let raw = companyName;
  raw = raw.replace(/\.(cz|com|eu|sk|net|org)\b/gi, '');
  // Strip diacritics EARLY so all regex matching works
  raw = strip(raw);
  // Strip legal suffixes (now matches narodni podnik etc.)
  raw = raw.replace(/,?\s*\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.?\s*s\s*r\.?\s*o\.?|v\.?\s*o\.?\s*s\.?|k\.?\s*s\.?|s\.?\s*p\.?|z\.?\s*s\.?|z\.?\s*u\.?|o\.?\s*p\.?\s*s\.?|s\.?\s*e\.?|druzstvo|narodni\s*podnik|organizacni\s*slozka)\b\.?/gi, '');
  raw = raw.replace(/,\s*$/, '').trim().replace(/\s+/g, ' ');

  const preWords = raw.replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).filter(w => w.length > 0);
  const preAlpha = raw.replace(/[^a-z0-9]/g, '');

  let post = raw.replace(/\b(ceska\s*republika|czech\s*republic|\bcr\b|international|baumarkt|cash\s*&\s*carry|pojistovna|pojistovni|banka|lekarna|lekarny|group|investment|software|technologie|technology|telekomunikace|komunikace)\b/gi, '').replace(/\s+/g, ' ').trim();
  const postWords = post.replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).filter(w => w.length > 0);
  const postAlpha = post.replace(/[^a-z0-9]/g, '');

  const words = postWords.length > 0 ? postWords : preWords;
  const alpha = postAlpha || preAlpha;

  if (!alpha || alpha.length < 2 || /^[0-9]+$/.test(alpha)) {
    return { candidates: ['(none)'], preAlpha, postAlpha };
  }

  const seen = new Set();
  const all = [];
  function add(d, pri) {
    if (!d || seen.has(d)) return;
    const b = d.split('.')[0];
    if (!b || b.length < 2 || /^[0-9]+$/.test(b)) return;
    seen.add(d);
    all.push({ d, p: pri });
  }

  if (alpha.length <= 30) add(alpha + '.cz', 100);
  if (words.length >= 2) { add(words.join('-') + '.cz', 90); }
  else if (words.length === 1 && words[0].includes('-')) { add(words[0] + '.cz', 95); }
  if (words.length >= 2) { const last = words[words.length - 1]; if (last.length >= 3 && !GENERIC.has(last)) add(last + '.cz', 80); }
  if (words.length >= 2 && words[0].length >= 2 && !GENERIC.has(words[0])) { add(words[0] + '.cz', 70); }
  if (preAlpha !== alpha && preAlpha.length <= 30 && preAlpha.length >= 3) { add(preAlpha + '.cz', 50); }
  const comPri = (words.length <= 1) ? 85 : 40;
  if (alpha.length <= 30) add(alpha + '.com', comPri);
  if (words.length >= 2) { const last = words[words.length - 1]; if (last.length >= 3 && !GENERIC.has(last)) add(last + '.com', 30); }
  if (words[0] && words[0].length >= 3) add(words[0] + '.com', 20);
  all.sort((a, b) => b.p - a.p);
  const top4 = all.slice(0, 4).map(c => c.d);
  while (top4.length < 4) top4.push('invalid.invalid');
  return { candidates: top4, all: all.map(c => `${c.d}(${c.p})`), preAlpha, postAlpha: postAlpha || alpha };
}

// Also test smart blacklist bypass
const BLACKLISTED = new Set(['seznam.cz','o2.cz','vodafone.cz','t-mobile.cz','centrum.cz']);
function shouldBypass(domain, preAlpha, postAlpha) {
  const base = domain.split('.')[0].replace(/[^a-z0-9]/g, '');
  if (base.length < 2) return false;
  if (base === postAlpha || base === preAlpha) return true;
  if (postAlpha && postAlpha.startsWith(base) && postAlpha.length - base.length <= 3) return true;
  if (preAlpha && preAlpha.startsWith(base) && preAlpha.length - base.length <= 3) return true;
  return false;
}

const tests = [
  ['Škoda Auto a.s.', 'skoda-auto.cz'],
  ['TV Nova s.r.o.', 'nova.cz'],
  ['Plzeňský Prazdroj, a. s.', 'prazdroj.cz'],
  ['České dráhy, a.s.', 'cd.cz'],
  ['Komerční banka, a.s.', 'kb.cz'],
  ['Vodafone Czech Republic a.s.', 'vodafone.cz'],
  ['T-Mobile Czech Republic a.s.', 't-mobile.cz'],
  ['Seznam.cz, a.s.', 'seznam.cz'],
  ['O2 Czech Republic a.s.', 'o2.cz'],
  ['Stavebniny DEK a.s.', 'dek.cz'],
  ['Autoservis Kolář s.r.o.', '(no autoservis.cz)'],
  ['Malířství a lakýrnictví Kratochvíl s.r.o.', '(no malirstvi.cz)'],
  ['Alza.cz a.s.', 'alza.cz'],
  ['ČSOB, a.s.', 'csob.cz'],
  ['Raiffeisenbank a.s.', 'raiffeisenbank.cz'],
  ['Česká spořitelna, a.s.', 'csas.cz'],
  ['Kooperativa pojišťovna, a.s.', 'kooperativa.cz'],
  ['Dr. Max lékárna s.r.o.', 'drmax.cz'],
  ['Avast Software s.r.o.', 'avast.com'],
  ['Lidl Česká republika s.r.o.', 'lidl.cz'],
  ['2N TELEKOMUNIKACE a.s.', '2n.com'],
  ['Budějovický Budvar, národní podnik', 'budejovickybudvar.cz'],
  ['Penny Market s.r.o.', 'penny.cz'],
  ['Hornbach Baumarkt CS spol. s r.o.', 'hornbach.cz'],
];

console.log('═══ Candidate Generation Test ═══\n');
for (const [name, expected] of tests) {
  const r = generateCandidates(name);
  const inTop4 = r.candidates.some(c => c === expected);
  const mark = inTop4 ? '✓' : (expected.startsWith('(') ? '—' : '✗');
  console.log(`${mark} ${name}`);
  console.log(`  Top 4: ${r.candidates.join(', ')}`);
  console.log(`  All:   ${r.all.join(', ')}`);
  console.log(`  pre=${r.preAlpha} post=${r.postAlpha} exp=${expected}`);

  // Test blacklist bypass for blacklisted domains
  for (const bl of ['seznam.cz','o2.cz','vodafone.cz','t-mobile.cz']) {
    if (r.candidates.includes(bl) || expected === bl) {
      const bypassed = shouldBypass(bl, r.preAlpha, r.postAlpha);
      console.log(`  Blacklist bypass ${bl}: ${bypassed ? 'BYPASS ✓' : 'BLOCKED ✗'}`);
    }
  }
  console.log();
}
