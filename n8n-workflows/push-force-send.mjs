import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';

const WF_FORCE_SEND_ID = 'DPmnV2dRsbBMLAmz';
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
  return copy;
}

console.log('=== Push wf-force-send (remove outreach_accounts dependency) ===\n');

const wf = JSON.parse(fs.readFileSync(path.join(WF_DIR, 'wf-force-send.json'), 'utf-8'));

console.log('Deactivating...');
await n8nAPI('POST', `/api/v1/workflows/${WF_FORCE_SEND_ID}/deactivate`);

console.log('Updating...');
const res = await n8nAPI('PUT', `/api/v1/workflows/${WF_FORCE_SEND_ID}`, stripForPush(wf));
if (res.status < 300) {
  console.log('  OK');
} else {
  console.log(`  FAILED: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 300)}`);
}

console.log('Activating...');
await n8nAPI('POST', `/api/v1/workflows/${WF_FORCE_SEND_ID}/activate`);

console.log('\nDone.');
