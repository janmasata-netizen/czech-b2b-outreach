import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';

const WF_DIR = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'));

function n8nAPI(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: N8N_HOST, port: N8N_PORT, path: apiPath, method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json',
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
  delete copy.pinData; delete copy.active; delete copy.id;
  delete copy.staticData; delete copy.tags; delete copy.triggerCount;
  return copy;
}

console.log('═══ Push SUB — Domain Discovery (v2) ═══\n');

const wf = JSON.parse(fs.readFileSync(path.join(WF_DIR, 'sub-domain-discovery.json'), 'utf-8'));
const WF_NAME = 'SUB — Domain Discovery';
const WF_ID = 'KdaIVaNnqj8eDx8D';

// Deactivate → Update → Activate
console.log(`Updating workflow ${WF_ID}...`);
await n8nAPI('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
const body = stripForPush(wf);
const res = await n8nAPI('PUT', `/api/v1/workflows/${WF_ID}`, body);
if (res.status < 300) {
  console.log(`  ✓ Updated ${WF_NAME} (${WF_ID})`);
} else {
  console.log(`  ✗ Update failed: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 300)}`);
  process.exit(1);
}
await n8nAPI('POST', `/api/v1/workflows/${WF_ID}/activate`);
console.log(`  ✓ Activated`);
console.log('\n═══ Done ═══');
