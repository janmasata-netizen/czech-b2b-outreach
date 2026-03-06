import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';

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
    req.on('error', (e) => reject(e));
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

async function main() {
  console.log('=== Push WF12: Website ICO Scraper ===\n');

  const wfJson = JSON.parse(fs.readFileSync(path.join(WF_DIR, 'wf12-ico-scrape.json'), 'utf-8'));
  const body = stripForPush(wfJson);

  const res = await n8nAPI('POST', '/api/v1/workflows', body);
  if (res.status < 300) {
    const newId = res.data.id;
    console.log(`  Created WF12 with ID: ${newId}`);
    const actRes = await n8nAPI('POST', `/api/v1/workflows/${newId}/activate`);
    if (actRes.status < 300) console.log(`  Activated WF12`);
    else console.log(`  Activate failed: HTTP ${actRes.status}`);
    console.log(`\nWF12 ID: ${newId}`);
    console.log('Add this ID to CLAUDE.md workflow table.');
  } else {
    console.log(`  Create failed: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 300)}`);
    console.log('  If WF12 already exists, update it manually or use its existing ID.');
  }
}

main().catch(console.error);
