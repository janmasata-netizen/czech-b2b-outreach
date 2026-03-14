import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WF5 = { file: 'wf5-seznam-verify.json', id: '7JzGHAG24ra3977B' };
const WF11 = { file: 'wf11-website-fallback.json', id: 'E5QzxzZe4JbSv5lU' };
const WF6_ID = 'EbKgRSRr2Poe34vH';

function apiCall(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE_URL + urlPath);
    const req = http.request({
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function pushWorkflow(wf) {
  let rawStr = fs.readFileSync(path.join(__dirname, wf.file), 'utf8');
  rawStr = rawStr.replace(/SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER/g, SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(rawStr);
  delete raw.pinData; delete raw.active; delete raw.id; delete raw.staticData; delete raw.meta;
  if (raw.settings) delete raw.settings.availableInMCP;

  console.log(`[${wf.file}] Deactivating...`);
  await apiCall('POST', `/api/v1/workflows/${wf.id}/deactivate`);

  console.log(`[${wf.file}] Uploading...`);
  const putRes = await apiCall('PUT', `/api/v1/workflows/${wf.id}`, JSON.stringify(raw));
  if (putRes.status >= 400) {
    console.error(`[${wf.file}] PUT FAILED (${putRes.status}): ${putRes.data.slice(0, 300)}`);
    return false;
  }
  console.log(`[${wf.file}] PUT OK`);

  console.log(`[${wf.file}] Activating...`);
  const actRes = await apiCall('POST', `/api/v1/workflows/${wf.id}/activate`);
  if (actRes.status >= 400) {
    console.error(`[${wf.file}] ACTIVATE FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    return false;
  }
  console.log(`[${wf.file}] Active!\n`);
  return true;
}

async function main() {
  let allOk = true;

  // 1. Push WF5 (SMTP-only verification)
  try { if (!await pushWorkflow(WF5)) allOk = false; }
  catch (err) { console.error(`[${WF5.file}] ERROR: ${err.message}`); allOk = false; }

  // 2. Push WF11 (website scraper + final status)
  try { if (!await pushWorkflow(WF11)) allOk = false; }
  catch (err) { console.error(`[${WF11.file}] ERROR: ${err.message}`); allOk = false; }

  // 3. Deactivate WF6 (QEV verify — no callers remain)
  console.log('[wf6-qev-verify] Deactivating...');
  try {
    const res = await apiCall('POST', `/api/v1/workflows/${WF6_ID}/deactivate`);
    if (res.status >= 400) {
      console.error(`[wf6-qev-verify] DEACTIVATE FAILED (${res.status}): ${res.data.slice(0, 300)}`);
      allOk = false;
    } else {
      console.log('[wf6-qev-verify] Deactivated!\n');
    }
  } catch (err) {
    console.error(`[wf6-qev-verify] ERROR: ${err.message}`);
    allOk = false;
  }

  console.log(allOk ? 'All done — WF5 + WF11 deployed, WF6 deactivated!' : 'Some operations failed — check above.');
  process.exit(allOk ? 0 : 1);
}

main();
