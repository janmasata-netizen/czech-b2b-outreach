/**
 * Test DuckDuckGo HTML search directly to see if it works from the VPS.
 * Usage: cd n8n-workflows && node test-ddg.mjs
 */
import http from 'http';
import { VPS_IP, WEBHOOK_SECRET } from './env.mjs';

const WEBHOOK_HOST = VPS_IP;
const WEBHOOK_PORT = 32770;
const WEBHOOK_PATH = '/webhook/wf-domain-discovery-test';

// Test firms that should fall through to DDG (DNS won't find them)
const FIRMS = [
  { name: "OBI Česká republika s.r.o.", ico: "18628203", expected: "obi.cz" },
  { name: "Booking.com B.V.", ico: "27609406", expected: "booking.com" },
  { name: "3M Česko, spol. s r.o.", ico: "00121237", expected: "3m.cz" },
  { name: "CD Projekt RED s.r.o.", ico: "06308401", expected: "cdprojektred.com" },
  { name: "Internet Mall, a.s.", ico: "26204967", expected: "mall.cz" },
];

function test(name, ico) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ company_name: name, ico: ico || '' });
    const timeout = setTimeout(() => resolve({ found: false, error: 'TIMEOUT' }), 60000);
    const req = http.request({
      hostname: WEBHOOK_HOST, port: WEBHOOK_PORT, path: WEBHOOK_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Webhook-Secret': WEBHOOK_SECRET },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(timeout);
        try { const r = JSON.parse(d); resolve(r); }
        catch { resolve({ found: false, error: 'PARSE: ' + d.slice(0, 100) }); }
      });
    });
    req.on('error', (e) => { clearTimeout(timeout); resolve({ found: false, error: e.message }); });
    req.write(body); req.end();
  });
}

console.log('═══ DDG Fallback Test ═══\n');
for (const f of FIRMS) {
  const start = Date.now();
  const r = await test(f.name, f.ico);
  const ms = Date.now() - start;
  const status = r.error ? `ERROR: ${r.error}` : r.found ? `FOUND: ${r.domain} (${r.source})` : 'NOT FOUND';
  const match = r.found && r.domain === f.expected ? ' ✓' : r.found ? ` (exp: ${f.expected})` : '';
  console.log(`${f.name}`);
  console.log(`  → ${status}${match} (${ms}ms)`);
  console.log();
}
