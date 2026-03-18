/**
 * Test domain discovery with 100 Czech firms.
 * Usage: cd n8n-workflows && node test-domain-discovery-100.mjs
 */
import http from 'http';

const WEBHOOK_HOST = '72.62.53.244';
const WEBHOOK_PORT = 32770;
const WEBHOOK_PATH = '/webhook/wf-domain-discovery-test';
const WEBHOOK_SECRET = 'reWDUmcjSRPTv3k-0CKdoASO_KY7Z3ux';

const FIRMS = [
  { company_name: "Alza.cz a.s.", ico: "27082440", expected: "alza.cz" },
  { company_name: "Kiwi.com s.r.o.", ico: "29352886", expected: "kiwi.com" },
  { company_name: "Avast Software s.r.o.", ico: "02176475", expected: "avast.com,avast.cz" },
  { company_name: "SPORTISIMO s.r.o.", ico: "26194627", expected: "sportisimo.cz" },
  { company_name: "Notino, s.r.o.", ico: "27609057", expected: "notino.cz" },
  { company_name: "CZC.cz s.r.o.", ico: "25655701", expected: "czc.cz" },
  { company_name: "DATART INTERNATIONAL, a.s.", ico: "60192615", expected: "datart.cz" },
  { company_name: "Mountfield a.s.", ico: "25620991", expected: "mountfield.cz" },
  { company_name: "ČEZ, a. s.", ico: "45274649", expected: "cez.cz" },
  { company_name: "Škoda Auto a.s.", ico: "00177041", expected: "skoda-auto.cz,skodaauto.cz" },
  { company_name: "Česká pošta, s.p.", ico: "47114983", expected: "ceskaposta.cz" },
  { company_name: "Česká televize", ico: "00027383", expected: "ceskatelevize.cz" },
  { company_name: "TV Nova s.r.o.", ico: "45800456", expected: "nova.cz,tvnova.cz" },
  { company_name: "SAZKA a.s.", ico: "26493993", expected: "sazka.cz" },
  { company_name: "TIPSPORT a.s.", ico: "18600824", expected: "tipsport.cz" },
  { company_name: "Lidl Česká republika s.r.o.", ico: "26178541", expected: "lidl.cz,lidl.com" },
  { company_name: "Kaufland Česká republika v.o.s.", ico: "25110161", expected: "kaufland.cz" },
  { company_name: "Penny Market s.r.o.", ico: "64945880", expected: "penny.cz,penny-market.cz,pennymarket.cz" },
  { company_name: "Plzeňský Prazdroj, a. s.", ico: "45357366", expected: "prazdroj.cz" },
  { company_name: "AGROFERT, a.s.", ico: "26185610", expected: "agrofert.cz" },
  { company_name: "E.ON Česká republika, s. r. o.", ico: "25733591", expected: "eon.cz" },
  { company_name: "2N TELEKOMUNIKACE a.s.", ico: "26183960", expected: "2n.com,2n.cz" },
  { company_name: "Rohlik.cz investment a.s.", ico: "04711602", expected: "rohlik.cz" },
  { company_name: "České dráhy, a.s.", ico: "70994226", expected: "cd.cz,ceskedrahy.cz" },
  { company_name: "O2 Czech Republic a.s.", ico: "60193336", expected: "o2.cz" },
  { company_name: "Budějovický Budvar, národní podnik", ico: "00017478", expected: "budejovickybudvar.cz" },
  { company_name: "OKAY s.r.o.", ico: "25307358", expected: "okay.cz" },
  { company_name: "Allianz pojišťovna, a.s.", ico: "47115971", expected: "allianz.cz" },
  { company_name: "Kooperativa pojišťovna, a.s.", ico: "47116617", expected: "koop.cz,kooperativa.cz" },
  { company_name: "Česká spořitelna, a.s.", ico: "45244782", expected: "csas.cz,ceskasporitelna.cz" },
  { company_name: "Komerční banka, a.s.", ico: "45317054", expected: "kb.cz" },
  { company_name: "ČSOB, a.s.", ico: "00001350", expected: "csob.cz,csob.com" },
  { company_name: "Raiffeisenbank a.s.", ico: "49240901", expected: "rb.cz,raiffeisenbank.cz" },
  { company_name: "Vodafone Czech Republic a.s.", ico: "25788001", expected: "vodafone.cz,vodafone.com" },
  { company_name: "T-Mobile Czech Republic a.s.", ico: "64949681", expected: "t-mobile.cz,tmobile.cz" },
  { company_name: "Net4Gas, s.r.o.", ico: "27386143", expected: "net4gas.cz" },
  { company_name: "Seznam.cz, a.s.", ico: "26168685", expected: "seznam.cz" },
  { company_name: "Staropramen s.r.o.", ico: "14896945", expected: "staropramen.cz" },
  { company_name: "Billa, spol. s r.o.", ico: "00685976", expected: "billa.cz" },
  { company_name: "Albert Česká republika, s.r.o.", ico: "45796393", expected: "albert.cz" },
  { company_name: "Globus ČR, k.s.", ico: "63473291", expected: "globus.cz" },
  { company_name: "Home Credit a.s.", ico: "26978636", expected: "homecredit.cz" },
  { company_name: "Stavebniny DEK a.s.", ico: "27636801", expected: "dek.cz,stavebninydek.cz" },
  { company_name: "OBI Česká republika s.r.o.", ico: "18628203", expected: "obi.cz" },
  { company_name: "Hornbach Baumarkt CS spol. s r.o.", ico: "60193066", expected: "hornbach.cz" },
  { company_name: "Makro Cash & Carry ČR s.r.o.", ico: "26450691", expected: "makro.cz" },
  { company_name: "Lékárna.cz s.r.o.", ico: "28375695", expected: "lekarna.cz" },
  { company_name: "Dr. Max lékárna s.r.o.", ico: "27672485", expected: "drmax.cz" },
  { company_name: "Pilulka Lékárny a.s.", ico: "04138999", expected: "pilulka.cz" },
  { company_name: "Meisat s.r.o.", ico: "", expected: "meisat.com" },
  { company_name: "MALL GROUP a.s.", ico: "06032729", expected: "" },
  { company_name: "Bauhaus k.s.", ico: "25047688", expected: "bauhaus.cz" },
  { company_name: "Internet Mall, a.s.", ico: "26204967", expected: "" },
  { company_name: "H1.cz s.r.o.", ico: "27619950", expected: "h1.cz" },
  { company_name: "100Mega Distribution s.r.o.", ico: "27405643", expected: "" },
  { company_name: "B2B Centrum a.s.", ico: "27112631", expected: "" },
  { company_name: "GoodCall s.r.o.", ico: "02765861", expected: "" },
  { company_name: "3M Česko, spol. s r.o.", ico: "00121237", expected: "" },
  { company_name: "Booking.com B.V.", ico: "27609406", expected: "" },
  { company_name: "Bohemia Energy Entity s.r.o.", ico: "28861736", expected: "" },
  { company_name: "Stavební firma Procházka s.r.o.", ico: "", expected: "" },
  { company_name: "Elektroinstalace Dvořák s.r.o.", ico: "", expected: "" },
  { company_name: "Pekařství U Nováků s.r.o.", ico: "", expected: "" },
  { company_name: "Autoservis Kolář s.r.o.", ico: "", expected: "" },
  { company_name: "Truhlářství Blažek s.r.o.", ico: "", expected: "" },
  { company_name: "Zahradnictví Květ s.r.o.", ico: "", expected: "" },
  { company_name: "Čistírna Oděvů Praha s.r.o.", ico: "", expected: "" },
  { company_name: "Malířství a lakýrnictví Kratochvíl s.r.o.", ico: "", expected: "" },
  { company_name: "Opravna obuvi Sedláček s.r.o.", ico: "", expected: "" },
  { company_name: "Pohřební služba Anděl s.r.o.", ico: "", expected: "" },
  { company_name: "1. česká stavební a.s.", ico: "", expected: "" },
  { company_name: "4finance s.r.o.", ico: "03102781", expected: "" },
  { company_name: "A-Z servis s.r.o.", ico: "", expected: "" },
  { company_name: "CD Projekt RED s.r.o.", ico: "06308401", expected: "" },
  { company_name: "E-SHOP RYCHLE s.r.o.", ico: "", expected: "" },
  { company_name: "1. BRNĚNSKÁ STROJÍRNA VELKÁ BÍTEŠ a.s.", ico: "46347408", expected: "" },
  { company_name: "FTV Prima, spol. s r.o.", ico: "48115908", expected: "" },
  { company_name: "Nová média s.r.o.", ico: "", expected: "" },
  { company_name: "Nova Morava s.r.o.", ico: "", expected: "" },
  { company_name: "Radost s.r.o.", ico: "", expected: "" },
  { company_name: "Hvězda Group s.r.o.", ico: "", expected: "" },
  { company_name: "Čechie stavby s.r.o.", ico: "", expected: "" },
  { company_name: "Dobrý obchod s.r.o.", ico: "", expected: "" },
  { company_name: "Moravská stavební s.r.o.", ico: "", expected: "" },
  { company_name: "Tesař Novotný s.r.o.", ico: "", expected: "" },
  { company_name: "Klempířství Horák s.r.o.", ico: "", expected: "" },
  { company_name: "Čalounictví Beneš s.r.o.", ico: "", expected: "" },
  { company_name: "Opravna elektro Kříž s.r.o.", ico: "", expected: "" },
  { company_name: "Zahradnictví Procházka Brno s.r.o.", ico: "", expected: "" },
  { company_name: "Cukrárna Sladký sen s.r.o.", ico: "", expected: "" },
  { company_name: "Autopůjčovna Veselý s.r.o.", ico: "", expected: "" },
  { company_name: "Zámečnictví Fiala s.r.o.", ico: "", expected: "" },
  { company_name: "Instalatérství Marků s.r.o.", ico: "", expected: "" },
  { company_name: "Tiskárna Dvořáček s.r.o.", ico: "", expected: "" },
  { company_name: "Úklidová firma Čistota s.r.o.", ico: "", expected: "" },
];

function testFirm(firm) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ company_name: firm.company_name, ico: firm.ico || '' });
    const timeout = setTimeout(() => resolve({ ...firm, found: false, domain: '', source: '', error: 'TIMEOUT' }), 90000);
    const req = http.request({
      hostname: WEBHOOK_HOST, port: WEBHOOK_PORT, path: WEBHOOK_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Webhook-Secret': WEBHOOK_SECRET },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const r = JSON.parse(d);
          resolve({ ...firm, found: r.found, domain: r.domain || '', source: r.source || '' });
        } catch {
          resolve({ ...firm, found: false, domain: '', source: '', error: 'PARSE: ' + d.slice(0, 100) });
        }
      });
    });
    req.on('error', (e) => { clearTimeout(timeout); resolve({ ...firm, found: false, domain: '', source: '', error: e.message }); });
    req.write(body);
    req.end();
  });
}

async function runBatch(firms, concurrency = 3) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < firms.length) {
      const i = idx++;
      const firm = firms[i];
      const start = Date.now();
      const result = await testFirm(firm);
      result.time_ms = Date.now() - start;
      results.push(result);
      const status = result.error ? `ERROR: ${result.error}` : result.found ? `FOUND: ${result.domain} (${result.source})` : 'NOT FOUND';
      const expList = result.expected ? result.expected.split(',') : [];
      const match = result.expected && result.found && expList.includes(result.domain) ? ' ✓' :
                    result.expected && result.found && !expList.includes(result.domain) ? ` ✗ exp:${result.expected}` : '';
      console.log(`[${results.length}/${firms.length}] ${firm.company_name} → ${status}${match} (${result.time_ms}ms)`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

console.log(`\n═══ Domain Discovery Test — ${FIRMS.length} Czech Firms ═══\n`);
const results = await runBatch(FIRMS, 1);

const found = results.filter(r => r.found);
const notFound = results.filter(r => !r.found && !r.error);
const errors = results.filter(r => r.error);
const bySource = {};
for (const r of found) bySource[r.source] = (bySource[r.source] || 0) + 1;

const withExpected = results.filter(r => r.expected);
function matchesExpected(r) { return r.expected.split(',').includes(r.domain); }
const correctMatch = withExpected.filter(r => r.found && matchesExpected(r));
const wrongDomain = withExpected.filter(r => r.found && !matchesExpected(r));
const missedExpected = withExpected.filter(r => !r.found);

console.log(`\n═══ RESULTS ═══`);
console.log(`Total: ${results.length}`);
console.log(`Found: ${found.length} (${(found.length/results.length*100).toFixed(1)}%)`);
console.log(`Not found: ${notFound.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`By source: ${JSON.stringify(bySource)}`);
console.log(`\nExpected domain set: ${withExpected.length}`);
console.log(`  Correct: ${correctMatch.length}`);
console.log(`  Wrong: ${wrongDomain.length}`);
console.log(`  Missed: ${missedExpected.length}`);

if (wrongDomain.length > 0) {
  console.log(`\n═══ WRONG DOMAINS ═══`);
  for (const r of wrongDomain) console.log(`  ${r.company_name}: got ${r.domain}, expected ${r.expected}`);
}
if (missedExpected.length > 0) {
  console.log(`\n═══ MISSED ═══`);
  for (const r of missedExpected) console.log(`  ${r.company_name}: expected ${r.expected}`);
}
if (errors.length > 0) {
  console.log(`\n═══ ERRORS ═══`);
  for (const r of errors) console.log(`  ${r.company_name}: ${r.error}`);
}

const avgTime = Math.round(results.reduce((s, r) => s + r.time_ms, 0) / results.length);
console.log(`\nAvg time: ${avgTime}ms | Total: ${Math.round(results.reduce((s, r) => s + r.time_ms, 0) / 1000)}s`);
