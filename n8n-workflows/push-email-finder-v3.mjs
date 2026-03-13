import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

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

async function deactivate(wfId, label) {
  const res = await n8nAPI('POST', `/api/v1/workflows/${wfId}/deactivate`);
  if (res.status < 300) console.log(`  ✓ Deactivated ${label}`);
  else console.log(`  ⚠ Deactivate ${label}: HTTP ${res.status}`);
}

async function activate(wfId, label) {
  const res = await n8nAPI('POST', `/api/v1/workflows/${wfId}/activate`);
  if (res.status < 300) console.log(`  ✓ Activated ${label}`);
  else console.log(`  ✗ Activate ${label}: HTTP ${res.status}`);
}

async function updateWorkflow(wfId, wfJson, label) {
  const body = stripForPush(wfJson);
  const res = await n8nAPI('PUT', `/api/v1/workflows/${wfId}`, body);
  if (res.status < 300) { console.log(`  ✓ Updated ${label}`); return true; }
  console.log(`  ✗ Update ${label}: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`);
  return false;
}

function readWF(filename) {
  const raw = fs.readFileSync(path.join(WF_DIR, filename), 'utf-8');
  const replaced = raw.replaceAll('SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER', SUPABASE_SERVICE_ROLE_KEY);
  return JSON.parse(replaced);
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('═══ Push Email Finder V3 + Sub-Clean-Domain ═══\n');

// Step 0: Find or create sub-clean-domain
console.log('Step 0: Deploy SUB — Clean Domain');
const listRes = await n8nAPI('GET', '/api/v1/workflows?limit=200');
let subCleanId = '';
const existingSub = listRes.data?.data?.find(w => w.name === 'SUB — Clean Domain');

if (existingSub) {
  subCleanId = existingSub.id;
  console.log(`  Found existing: ${subCleanId}`);
  await deactivate(subCleanId, 'sub-clean-domain');
  const subWf = readWF('sub-clean-domain.json');
  await updateWorkflow(subCleanId, subWf, 'sub-clean-domain');
  await activate(subCleanId, 'sub-clean-domain');
} else {
  const subWf = readWF('sub-clean-domain.json');
  const body = stripForPush(subWf);
  const res = await n8nAPI('POST', '/api/v1/workflows', body);
  if (res.status < 300) {
    subCleanId = res.data.id;
    console.log(`  ✓ Created SUB — Clean Domain (${subCleanId})`);
    await activate(subCleanId, 'sub-clean-domain');
  } else {
    console.log(`  ✗ Failed to create: HTTP ${res.status}`);
    process.exit(1);
  }
}
console.log(`  Sub-Clean-Domain ID: ${subCleanId}\n`);

// Step 1: Deploy wf-email-finder-v3 (replace sub-clean-domain ID placeholder)
console.log('Step 1: Deploy WF Email Finder V3');
const v3Raw = fs.readFileSync(path.join(WF_DIR, 'wf-email-finder-v3.json'), 'utf-8');
const v3Replaced = v3Raw
  .replaceAll('SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER', SUPABASE_SERVICE_ROLE_KEY)
  .replaceAll('__SUB_CLEAN_DOMAIN_ID__', subCleanId);
const v3Wf = JSON.parse(v3Replaced);

const existingV3 = listRes.data?.data?.find(w => w.name === 'WF: Email Finder V3 (Company Orchestrator)');

if (existingV3) {
  console.log(`  Found existing: ${existingV3.id}`);
  await deactivate(existingV3.id, 'wf-email-finder-v3');
  await updateWorkflow(existingV3.id, v3Wf, 'wf-email-finder-v3');
  await activate(existingV3.id, 'wf-email-finder-v3');
  console.log(`  WF Email Finder V3 ID: ${existingV3.id}`);
} else {
  const body = stripForPush(v3Wf);
  const res = await n8nAPI('POST', '/api/v1/workflows', body);
  if (res.status < 300) {
    const newId = res.data.id;
    console.log(`  ✓ Created WF Email Finder V3 (${newId})`);
    await activate(newId, 'wf-email-finder-v3');
    console.log(`  WF Email Finder V3 ID: ${newId}`);
    console.log('\n  ⚠ Update CLAUDE.md with this workflow ID!');
  } else {
    console.log(`  ✗ Create failed: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`);
  }
}

console.log('\n═══ Done ═══');
