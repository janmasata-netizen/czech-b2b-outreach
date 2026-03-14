import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';

const WF_DIR = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'));

const SUB_BURNER_PROBE_ID = '9J5svDvgXBkZtOLX';
const WF_EMAIL_FINDER_V2_ID = '6sc6c0ZSuglJ548A';
const SUB_SMTP_CHECK_ID = 'L6D2HcFYoNorgiom';

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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
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

async function deactivate(wfId, label) {
  const res = await n8nAPI('POST', `/api/v1/workflows/${wfId}/deactivate`);
  if (res.status < 300) {
    console.log(`  ✓ Deactivated ${label}`);
  } else {
    console.log(`  ⚠ Deactivate ${label}: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`);
  }
}

async function activate(wfId, label) {
  const res = await n8nAPI('POST', `/api/v1/workflows/${wfId}/activate`);
  if (res.status < 300) {
    console.log(`  ✓ Activated ${label}`);
  } else {
    console.log(`  ✗ Activate ${label}: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`);
  }
}

async function updateWorkflow(wfId, wfJson, label) {
  const body = stripForPush(wfJson);
  const res = await n8nAPI('PUT', `/api/v1/workflows/${wfId}`, body);
  if (res.status < 300) {
    console.log(`  ✓ Updated ${label}`);
    return true;
  } else {
    console.log(`  ✗ Update ${label}: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`);
    return false;
  }
}

function readWF(filename) {
  return JSON.parse(fs.readFileSync(path.join(WF_DIR, filename), 'utf-8'));
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('═══ Push Email Finder Timeout Fixes ═══\n');

// Step 1: Update sub-burner-probe (3-min wait, remove neverError)
console.log('Step 1: Update sub-burner-probe');
await deactivate(SUB_BURNER_PROBE_ID, 'sub-burner-probe');
const subProbe = readWF('sub-burner-probe.json');
await updateWorkflow(SUB_BURNER_PROBE_ID, subProbe, 'sub-burner-probe');
await activate(SUB_BURNER_PROBE_ID, 'sub-burner-probe');
console.log('');

// Step 2: Update wf-email-finder-v2 (360s timeout, error handling)
console.log('Step 2: Update wf-email-finder-v2');
await deactivate(WF_EMAIL_FINDER_V2_ID, 'wf-email-finder-v2');
const wfV2 = readWF('wf-email-finder-v2.json');
await updateWorkflow(WF_EMAIL_FINDER_V2_ID, wfV2, 'wf-email-finder-v2');
await activate(WF_EMAIL_FINDER_V2_ID, 'wf-email-finder-v2');
console.log('');

// Step 3: Update sub-smtp-check (retry on failure, remove hasPartialData catch-all)
console.log('Step 3: Update sub-smtp-check');
await deactivate(SUB_SMTP_CHECK_ID, 'sub-smtp-check');
const subSmtp = readWF('sub-smtp-check.json');
await updateWorkflow(SUB_SMTP_CHECK_ID, subSmtp, 'sub-smtp-check');
await activate(SUB_SMTP_CHECK_ID, 'sub-smtp-check');
console.log('');

console.log('═══ Done ═══');
