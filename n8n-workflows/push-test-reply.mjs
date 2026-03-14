/**
 * push-test-reply.mjs
 * Creates (or updates) the test-reply-detection workflow and activates it.
 * Also redeploys the fixed sub-reply-check + WF9.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const WF_DIR = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'));

// Known workflow IDs (null = create new)
const SUB_REPLY_CHECK_ID = 'WjbYMqMXDxkjIssL';
const WF9_ID = 'AaHXknYh9egPDxcG';
let TEST_WF_ID = null; // will be set after creation or discovery

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

function loadWorkflow(file) {
  const raw = fs.readFileSync(path.join(WF_DIR, file), 'utf-8')
    .replaceAll('SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER', SUPABASE_SERVICE_ROLE_KEY);
  const wf = JSON.parse(raw);
  delete wf.pinData;
  delete wf.active;
  delete wf.id;
  return wf;
}

async function findExistingWorkflow(name) {
  const res = await n8nAPI('GET', '/api/v1/workflows?limit=200');
  if (res.status < 300 && res.data && res.data.data) {
    const found = res.data.data.find(w => w.name === name);
    return found ? found.id : null;
  }
  return null;
}

async function pushExisting(file, id, label) {
  const wf = loadWorkflow(file);
  console.log(`\n--- ${label} (${id}) ---`);

  try {
    await n8nAPI('POST', `/api/v1/workflows/${id}/deactivate`);
    console.log('  Deactivated');
  } catch (e) {
    console.log('  Deactivate skipped:', e.message.slice(0, 80));
  }

  const res = await n8nAPI('PUT', `/api/v1/workflows/${id}`, wf);
  if (res.status >= 300) {
    console.log(`  UPDATE FAILED: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 300)}`);
    return;
  }
  console.log('  Updated');

  try {
    await n8nAPI('POST', `/api/v1/workflows/${id}/activate`);
    console.log('  Activated');
  } catch (e) {
    console.log('  Activate failed:', e.message.slice(0, 120));
  }
}

async function pushNew(file, label) {
  const wf = loadWorkflow(file);
  console.log(`\n--- ${label} (new) ---`);

  // Check if already exists
  const existingId = await findExistingWorkflow(wf.name);
  if (existingId) {
    console.log(`  Found existing workflow: ${existingId}`);
    TEST_WF_ID = existingId;
    await pushExisting(file, existingId, label);
    return existingId;
  }

  const res = await n8nAPI('POST', '/api/v1/workflows', wf);
  if (res.status >= 300) {
    console.log(`  CREATE FAILED: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 300)}`);
    return null;
  }

  const id = res.data.id;
  TEST_WF_ID = id;
  console.log(`  Created: ${id}`);

  try {
    await n8nAPI('POST', `/api/v1/workflows/${id}/activate`);
    console.log('  Activated');
  } catch (e) {
    console.log('  Activate failed:', e.message.slice(0, 120));
  }

  return id;
}

async function main() {
  console.log('=== Push Reply Detection (test + fixes) ===');

  // 1. Deploy test workflow
  const testId = await pushNew('test-reply-detection.json', 'Test Reply Detection');

  // 2. Deploy fixed sub-reply-check
  await pushExisting('sub-reply-check.json', SUB_REPLY_CHECK_ID, 'SUB — Reply Check (fixed)');

  // 3. Deploy WF9 (re-activate)
  await pushExisting('wf9-reply-detection.json', WF9_ID, 'WF9: Reply Detection');

  console.log('\n=== Done! ===');

  if (testId) {
    console.log(`\nTest workflow webhook URLs:`);
    console.log(`  SMTP test:   POST /webhook/test-reply-detection  { "mode": "smtp", "test_email": "...", "credential_name": "..." }`);
    console.log(`  IMAP test:   POST /webhook/test-reply-detection  { "mode": "imap", "credential_name": "..." }`);
    console.log(`  E2E test:    POST /webhook/test-reply-detection  { "mode": "e2e", "test_email": "...", "smtp_credential_name": "..." }`);
    console.log(`  Verify:      POST /webhook/test-reply-detection  { "mode": "verify", "credential_name": "...", "marker": "..." }`);
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
