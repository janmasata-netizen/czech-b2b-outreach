/**
 * push-imap-fix.mjs
 * Pushes sub-reply-check to n8n with format:"simple" fix on Salesman IMAP 1 node
 * Change: adds explicit format:"simple" to guarantee markSeen:false code path
 */

import { readFileSync } from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';

const WORKFLOWS = [
  { file: 'sub-reply-check.json', id: 'WjbYMqMXDxkjIssL' },
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
  console.log('=== Push IMAP Fix (sub-reply-check: format:"simple") ===');
  for (const wf of WORKFLOWS) {
    await pushWorkflow(wf);
  }
  console.log('\nDone!');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
