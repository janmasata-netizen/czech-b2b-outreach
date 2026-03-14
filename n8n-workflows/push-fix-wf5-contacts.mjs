/**
 * Push updated WF5 (SMTP Verification) to n8n
 * Fixes: "Get Contacts" node now uses get_contacts_for_lead() RPC
 *        instead of broken Supabase node filtering by non-existent lead_id column
 *
 * Run: node push-fix-wf5-contacts.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WF5 = { file: 'wf5-seznam-verify.json', id: '7JzGHAG24ra3977B' };

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
  let rawStr = fs.readFileSync(path.join(__dirname, WF5.file), 'utf8');
  rawStr = rawStr.replace(/SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER/g, SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(rawStr);
  delete raw.pinData; delete raw.active; delete raw.id; delete raw.staticData; delete raw.meta;
  if (raw.settings) delete raw.settings.availableInMCP;

  console.log(`[${WF5.file}] Deactivating...`);
  await apiCall('POST', `/api/v1/workflows/${WF5.id}/deactivate`);

  console.log(`[${WF5.file}] Uploading...`);
  const putRes = await apiCall('PUT', `/api/v1/workflows/${WF5.id}`, JSON.stringify(raw));
  if (putRes.status >= 400) {
    console.error(`[${WF5.file}] PUT FAILED (${putRes.status}): ${putRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${WF5.file}] PUT OK`);

  console.log(`[${WF5.file}] Activating...`);
  const actRes = await apiCall('POST', `/api/v1/workflows/${WF5.id}/activate`);
  if (actRes.status >= 400) {
    console.error(`[${WF5.file}] ACTIVATE FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${WF5.file}] Active! Done.`);
}

main();
