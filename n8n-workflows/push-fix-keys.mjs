/**
 * Fix: Replace SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER with real key in all
 * workflows that were pushed by push-contacts-refactor.mjs.
 *
 * Reads each workflow from n8n, replaces placeholder, PUTs back, reactivates.
 */
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const PLACEHOLDER = 'SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER';

// All workflows that push-contacts-refactor.mjs pushed with placeholders
const WORKFLOW_IDS = [
  { id: 'RNuSFAtwoEAkb9rA', name: 'WF4' },
  { id: 'E5QzxzZe4JbSv5lU', name: 'WF11' },
  { id: 'beB84wDnEG2soY1m', name: 'WF1' },
  { id: '7JzGHAG24ra3977B', name: 'WF5' },
  { id: '2i6zvyAy3j7BjaZE', name: 'WF2' },
  { id: 'nPbr15LJxGaZUqo7', name: 'WF3' },
  { id: 'EbKgRSRr2Poe34vH', name: 'WF6' },
  { id: 'TVNOzjSnaWrmTlqw', name: 'WF7' },
];

function apiCall(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE_URL + urlPath);
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fixWorkflow(wf) {
  console.log(`[${wf.name}] Fetching...`);
  const getRes = await apiCall('GET', `/api/v1/workflows/${wf.id}`);
  if (getRes.status >= 400) {
    console.error(`[${wf.name}] GET FAILED (${getRes.status})`);
    return false;
  }

  const raw = getRes.data;
  const count = (raw.match(new RegExp(PLACEHOLDER, 'g')) || []).length;
  if (count === 0) {
    console.log(`[${wf.name}] No placeholders found — skipping`);
    return true;
  }

  console.log(`[${wf.name}] Found ${count} placeholders — replacing...`);
  const fixed = raw.replace(new RegExp(PLACEHOLDER, 'g'), SUPABASE_SERVICE_ROLE_KEY);
  const parsed = JSON.parse(fixed);

  // Only keep fields allowed in PUT
  const ALLOWED = new Set(['name', 'nodes', 'connections', 'settings']);
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED.has(key)) delete parsed[key];
  }

  console.log(`[${wf.name}] Deactivating...`);
  await apiCall('POST', `/api/v1/workflows/${wf.id}/deactivate`);

  console.log(`[${wf.name}] Uploading...`);
  const putRes = await apiCall('PUT', `/api/v1/workflows/${wf.id}`, JSON.stringify(parsed));
  if (putRes.status >= 400) {
    console.error(`[${wf.name}] PUT FAILED (${putRes.status}): ${putRes.data.slice(0, 300)}`);
    return false;
  }

  console.log(`[${wf.name}] Activating...`);
  const actRes = await apiCall('POST', `/api/v1/workflows/${wf.id}/activate`);
  if (actRes.status >= 400) {
    console.error(`[${wf.name}] ACTIVATE FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    return false;
  }

  console.log(`[${wf.name}] Fixed & active!\n`);
  return true;
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
  process.exit(1);
}

let allOk = true;
for (const wf of WORKFLOW_IDS) {
  try { if (!await fixWorkflow(wf)) allOk = false; }
  catch (err) { console.error(`[${wf.name}] ERROR: ${err.message}`); allOk = false; }
}
console.log(allOk ? 'All workflows fixed!' : 'Some failed — check above.');
process.exit(allOk ? 0 : 1);
