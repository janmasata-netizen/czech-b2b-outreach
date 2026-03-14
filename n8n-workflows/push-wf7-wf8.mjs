/**
 * push-wf7-wf8.mjs
 * Pushes WF7 (Wave Schedule) and WF8 (Send Cron) to n8n.
 * Deactivate → PUT → Activate pattern.
 */

import { readFileSync } from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const WORKFLOWS = [
  { id: 'TVNOzjSnaWrmTlqw', file: 'wf7-wave-schedule.json', name: 'WF7: Wave Schedule' },
  { id: 'wJLD5sFxddNNxR7p', file: 'wf8-send-cron.json', name: 'WF8: Send Cron' },
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

async function pushWorkflow({ id, file, name }) {
  console.log(`\n--- ${name} (${file} → ${id}) ---`);

  const jsonStr = readFileSync(file, 'utf-8')
    .replaceAll('SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER', SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(jsonStr);
  delete raw.pinData;
  delete raw.active;

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
  try {
    await request('POST', `/api/v1/workflows/${id}/activate`, {});
    console.log('  Activated');
  } catch (e) {
    console.log('  Activate failed:', e.message.slice(0, 120));
  }
}

async function main() {
  console.log('=== Push WF7 + WF8 (Audit Fixes) ===');
  for (const wf of WORKFLOWS) {
    await pushWorkflow(wf);
  }
  console.log('\nDone!');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
