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
  delete copy.staticData;
  delete copy.tags;
  delete copy.triggerCount;
  return copy;
}

function readWF(filename) {
  return JSON.parse(fs.readFileSync(path.join(WF_DIR, filename), 'utf-8'));
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('═══ Push SUB — Clean Domain ═══\n');

const wf = readWF('sub-clean-domain.json');

// Try to find existing workflow by name
const listRes = await n8nAPI('GET', '/api/v1/workflows?limit=200');
const existing = listRes.data?.data?.find(w => w.name === 'SUB — Clean Domain');

if (existing) {
  console.log(`Found existing workflow: ${existing.id}`);
  await n8nAPI('POST', `/api/v1/workflows/${existing.id}/deactivate`);
  const body = stripForPush(wf);
  const res = await n8nAPI('PUT', `/api/v1/workflows/${existing.id}`, body);
  if (res.status < 300) {
    console.log(`  ✓ Updated SUB — Clean Domain (${existing.id})`);
  } else {
    console.log(`  ✗ Update failed: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  await n8nAPI('POST', `/api/v1/workflows/${existing.id}/activate`);
  console.log(`  ✓ Activated`);
  console.log(`\nWorkflow ID: ${existing.id}`);
} else {
  console.log('Creating new workflow...');
  const body = stripForPush(wf);
  const res = await n8nAPI('POST', '/api/v1/workflows', body);
  if (res.status < 300) {
    const newId = res.data.id;
    console.log(`  ✓ Created SUB — Clean Domain (${newId})`);
    await n8nAPI('POST', `/api/v1/workflows/${newId}/activate`);
    console.log(`  ✓ Activated`);
    console.log(`\nWorkflow ID: ${newId}`);
    console.log('\n⚠ Update CLAUDE.md with this workflow ID!');
  } else {
    console.log(`  ✗ Create failed: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`);
  }
}

console.log('\n═══ Done ═══');
