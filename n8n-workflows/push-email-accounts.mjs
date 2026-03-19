import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';

const WF_DIR = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'));

const WORKFLOWS = [
  { file: 'wf7-wave-schedule.json',  id: 'TVNOzjSnaWrmTlqw', name: 'WF7 Wave Schedule' },
  { file: 'wf8-send-cron.json',      id: 'wJLD5sFxddNNxR7p', name: 'WF8 Send Cron' },
  { file: 'wf9-reply-detection.json', id: 'AaHXknYh9egPDxcG', name: 'WF9 Reply Detection' },
  { file: 'wf-force-send.json',      id: 'DPmnV2dRsbBMLAmz', name: 'Force Send' },
  { file: 'sub-reply-check.json',    id: 'WjbYMqMXDxkjIssL', name: 'Sub Reply Check' },
];

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
  const ALLOWED = new Set(['name', 'nodes', 'connections', 'settings']);
  const copy = {};
  for (const [k, v] of Object.entries(wf)) {
    if (ALLOWED.has(k) && v != null) copy[k] = v;
  }
  // Strip settings keys the n8n API may not accept
  if (copy.settings) {
    delete copy.settings.availableInMCP;
  }
  return copy;
}

console.log('=== Push email_accounts migration workflows ===\n');

for (const { file, id, name } of WORKFLOWS) {
  console.log(`--- ${name} (${file}) ---`);
  const wf = JSON.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf-8'));

  console.log('  Deactivating...');
  await n8nAPI('POST', `/api/v1/workflows/${id}/deactivate`);

  console.log('  Updating...');
  const res = await n8nAPI('PUT', `/api/v1/workflows/${id}`, stripForPush(wf));
  if (res.status < 300) {
    console.log('  OK');
  } else {
    console.log(`  FAILED: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 300)}`);
  }

  console.log('  Activating...');
  await n8nAPI('POST', `/api/v1/workflows/${id}/activate`);
  console.log('');
}

console.log('Done.');
