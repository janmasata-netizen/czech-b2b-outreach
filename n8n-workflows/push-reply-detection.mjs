/**
 * push-reply-detection.mjs
 * Pushes updated sub-reply-check workflow + enables WF9 (reply detection cron)
 * Sub-workflow must be activated first so WF9 can reference it.
 */

import { readFileSync } from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const WORKFLOWS = [
  { file: 'sub-reply-check.json', id: 'WjbYMqMXDxkjIssL', activate: true },
  { file: 'wf9-reply-detection.json', id: 'AaHXknYh9egPDxcG', activate: true },
];

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, N8N_BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${data}`));
        else resolve(JSON.parse(data || '{}'));
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function pushWorkflow({ file, id, activate }) {
  const jsonStr = readFileSync(file, 'utf-8')
    .replaceAll('SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER', SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(jsonStr);
  // Strip non-writable properties that n8n API rejects
  const allowed = ['name', 'nodes', 'connections', 'settings', 'staticData'];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) delete raw[key];
  }

  console.log(`\n--- ${file} (${id}) ---`);

  // 1. Deactivate
  try {
    await request('POST', `/api/v1/workflows/${id}/deactivate`, {});
    console.log('  Deactivated');
  } catch (e) {
    console.log('  Deactivate skipped:', e.message.slice(0, 80));
  }

  // 2. PUT
  await request('PUT', `/api/v1/workflows/${id}`, raw);
  console.log('  Updated');

  // 3. Activate
  if (activate) {
    try {
      await request('POST', `/api/v1/workflows/${id}/activate`, {});
      console.log('  Activated');
    } catch (e) {
      console.log('  Activate failed:', e.message.slice(0, 120));
    }
  }
}

async function main() {
  console.log('=== Push Reply Detection (sub-reply-check + WF9) ===');
  for (const wf of WORKFLOWS) {
    await pushWorkflow(wf);
  }
  console.log('\nDone!');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
