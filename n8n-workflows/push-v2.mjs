import http from 'http';
import fs from 'fs';
import path from 'path';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';

const SUB_REPLY_CHECK_ID = 'WjbYMqMXDxkjIssL';
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

console.log('═══ Push Bugfixes v2 (DB migrations already applied) ═══\n');

// Step 1: Update sub-reply-check
console.log('Step 1: Update sub-reply-check');
await deactivate(SUB_REPLY_CHECK_ID, 'sub-reply-check');
const subWF = readWF('sub-reply-check.json');
await updateWorkflow(SUB_REPLY_CHECK_ID, subWF, 'sub-reply-check');
await activate(SUB_REPLY_CHECK_ID, 'sub-reply-check');
console.log('');

// Step 2: Update WF9 with sub-reply-check ID
console.log('Step 2: Update WF9 (Reply Detection)');
const WF9_ID = 'AaHXknYh9egPDxcG';
const wf9 = readWF('wf9-reply-detection.json');
const wf9Str = JSON.stringify(wf9).replace(/__SUB_REPLY_CHECK_ID__/g, SUB_REPLY_CHECK_ID);
const wf9Final = JSON.parse(wf9Str);
await deactivate(WF9_ID, 'WF9');
await updateWorkflow(WF9_ID, wf9Final, 'WF9');
await activate(WF9_ID, 'WF9');
console.log('');

// Step 3: Update WF8
console.log('Step 3: Update WF8 (Send Cron)');
const WF8_ID = 'wJLD5sFxddNNxR7p';
const wf8 = readWF('wf8-send-cron.json');
await deactivate(WF8_ID, 'WF8');
await updateWorkflow(WF8_ID, wf8, 'WF8');
await activate(WF8_ID, 'WF8');
console.log('');

// Step 4: Update WF7
console.log('Step 4: Update WF7 (Wave Scheduling)');
const WF7_ID = 'TVNOzjSnaWrmTlqw';
const wf7 = readWF('wf7-wave-schedule.json');
await deactivate(WF7_ID, 'WF7');
await updateWorkflow(WF7_ID, wf7, 'WF7');
await activate(WF7_ID, 'WF7');
console.log('');

console.log('═══ Done ═══');
console.log(`Sub-reply-check ID: ${SUB_REPLY_CHECK_ID}`);
