/**
 * push-thread-fix.mjs
 * Pushes updated WF7 + WF8 to n8n (deactivate -> PUT -> activate)
 * Fixes email threading: thread_subject for consistent subjects, accumulated References chain
 */

import { readFileSync } from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';

const WORKFLOWS = [
  { file: 'wf7-wave-schedule.json', id: 'TVNOzjSnaWrmTlqw' },
  { file: 'wf8-send-cron.json',     id: 'wJLD5sFxddNNxR7p' },
  { file: 'wf-force-send.json',     id: 'DPmnV2dRsbBMLAmz' },
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

async function pushWorkflow({ file, id }) {
  const raw = JSON.parse(readFileSync(file, 'utf-8'));
  delete raw.pinData;
  delete raw.active;

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
  try {
    await request('POST', `/api/v1/workflows/${id}/activate`, {});
    console.log('  Activated');
  } catch (e) {
    console.log('  Activate skipped:', e.message.slice(0, 80));
  }
}

async function main() {
  console.log('=== Push Thread Fix (WF7 + WF8 + Force Send) ===');
  for (const wf of WORKFLOWS) {
    await pushWorkflow(wf);
  }
  console.log('\nDone!');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
