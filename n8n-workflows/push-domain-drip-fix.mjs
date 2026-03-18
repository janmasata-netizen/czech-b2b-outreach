import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const WF_DIR = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'));

function n8nAPI(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: N8N_HOST,
      port: N8N_PORT,
      path: apiPath,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function stripForPush(wf) {
  const copy = { ...wf };
  delete copy.pinData;
  delete copy.active;
  delete copy.id;
  delete copy.staticData;
  delete copy.tags;
  delete copy.triggerCount;
  return copy;
}

function readWF(filename) {
  const raw = fs.readFileSync(path.join(WF_DIR, filename), 'utf-8');
  const replaced = raw.replaceAll('SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER', SUPABASE_SERVICE_ROLE_KEY);
  return JSON.parse(replaced);
}

async function pushWorkflow(filename, wfId, label) {
  console.log(`\n── ${label} (${wfId}) ──`);

  // Deactivate
  const deact = await n8nAPI('POST', `/api/v1/workflows/${wfId}/deactivate`);
  if (deact.status < 300) console.log('  ✓ Deactivated');
  else console.log(`  ⚠ Deactivate: HTTP ${deact.status}`);

  // Update
  const wf = readWF(filename);
  const body = stripForPush(wf);
  const res = await n8nAPI('PUT', `/api/v1/workflows/${wfId}`, body);
  if (res.status < 300) console.log('  ✓ Updated');
  else { console.log(`  ✗ Update failed: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`); return false; }

  // Activate
  const act = await n8nAPI('POST', `/api/v1/workflows/${wfId}/activate`);
  if (act.status < 300) console.log('  ✓ Activated');
  else console.log(`  ⚠ Activate: HTTP ${act.status}`);

  return true;
}

// ── Main ──
console.log('═══ Push Domain Discovery Fix + Drip Mode ═══');

const WORKFLOWS = [
  { file: 'sub-domain-discovery.json', id: 'KdaIVaNnqj8eDx8D', label: 'SUB — Domain Discovery' },
  { file: 'wf3-kurzy-scrape.json',     id: 'nPbr15LJxGaZUqo7', label: 'WF3 — Kurzy Scrape' },
  { file: 'wf-email-finder-v3.json',   id: 'KRWLgqTf5ILqSNpk', label: 'WF — Email Finder V3' },
  { file: 'wf7-wave-schedule.json',    id: 'TVNOzjSnaWrmTlqw', label: 'WF7 — Wave Schedule' },
];

let ok = 0, fail = 0;
for (const { file, id, label } of WORKFLOWS) {
  const success = await pushWorkflow(file, id, label);
  if (success) ok++; else fail++;
}

console.log(`\n═══ Done: ${ok} succeeded, ${fail} failed ═══`);
if (fail > 0) process.exit(1);
