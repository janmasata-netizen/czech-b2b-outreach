/**
 * push-wf7-report.mjs
 * Pushes WF7 (Wave Schedule) to n8n with scheduling report changes.
 */

import { readFileSync } from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const WF7_ID = 'TVNOzjSnaWrmTlqw';
const WF7_FILE = 'wf7-wave-schedule.json';

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

async function main() {
  console.log('=== Push WF7: Wave Schedule (Report) ===');

  const jsonStr = readFileSync(WF7_FILE, 'utf-8')
    .replaceAll('SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER', SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(jsonStr);
  delete raw.pinData;
  delete raw.active;

  console.log(`\n--- ${WF7_FILE} (${WF7_ID}) ---`);

  // 1. Deactivate
  try {
    await request('POST', `/api/v1/workflows/${WF7_ID}/deactivate`, {});
    console.log('  Deactivated');
  } catch (e) {
    console.log('  Deactivate skipped:', e.message.slice(0, 80));
  }

  // 2. PUT
  await request('PUT', `/api/v1/workflows/${WF7_ID}`, raw);
  console.log('  Updated');

  // 3. Activate
  try {
    await request('POST', `/api/v1/workflows/${WF7_ID}/activate`, {});
    console.log('  Activated');
  } catch (e) {
    console.log('  Activate failed:', e.message.slice(0, 120));
  }

  console.log('\nDone!');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
