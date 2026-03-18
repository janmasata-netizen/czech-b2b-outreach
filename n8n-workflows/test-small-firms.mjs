/**
 * Test domain discovery with 100 small/unknown Czech firms.
 * Usage: cd n8n-workflows && node test-small-firms.mjs
 */
import http from 'http';
import { VPS_IP, WEBHOOK_SECRET } from './env.mjs';

const FIRMS = [
  { n: "Národní stavební centrum s.r.o.", i: "46965106" },
  { n: "Winning PS - stavební firma s.r.o.", i: "49436589" },
  { n: "JB Stavební, s.r.o.", i: "25581708" },
  { n: "KKS stavebnictví s.r.o.", i: "19198639" },
  { n: "DMG obchodní a stavební s.r.o.", i: "26947501" },
  { n: "WKG Security & IT Communication s.r.o.", i: "29395976" },
  { n: "IT-služby s.r.o.", i: "28521170" },
  { n: "IT Second Hand, s.r.o.", i: "04633156" },
  { n: "A M R SYSTEM s.r.o.", i: "29448832" },
  { n: "Plzeňské instalace s.r.o.", i: "26348748" },
  { n: "STAVBA Plzeň s.r.o.", i: "00029122" },
  { n: "IKO stavby s.r.o.", i: "29120543" },
  { n: "Plzeňská STK, s.r.o.", i: "64360440" },
  { n: "Generator Store s.r.o.", i: "08975353" },
  { n: "Zastavárna Plzeň s.r.o.", i: "29164273" },
  { n: "Spro stavby, obchod, dopravu a služby, s.r.o.", i: "26823411" },
  { n: "Převozová služba DELTA, s.r.o.", i: "25888986" },
  { n: "Moravská doprava s.r.o.", i: "28434838" },
  { n: "OL TRANS CZ, s.r.o.", i: "25879502" },
  { n: "IDS LogiRail s.r.o.", i: "21119597" },
  { n: "ZDRAVÍČKO - zdravá výživa s.r.o.", i: "28797621" },
  { n: "Hradecké delikatesy s.r.o.", i: "02583259" },
  { n: "Hradecká pekárna, s.r.o.", i: "62028413" },
  { n: "IKKO Hradec Králové, s.r.o.", i: "27482782" },
  { n: "P R E G O Hradec Králové s.r.o.", i: "49812963" },
  { n: "Lékárna Zahradní s.r.o.", i: "26066203" },
  { n: "Lékárna u doktora z hor s.r.o.", i: "25935577" },
  { n: "Zdravotnické centrum, s.r.o.", i: "48533653" },
  { n: "MB praktický lékař s.r.o.", i: "02811430" },
  { n: "Lékárna U Zlatého hada Cvikov s.r.o.", i: "09381465" },
  { n: "Liberecké strojírny s.r.o.", i: "49901427" },
  { n: "MSV Liberec, s.r.o.", i: "61328952" },
  { n: "PROFISERVIS Liberec, s.r.o.", i: "27278905" },
  { n: "TZ Energy s.r.o.", i: "06828418" },
  { n: "SOVA Liberec, s.r.o.", i: "47782498" },
  { n: "ACS poradenství s.r.o.", i: "21304891" },
  { n: "XY Group CZ s.r.o.", i: "09588744" },
  { n: "Technické služby Zlín, s.r.o.", i: "60711086" },
  { n: "Poradenství CZ s.r.o.", i: "27514030" },
  { n: "Konzultace ISO John s.r.o.", i: "07494700" },
  { n: "MOUSE ELECTRIC CZ s.r.o.", i: "27534367" },
  { n: "R.D.Engineering s.r.o.", i: "60109581" },
  { n: "Instal Hanousek s.r.o.", i: "06671918" },
  { n: "K E S - ing s.r.o. Pardubice", i: "64788504" },
  { n: "EKO Pardubice s.r.o.", i: "27491218" },
  { n: "KOOPERATIVA - ZN s.r.o.", i: "01908995" },
  { n: "Stavební firma Stavospol Znojmo s.r.o.", i: "27755541" },
  { n: "INSTALO JIHLAVA, spol. s r.o.", i: "26243326" },
  { n: "C O R H A Jihlava, s.r.o.", i: "49966324" },
  { n: "Prima CZ s.r.o.", i: "25047400" },
  { n: "POČÍTAČE ÚSTÍ NAD LABEM s.r.o.", i: "09772812" },
  { n: "TAG Ústí nad Labem s.r.o.", i: "48265985" },
  { n: "SD Karlovy Vary s.r.o.", i: "09688684" },
  { n: "con.Formatio s.r.o.", i: "28139771" },
  { n: "DAŇOVÝ PORADCE Karlovy Vary s.r.o.", i: "08885711" },
  { n: "Integrity clinic s.r.o.", i: "23474670" },
  { n: "EKOMOR, s.r.o.", i: "48397571" },
  { n: "Technomont Frýdek-Místek s.r.o.", i: "48396133" },
  { n: "Profiprojekt s.r.o.", i: "27779319" },
  { n: "SH Profil, s.r.o.", i: "25904337" },
  { n: "Holzhall s.r.o.", i: "19268238" },
  { n: "KL - servis s.r.o.", i: "25738577" },
  { n: "NOKO Servis s.r.o.", i: "29131057" },
  { n: "International Metal Service ČR s.r.o.", i: "25068903" },
  { n: "Teplárna Kladno s.r.o.", i: "26735865" },
  { n: "MVB OPAVA CZ s.r.o.", i: "25867326" },
  { n: "SDU servis s.r.o.", i: "25838199" },
  { n: "System Servis s.r.o.", i: "25356496" },
  { n: "SV servisní, s.r.o.", i: "60725974" },
  { n: "IPARS, stavební firma, s.r.o.", i: "25471261" },
  { n: "JKNstavby s.r.o.", i: "28745400" },
  { n: "IET-STAVBY s.r.o.", i: "27300005" },
  { n: "V A R I A s.r.o.", i: "46712143" },
  { n: "STAVBY SEHO s.r.o.", i: "28699921" },
  { n: "R+Z instalatérství s.r.o.", i: "17371953" },
  { n: "DAGI Doprava a logistika s.r.o.", i: "17156807" },
  { n: "SV výrobní, s.r.o.", i: "25545531" },
  { n: "Strojírenská společnost - STS, s.r.o.", i: "25568051" },
  { n: "SEZAKO PŘEROV s.r.o.", i: "25358022" },
  { n: "MFP papírnictví s.r.o.", i: "62300491" },
  { n: "Autocentrum Přerov CZ s.r.o.", i: "25594273" },
  { n: "IM SERVIS, s.r.o.", i: "27749517" },
  { n: "AMD Byt servis s.r.o.", i: "11926635" },
  { n: "Service estate team s.r.o.", i: "17580102" },
  { n: "FCC Prostějov, s.r.o.", i: "26224178" },
  { n: "RIANO Europe, s.r.o.", i: "02484790" },
  { n: "DK Services - nákladní doprava a montáž nábytku s.r.o.", i: "17874483" },
  { n: "SWIETELSKY Rail CZ s.r.o.", i: "28332202" },
  { n: "Boleslavská lékárna s.r.o.", i: "03322769" },
  { n: "Alergologická a imunologická ordinace Mladá Boleslav s.r.o.", i: "29415977" },
  { n: "D - I M P O R T s.r.o.", i: "47536616" },
  { n: "ZÁVODNÝ-MONTÁŽ-ÚDRŽBA-ELEKTRO s.r.o.", i: "25220853" },
  { n: "S U M O s.r.o.", i: "25257684" },
  { n: "Dopravní podnik Mladá Boleslav, s.r.o.", i: "25137280" },
  { n: "Doktor Nováček s.r.o.", i: "22447130" },
  { n: "ARRIBA ZASTAVÁRNA s.r.o.", i: "05839378" },
  { n: "ZAM - SERVIS s.r.o.", i: "60775866" },
  { n: "RANA Hradec Králové spol. s r.o.", i: "42197210" },
  { n: "AXIS - CZ Hradec Králové, s.r.o.", i: "25275445" },
  { n: "GASTROCENTRUM KARLOVY VARY s.r.o.", i: "26330334" },
];

function test(firm) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ company_name: firm.n, ico: firm.i });
    const timeout = setTimeout(() => resolve({ found: false, error: 'TIMEOUT' }), 90000);
    const req = http.request({
      hostname: VPS_IP, port: 32770, path: '/webhook/wf-domain-discovery-test', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Webhook-Secret': WEBHOOK_SECRET },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(timeout);
        try { const r = JSON.parse(d); resolve(r); }
        catch { resolve({ found: false, error: 'PARSE: ' + d.slice(0, 50) }); }
      });
    });
    req.on('error', (e) => { clearTimeout(timeout); resolve({ found: false, error: e.message }); });
    req.write(body); req.end();
  });
}

console.log(`\n═══ Small Firms Test — ${FIRMS.length} companies ═══\n`);

const results = [];
const sources = {};
let found = 0, notFound = 0, errors = 0;

for (let i = 0; i < FIRMS.length; i++) {
  const f = FIRMS[i];
  const start = Date.now();
  const r = await test(f);
  const ms = Date.now() - start;
  const status = r.error ? `ERROR: ${r.error}` : r.found ? `FOUND: ${r.domain} (${r.source})` : 'NOT FOUND';
  if (r.error) errors++;
  else if (r.found) { found++; sources[r.source] = (sources[r.source] || 0) + 1; }
  else notFound++;
  results.push({ ...f, ...r, ms });
  console.log(`[${i + 1}/${FIRMS.length}] ${f.n.slice(0, 45).padEnd(45)} → ${status} (${ms}ms)`);
  // 1.5s delay to avoid rate limiting
  await new Promise(r => setTimeout(r, 1500));
}

console.log(`\n═══ RESULTS ═══`);
console.log(`Total: ${FIRMS.length}`);
console.log(`Found: ${found} (${(found / FIRMS.length * 100).toFixed(1)}%)`);
console.log(`Not found: ${notFound}`);
console.log(`Errors: ${errors}`);
console.log(`Sources: ${JSON.stringify(sources)}`);

if (errors > 0) {
  console.log(`\n═══ ERRORS ═══`);
  for (const r of results.filter(r => r.error)) console.log(`  ${r.n}: ${r.error}`);
}

const foundResults = results.filter(r => r.found);
console.log(`\n═══ FOUND DOMAINS ═══`);
for (const r of foundResults) console.log(`  ${r.n.slice(0, 45).padEnd(45)} → ${r.domain} (${r.source})`);

const avgTime = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
console.log(`\nAvg time: ${avgTime}ms | Total: ${Math.round(results.reduce((s, r) => s + r.ms, 0) / 1000)}s`);
