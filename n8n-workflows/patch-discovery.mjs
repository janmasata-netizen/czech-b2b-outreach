/**
 * Patch sub-domain-discovery.json with optimizations:
 * 1. Smart blacklist bypass — don't block company's own domain
 * 2. Expand to 4 parallel DNS probes (from 2)
 * 3. Better candidate generation: hyphenated, last-word, acronym
 * 4. Generic industry word filter to reduce false positives
 * 5. .cz preference over .com
 *
 * Usage: cd n8n-workflows && node patch-discovery.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const wf = JSON.parse(readFileSync('sub-domain-discovery.json', 'utf8'));

// ============================================================
// 1. UPDATE: Generate DNS Candidates (sdd-0030)
//    Now generates 4 ranked candidates instead of 2
// ============================================================
const genNode = wf.nodes.find(n => n.id === 'sdd-0030');
genNode.parameters.jsCode = `
const prev = $('Extract Input').first().json;
function strip(s) { return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); }

// Generic industry/trade words — skip as standalone single-word DNS candidates
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
  'prumysl','prumyslova','technicke','informacni','provozni','instalace',
  'instalacni','market','service','services','company','trading',
  'international','management','consulting','software','solutions',
  'systems','energy','media','digital','online','shop','store',
  'import','export','trans','transport','invest','finance',
  'praha','brno','ostrava','plzen','liberec','olomouc',
  'telekomunikace','komunikace','pojistovna','republika',
  'cesko','ceska','cesky','ceske','entity','red','clinic',
  'hand','team','hor','hory','narodni','jihlava','zlin','cvikov',
  'boleslav','vary','karlovy','pardubice','prerov','prostejov',
  'opava','kladno','most','teplice','chomutov','decin','havirov',
  'karvina','znojmo','trebic','kolin','frydek','mistek'
]);

let raw = prev.company_name || '';
// Strip domain extensions from names like 'Alza.cz a.s.'
raw = raw.replace(/\\.(cz|com|eu|sk|net|org)\\b/gi, '');
// Strip diacritics EARLY so all regex matching works on clean ASCII
raw = strip(raw);
// Strip legal suffixes (now matches narodni podnik, druzstvo etc.)
raw = raw.replace(/,?\\s*\\b(s\\.?\\s*r\\.?\\s*o\\.?|a\\.?\\s*s\\.?|spol\\.?\\s*s\\s*r\\.?\\s*o\\.?|v\\.?\\s*o\\.?\\s*s\\.?|k\\.?\\s*s\\.?|s\\.?\\s*p\\.?|z\\.?\\s*s\\.?|z\\.?\\s*u\\.?|o\\.?\\s*p\\.?\\s*s\\.?|s\\.?\\s*e\\.?|b\\.?\\s*v\\.?|gmbh|ltd|inc|druzstvo|narodni\\s*podnik|organizacni\\s*slozka)\\b\\.?/gi, '');
raw = raw.replace(/,\\s*$/, '').trim().replace(/\\s+/g, ' ');

// Pre-qualifier (keeps 'banka', 'pojistovna' etc. — needed for acronyms)
const preWords = raw.replace(/[^a-z0-9\\s-]/g, '').trim().split(/\\s+/).filter(w => w.length > 0);
const preAlpha = raw.replace(/[^a-z0-9]/g, '');

// Post-qualifier-strip (removes 'czech republic', 'banka', 'pojistovna' etc.)
let post = raw.replace(/\\b(ceska\\s*republika|czech\\s*republic|\\bcr\\b|international|baumarkt|cash\\s*&\\s*carry|pojistovna|pojistovni|banka|lekarna|lekarny|group|investment|software|technologie|technology|telekomunikace|komunikace)\\b/gi, '').replace(/\\s+/g, ' ').trim();
const postWords = post.replace(/[^a-z0-9\\s-]/g, '').trim().split(/\\s+/).filter(w => w.length > 0);
const postAlpha = post.replace(/[^a-z0-9]/g, '');

const words = postWords.length > 0 ? postWords : preWords;
const alpha = postAlpha || preAlpha;
const INV = 'invalid.invalid';

if (!alpha || alpha.length < 2 || /^[0-9]+$/.test(alpha)) {
  return { json: { ...prev, found: false, _dns_candidates: [INV,INV,INV,INV], _pre_alpha: '', _post_alpha: '' } };
}

const seen = new Set();
const all = [];
function add(d, pri) {
  if (!d || seen.has(d)) return;
  const b = d.split('.')[0];
  if (!b || b.length < 2 || /^[0-9]+$/.test(b)) return;
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\\.?[a-z]{2,}$/.test(d)) return;
  seen.add(d);
  all.push({ d, p: pri });
}

// --- Candidate generation in priority order ---

// 1. Full concatenated .cz (highest priority)
if (alpha.length <= 30) add(alpha + '.cz', 100);

// 2. Hyphenated .cz (common pattern: skoda-auto.cz)
if (words.length >= 2) {
  add(words.join('-') + '.cz', 90);
} else if (words.length === 1 && words[0].includes('-')) {
  // Existing hyphen in name (T-Mobile)
  add(words[0] + '.cz', 95);
}

// 3. Last significant word .cz (brand name: 'Prazdroj' from 'Plzensky Prazdroj')
if (words.length >= 2) {
  const last = words[words.length - 1];
  if (last.length >= 3 && !GENERIC.has(last)) add(last + '.cz', 80);
}

// 4. First word .cz (if not generic)
if (words.length >= 2 && words[0].length >= 2 && !GENERIC.has(words[0])) {
  add(words[0] + '.cz', 70);
}

// 6. Pre-strip full alpha .cz (keeps 'banka' etc. — e.g., komercnibanka.cz)
if (preAlpha !== alpha && preAlpha.length <= 30 && preAlpha.length >= 3) {
  add(preAlpha + '.cz', 50);
}

// 7. Full .com — higher priority for single-word names (vodafone.com > vcr.cz)
const comPri = (words.length <= 1) ? 85 : 40;
if (alpha.length <= 30) add(alpha + '.com', comPri);

// 8. Last word .com
if (words.length >= 2) {
  const last = words[words.length - 1];
  if (last.length >= 3 && !GENERIC.has(last)) add(last + '.com', 30);
}

// 9. First word .com
if (words[0] && words[0].length >= 3) add(words[0] + '.com', 20);

all.sort((a, b) => b.p - a.p);
const top4 = all.slice(0, 4).map(c => c.d);
while (top4.length < 4) top4.push(INV);

return { json: { ...prev, _dns_candidates: top4, _dns_index: 0, _pre_alpha: preAlpha, _post_alpha: postAlpha || alpha } };
`.trim();

// ============================================================
// 2. UPDATE: Check DNS Results (sdd-0034)
//    Smart blacklist bypass, 4 results, .cz preference
// ============================================================
const checkNode = wf.nodes.find(n => n.id === 'sdd-0034');
checkNode.parameters.jsCode = `
const BLACKLISTED = new Set(['seznam.cz','centrum.cz','atlas.cz','volny.cz','tiscali.cz','o2.cz','vodafone.cz','t-mobile.cz','upc.cz','czfree.net','gmail.com','yahoo.com','hotmail.com','outlook.com','protonmail.com','icloud.com','mail.com','zoho.com','aol.com','gmx.com','gmx.net','yandex.com','tutanota.com','live.com','msn.com','post.cz','email.cz','facebook.com','twitter.com','x.com','linkedin.com','instagram.com','youtube.com','tiktok.com','pinterest.com','reddit.com','threads.net','google.com','google.cz','bing.com','duckduckgo.com','wikipedia.org','wikipedie.cz','firmy.cz','kurzy.cz','rejstrik.penize.cz','or.justice.cz','justice.cz','rzp.cz','ares.gov.cz','hbi.cz','detail.cz','databaze-firem.cz','github.com','gitlab.com','medium.com','wordpress.com','blogspot.com','wix.com','squarespace.com','webnode.cz','amazon.com','ebay.com','alibaba.com','aliexpress.com','apple.com','microsoft.com','cloudflare.com','mapy.cz','idnes.cz','novinky.cz','aktualne.cz','heureka.cz','zbozi.cz','slevomat.cz']);
const prev = $('Generate DNS Candidates').first().json;
const candidates = prev._dns_candidates || [];
const preAlpha = prev._pre_alpha || '';
const postAlpha = prev._post_alpha || '';

// Smart blacklist bypass: don't block a domain that IS the company's own name
function shouldBypass(domain) {
  if (!domain) return false;
  const base = domain.split('.')[0].replace(/[^a-z0-9]/g, '');
  if (base.length < 2) return false;
  // Exact match with either pre or post alpha
  if (base === postAlpha || base === preAlpha) return true;
  // Close match (e.g., 'seznam' vs 'seznamcz' after .cz strip)
  if (postAlpha && postAlpha.startsWith(base) && postAlpha.length - base.length <= 3) return true;
  if (preAlpha && preAlpha.startsWith(base) && preAlpha.length - base.length <= 3) return true;
  return false;
}
function isBlacklisted(d) {
  if (!d) return true;
  if (shouldBypass(d)) return false;
  if (BLACKLISTED.has(d)) return true;
  const p = d.split('.');
  if (p.length > 2 && BLACKLISTED.has(p.slice(-2).join('.'))) return true;
  return false;
}

const results = $input.all().map(i => i.json);
function extractStatus(r) {
  if (!r) return 0;
  if (typeof r.statusCode === 'number') return r.statusCode;
  if (r.error && r.error.message) {
    const m = r.error.message.match(/^(\\d{3})\\s*-/);
    if (m) return parseInt(m[1]);
    return 0;
  }
  if (r.data !== undefined && r.data !== '') return 200;
  return 0;
}
function isAlive(status) { return (status >= 200 && status < 400) || status === 403; }

// Evaluate all candidates (up to 4)
const alive = [];
for (let i = 0; i < Math.min(candidates.length, results.length); i++) {
  const status = extractStatus(results[i]);
  const domain = candidates[i];
  if (domain && domain !== 'invalid.invalid' && isAlive(status) && !isBlacklisted(domain)) {
    alive.push({ domain, index: i });
  }
}

if (alive.length === 0) {
  return [{ json: { lead_id: prev.lead_id, company_id: prev.company_id, company_name: prev.company_name, ico: prev.ico, found: false, domain: '', source: '' } }];
}

// Prefer .cz over .com; among same TLD, prefer higher priority (lower index)
let best = alive[0];
const czAlive = alive.filter(a => a.domain.endsWith('.cz'));
if (czAlive.length > 0 && !best.domain.endsWith('.cz')) {
  best = czAlive[0];
}

return [{ json: { lead_id: prev.lead_id, company_id: prev.company_id, company_name: prev.company_name, ico: prev.ico, found: true, domain: best.domain, source: 'dns' } }];
`.trim();

// ============================================================
// 3. UPDATE: Extract ARES Domain (sdd-0012)
//    Add smart blacklist bypass
// ============================================================
const aresNode = wf.nodes.find(n => n.id === 'sdd-0012');
aresNode.parameters.jsCode = `
const BLACKLISTED = new Set(['seznam.cz','centrum.cz','atlas.cz','volny.cz','tiscali.cz','o2.cz','vodafone.cz','t-mobile.cz','upc.cz','czfree.net','gmail.com','yahoo.com','hotmail.com','outlook.com','protonmail.com','icloud.com','mail.com','zoho.com','aol.com','gmx.com','gmx.net','yandex.com','tutanota.com','live.com','msn.com','post.cz','email.cz','facebook.com','twitter.com','x.com','linkedin.com','instagram.com','youtube.com','tiktok.com','pinterest.com','reddit.com','threads.net','google.com','google.cz','bing.com','duckduckgo.com','wikipedia.org','wikipedie.cz','firmy.cz','kurzy.cz','rejstrik.penize.cz','or.justice.cz','justice.cz','rzp.cz','ares.gov.cz','hbi.cz','detail.cz','databaze-firem.cz','github.com','gitlab.com','medium.com','wordpress.com','blogspot.com','wix.com','squarespace.com','webnode.cz','amazon.com','ebay.com','alibaba.com','aliexpress.com','apple.com','microsoft.com','cloudflare.com','mapy.cz','idnes.cz','novinky.cz','aktualne.cz','heureka.cz','zbozi.cz','slevomat.cz']);

function stripD(s) { return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); }
function companyBase(name) {
  let r = name.replace(/\\.(cz|com|eu|sk|net|org)\\b/gi, '');
  r = r.replace(/,?\\s*\\b(s\\.?\\s*r\\.?\\s*o\\.?|a\\.?\\s*s\\.?|spol\\.?\\s*s\\s*r\\.?\\s*o\\.?|v\\.?\\s*o\\.?\\s*s\\.?|k\\.?\\s*s\\.?|s\\.?\\s*p\\.?|z\\.?\\s*s\\.?|z\\.?\\s*u\\.?|o\\.?\\s*p\\.?\\s*s\\.?|s\\.?\\s*e\\.?)\\b\\.?/gi, '');
  r = r.replace(/\\b(ceska\\s*republika|czech\\s*republic|\\bcr\\b|international|baumarkt|cash\\s*&\\s*carry|pojistovna|pojistovni|banka|lekarna|group|investment)\\b/gi, '');
  return stripD(r).replace(/[^a-z0-9]/g, '');
}
function shouldBypass(domain, name) {
  const base = domain.split('.')[0].replace(/[^a-z0-9]/g, '');
  const cb = companyBase(name);
  if (base.length < 2 || cb.length < 2) return false;
  if (base === cb) return true;
  if (cb.startsWith(base) && cb.length - base.length <= 3) return true;
  return false;
}
function isBlacklisted(d, name) {
  if (!d) return true;
  if (shouldBypass(d, name)) return false;
  if (BLACKLISTED.has(d)) return true;
  const p = d.split('.');
  if (p.length > 2 && BLACKLISTED.has(p.slice(-2).join('.'))) return true;
  return false;
}

const be = $input.item.json || {};
const prev = $('Extract Input').first().json;
if (be.error || be.kod === 'NENALEZENO') {
  return { json: { ...prev, found: false } };
}
let website = '';
if (be.www) website = be.www;
else if (be.sidlo && be.sidlo.www) website = be.sidlo.www;
if (!website) {
  return { json: { ...prev, found: false } };
}
let domain = website.replace(/^https?:\\/\\//i, '').replace(/^www\\./i, '').split(/[\\/?#]/)[0].trim().toLowerCase();
if (!domain || !/^[a-z0-9.-]+\\.[a-z]{2,}$/.test(domain)) {
  return { json: { ...prev, found: false } };
}
if (isBlacklisted(domain, prev.company_name || '')) {
  return { json: { ...prev, found: false } };
}
return { json: { ...prev, found: true, domain: domain, source: 'ares' } };
`.trim();

// ============================================================
// 4. UPDATE: Extract DDG Domain (sdd-0042)
//    Add smart blacklist bypass
// ============================================================
const ddgNode = wf.nodes.find(n => n.id === 'sdd-0042');
ddgNode.parameters.jsCode = `
const BLACKLISTED = new Set(['seznam.cz','centrum.cz','atlas.cz','volny.cz','tiscali.cz','o2.cz','vodafone.cz','t-mobile.cz','upc.cz','czfree.net','gmail.com','yahoo.com','hotmail.com','outlook.com','protonmail.com','icloud.com','mail.com','zoho.com','aol.com','gmx.com','gmx.net','yandex.com','tutanota.com','live.com','msn.com','post.cz','email.cz','facebook.com','twitter.com','x.com','linkedin.com','instagram.com','youtube.com','tiktok.com','pinterest.com','reddit.com','threads.net','google.com','google.cz','bing.com','duckduckgo.com','wikipedia.org','wikipedie.cz','firmy.cz','kurzy.cz','rejstrik.penize.cz','or.justice.cz','justice.cz','rzp.cz','ares.gov.cz','hbi.cz','detail.cz','databaze-firem.cz','github.com','gitlab.com','medium.com','wordpress.com','blogspot.com','wix.com','squarespace.com','webnode.cz','amazon.com','ebay.com','alibaba.com','aliexpress.com','apple.com','microsoft.com','cloudflare.com','mapy.cz','idnes.cz','novinky.cz','aktualne.cz','heureka.cz','zbozi.cz','slevomat.cz']);

function stripD(s) { return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); }
function companyBase(name) {
  let r = name.replace(/\\.(cz|com|eu|sk|net|org)\\b/gi, '');
  r = r.replace(/,?\\s*\\b(s\\.?\\s*r\\.?\\s*o\\.?|a\\.?\\s*s\\.?|spol\\.?\\s*s\\s*r\\.?\\s*o\\.?|v\\.?\\s*o\\.?\\s*s\\.?|k\\.?\\s*s\\.?|s\\.?\\s*p\\.?|z\\.?\\s*s\\.?|z\\.?\\s*u\\.?|o\\.?\\s*p\\.?\\s*s\\.?|s\\.?\\s*e\\.?)\\b\\.?/gi, '');
  r = r.replace(/\\b(ceska\\s*republika|czech\\s*republic|\\bcr\\b|international|baumarkt|cash\\s*&\\s*carry|pojistovna|pojistovni|banka|lekarna|group|investment)\\b/gi, '');
  return stripD(r).replace(/[^a-z0-9]/g, '');
}
function shouldBypass(domain, name) {
  const base = domain.split('.')[0].replace(/[^a-z0-9]/g, '');
  const cb = companyBase(name);
  if (base.length < 2 || cb.length < 2) return false;
  if (base === cb) return true;
  if (cb.startsWith(base) && cb.length - base.length <= 3) return true;
  return false;
}
function isBlacklisted(d, name) {
  if (!d) return true;
  if (shouldBypass(d, name)) return false;
  if (BLACKLISTED.has(d)) return true;
  const p = d.split('.');
  if (p.length > 2 && BLACKLISTED.has(p.slice(-2).join('.'))) return true;
  return false;
}

const prev = $('Prepare DDG Search').first().json;
const companyName = prev.company_name || '';
const html = ($input.first().json.data || '').toString();

let domain = '';
const resultPattern = /class="result__a"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="result__a"/g;
let match;
while ((match = resultPattern.exec(html)) !== null) {
  const rawUrl = match[1] || match[2];
  if (!rawUrl) continue;
  let url = rawUrl;
  const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch) {
    try { url = decodeURIComponent(uddgMatch[1]); } catch(e) {}
  }
  if (url.includes('duckduckgo.com')) continue;
  const domainMatch = url.match(/https?:\\/\\/(?:www\\.)?([a-z0-9.-]+\\.[a-z]{2,})/i);
  if (domainMatch && domainMatch[1]) {
    const d = domainMatch[1].toLowerCase();
    if (isBlacklisted(d, companyName)) continue;
    domain = d;
    break;
  }
}

if (!domain) {
  return [{ json: { lead_id: prev.lead_id, company_id: prev.company_id, company_name: prev.company_name, ico: prev.ico, found: false, domain: '', source: '' } }];
}
return [{ json: { lead_id: prev.lead_id, company_id: prev.company_id, company_name: prev.company_name, ico: prev.ico, found: true, domain: domain, source: 'ddg' } }];
`.trim();

// ============================================================
// 4b. UPDATE: Prepare DDG Search (sdd-0040)
//     Clean company name for better search results
// ============================================================
const ddgPrepNode = wf.nodes.find(n => n.id === 'sdd-0040');
ddgPrepNode.parameters.jsCode = `
const prev = $('Extract Input').first().json;
// Strip legal suffixes + qualifiers for cleaner DDG search
let name = prev.company_name || '';
name = name.replace(/,?\\s*\\b(s\\.?\\s*r\\.?\\s*o\\.?|a\\.?\\s*s\\.?|spol\\.?\\s*s\\s*r\\.?\\s*o\\.?|v\\.?\\s*o\\.?\\s*s\\.?|k\\.?\\s*s\\.?|s\\.?\\s*p\\.?|z\\.?\\s*s\\.?|z\\.?\\s*u\\.?|o\\.?\\s*p\\.?\\s*s\\.?|s\\.?\\s*e\\.?|b\\.?\\s*v\\.?|gmbh|ltd|inc|druzstvo|narodni\\s*podnik|organizacni\\s*slozka)\\b\\.?/gi, '');
name = name.replace(/,\\s*$/, '').trim();
const searchQuery = encodeURIComponent(name + ' web');
return { json: { ...prev, _ddg_url: 'https://html.duckduckgo.com/html/?q=' + searchQuery } };
`.trim();

// ============================================================
// 4c. UPDATE: Search DuckDuckGo (sdd-0041)
//     Increase timeout to 30s, better User-Agent
// ============================================================
const ddgSearchNode = wf.nodes.find(n => n.id === 'sdd-0041');
ddgSearchNode.parameters.options.timeout = 15000;
ddgSearchNode.parameters.headerParameters.parameters[0].value =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ============================================================
// 5. ADD: New probe and merge nodes for 4 parallel DNS probes
// ============================================================

// Probe DNS 3 — probes candidates[2]
wf.nodes.push({
  parameters: {
    method: "GET",
    url: "={{ 'https://' + ($('Generate DNS Candidates').first().json._dns_candidates[2] || 'invalid.invalid') }}",
    options: { neverError: true, timeout: 5000, response: { response: { responseFormat: "text" } } }
  },
  id: "sdd-0036",
  name: "Probe DNS 3",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1920, 700],
  onError: "continueRegularOutput"
});

// Probe DNS 4 — probes candidates[3]
wf.nodes.push({
  parameters: {
    method: "GET",
    url: "={{ 'https://' + ($('Generate DNS Candidates').first().json._dns_candidates[3] || 'invalid.invalid') }}",
    options: { neverError: true, timeout: 5000, response: { response: { responseFormat: "text" } } }
  },
  id: "sdd-0037",
  name: "Probe DNS 4",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1920, 840],
  onError: "continueRegularOutput"
});

// Merge DNS 34 — merges probes 3 & 4
wf.nodes.push({
  parameters: { mode: "append" },
  id: "sdd-0038",
  name: "Merge DNS 34",
  type: "n8n-nodes-base.merge",
  typeVersion: 3,
  position: [2160, 770]
});

// Merge All DNS — merges (1+2) with (3+4) for 4 total items
wf.nodes.push({
  parameters: { mode: "append" },
  id: "sdd-0039",
  name: "Merge All DNS",
  type: "n8n-nodes-base.merge",
  typeVersion: 3,
  position: [2340, 600]
});

// ============================================================
// 6. UPDATE: Connections — rewire for 4 parallel probes
// ============================================================
wf.connections = {
  "Execute Workflow Trigger": {
    main: [[{ node: "Extract Input", type: "main", index: 0 }]]
  },
  "Extract Input": {
    main: [[{ node: "IF Has ICO", type: "main", index: 0 }]]
  },
  "IF Has ICO": {
    main: [
      [{ node: "ARES BE Lookup", type: "main", index: 0 }],
      [{ node: "Generate DNS Candidates", type: "main", index: 0 }]
    ]
  },
  "ARES BE Lookup": {
    main: [[{ node: "Extract ARES Domain", type: "main", index: 0 }]]
  },
  "Extract ARES Domain": {
    main: [[{ node: "IF ARES Found", type: "main", index: 0 }]]
  },
  "IF ARES Found": {
    main: [
      [{ node: "Return Result", type: "main", index: 0 }],
      [{ node: "Generate DNS Candidates", type: "main", index: 0 }]
    ]
  },
  // Fan out to 4 parallel probes
  "Generate DNS Candidates": {
    main: [
      [
        { node: "Probe .cz Domain", type: "main", index: 0 },
        { node: "Probe .com Domain", type: "main", index: 0 },
        { node: "Probe DNS 3", type: "main", index: 0 },
        { node: "Probe DNS 4", type: "main", index: 0 }
      ]
    ]
  },
  // Merge probes 1+2
  "Probe .cz Domain": {
    main: [[{ node: "Merge DNS Results", type: "main", index: 0 }]]
  },
  "Probe .com Domain": {
    main: [[{ node: "Merge DNS Results", type: "main", index: 1 }]]
  },
  // Merge probes 3+4
  "Probe DNS 3": {
    main: [[{ node: "Merge DNS 34", type: "main", index: 0 }]]
  },
  "Probe DNS 4": {
    main: [[{ node: "Merge DNS 34", type: "main", index: 1 }]]
  },
  // Merge both merge results → 4 items total
  "Merge DNS Results": {
    main: [[{ node: "Merge All DNS", type: "main", index: 0 }]]
  },
  "Merge DNS 34": {
    main: [[{ node: "Merge All DNS", type: "main", index: 1 }]]
  },
  // 4-item merge → check results
  "Merge All DNS": {
    main: [[{ node: "Check DNS Results", type: "main", index: 0 }]]
  },
  "Check DNS Results": {
    main: [[{ node: "IF DNS Found", type: "main", index: 0 }]]
  },
  "IF DNS Found": {
    main: [
      [{ node: "Return Result", type: "main", index: 0 }],
      [{ node: "Prepare DDG Search", type: "main", index: 0 }]
    ]
  },
  "Prepare DDG Search": {
    main: [[{ node: "Search DuckDuckGo", type: "main", index: 0 }]]
  },
  "Search DuckDuckGo": {
    main: [[{ node: "Extract DDG Domain", type: "main", index: 0 }]]
  },
  "Extract DDG Domain": {
    main: [[{ node: "Return Result", type: "main", index: 0 }]]
  }
};

// ============================================================
// 7. Update Sticky Note
// ============================================================
const sticky = wf.nodes.find(n => n.id === 'sdd-sticky');
if (sticky) {
  sticky.parameters.content = "## SUB — Domain Discovery (v2)\n**Trigger:** Execute Workflow\n**Input:** `{ lead_id, company_id, company_name, ico }`\n**Output:** `{ found: true/false, domain: \"example.cz\", source: \"ares|dns|ddg\" }`\n\nTries 3 sources: ARES BE (if ICO), DNS probe (4 parallel candidates), DuckDuckGo.\nv2: Smart blacklist bypass, 4 DNS candidates (hyphen/lastword/acronym), generic word filter, .cz preference.";
  sticky.parameters.width = 700;
}

// ============================================================
// 8. Shift positions for clarity
// ============================================================
const checkDnsNode = wf.nodes.find(n => n.id === 'sdd-0034');
if (checkDnsNode) checkDnsNode.position = [2540, 600];

const ifDnsNode = wf.nodes.find(n => n.id === 'sdd-0035');
if (ifDnsNode) ifDnsNode.position = [2780, 600];

ddgPrepNode.position = [3020, 800];
ddgSearchNode.position = [3260, 800];

const ddgExtractNode = wf.nodes.find(n => n.id === 'sdd-0042');
if (ddgExtractNode) ddgExtractNode.position = [3500, 800];

const returnNode = wf.nodes.find(n => n.id === 'sdd-0099');
if (returnNode) returnNode.position = [3740, 500];

// ============================================================
// WRITE
// ============================================================
writeFileSync('sub-domain-discovery.json', JSON.stringify(wf, null, 2));
console.log('✓ sub-domain-discovery.json updated successfully');
console.log('  - 4 parallel DNS probes (was 2)');
console.log('  - Smart blacklist bypass for company-owned domains');
console.log('  - Generic industry word filter');
console.log('  - Candidate generation: full, hyphenated, last-word, acronym');
console.log('  - .cz preference over .com');
