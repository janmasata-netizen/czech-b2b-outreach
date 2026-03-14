/**
 * Push updated WF11 (Website Email Scraper) to n8n
 * Fixes: Determine Status nodes now default to 'ready' for SMTP-verified emails without type
 *
 * Run: node push-fix-wf11-status.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WF11 = { file: 'wf11-website-fallback.json', id: 'E5QzxzZe4JbSv5lU' };

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
  let rawStr = fs.readFileSync(path.join(__dirname, WF11.file), 'utf8');
  rawStr = rawStr.replace(/SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER/g, SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(rawStr);
  delete raw.pinData; delete raw.active; delete raw.id; delete raw.staticData; delete raw.meta;
  if (raw.settings) delete raw.settings.availableInMCP;

  console.log(`[${WF11.file}] Deactivating...`);
  await apiCall('POST', `/api/v1/workflows/${WF11.id}/deactivate`);

  console.log(`[${WF11.file}] Uploading...`);
  const putRes = await apiCall('PUT', `/api/v1/workflows/${WF11.id}`, JSON.stringify(raw));
  if (putRes.status >= 400) {
    console.error(`[${WF11.file}] PUT FAILED (${putRes.status}): ${putRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${WF11.file}] PUT OK`);

  console.log(`[${WF11.file}] Activating...`);
  const actRes = await apiCall('POST', `/api/v1/workflows/${WF11.id}/activate`);
  if (actRes.status >= 400) {
    console.error(`[${WF11.file}] ACTIVATE FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${WF11.file}] Active! Done.`);
}

main();
