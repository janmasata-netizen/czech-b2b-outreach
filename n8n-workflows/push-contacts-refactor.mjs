import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKFLOWS = [
  { file: 'wf4-email-gen.json',        id: 'RNuSFAtwoEAkb9rA' },
  { file: 'wf11-website-fallback.json', id: 'E5QzxzZe4JbSv5lU' },
  { file: 'wf1-lead-ingest.json',      id: 'beB84wDnEG2soY1m' },
  { file: 'wf5-seznam-verify.json',    id: '7JzGHAG24ra3977B' },
  { file: 'wf2-ares-lookup.json',      id: '2i6zvyAy3j7BjaZE' },
  { file: 'wf3-kurzy-scrape.json',     id: 'nPbr15LJxGaZUqo7' },
  { file: 'wf6-qev-verify.json',       id: 'EbKgRSRr2Poe34vH' },
  { file: 'wf7-wave-schedule.json',    id: 'TVNOzjSnaWrmTlqw' },
];

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
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, wf.file), 'utf8'));
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

let allOk = true;
for (const wf of WORKFLOWS) {
  try { if (!await pushWorkflow(wf)) allOk = false; }
  catch (err) { console.error(`[${wf.file}] ERROR: ${err.message}`); allOk = false; }
}
console.log(allOk ? 'All 8 workflows deployed!' : 'Some failed — check above.');
process.exit(allOk ? 0 : 1);
