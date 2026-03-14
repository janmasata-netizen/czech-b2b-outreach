/**
 * Push updated WF2 (ARES IČO Lookup) to n8n
 * Fixes: Leads without IČO but with domain skip to WF4 instead of failing
 *
 * Run: node push-fix-wf2-no-ico.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WF2 = { file: 'wf2-ares-lookup.json', id: '2i6zvyAy3j7BjaZE' };

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

async function main() {
  let rawStr = fs.readFileSync(path.join(__dirname, WF2.file), 'utf8');
  rawStr = rawStr.replace(/SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER/g, SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(rawStr);
  delete raw.pinData; delete raw.active; delete raw.id; delete raw.staticData; delete raw.meta;
  if (raw.settings) delete raw.settings.availableInMCP;

  console.log(`[${WF2.file}] Deactivating...`);
  await apiCall('POST', `/api/v1/workflows/${WF2.id}/deactivate`);

  console.log(`[${WF2.file}] Uploading...`);
  const putRes = await apiCall('PUT', `/api/v1/workflows/${WF2.id}`, JSON.stringify(raw));
  if (putRes.status >= 400) {
    console.error(`[${WF2.file}] PUT FAILED (${putRes.status}): ${putRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${WF2.file}] PUT OK`);

  console.log(`[${WF2.file}] Activating...`);
  const actRes = await apiCall('POST', `/api/v1/workflows/${WF2.id}/activate`);
  if (actRes.status >= 400) {
    console.error(`[${WF2.file}] ACTIVATE FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${WF2.file}] Active! Done.`);
}

main();
