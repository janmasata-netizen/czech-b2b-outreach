/**
 * Push updated WF5 (SMTP Verification) + WF11 (Website Email Scraper) to n8n
 * Fixes: - WF5: seznam_status 'likely_valid' → 'verified', explicit is_verified
 *        - WF11: Remove fullResponse:true from Fetch nodes (0-items bug),
 *                update status filters for new 'verified' status
 *
 * Run: node push-fix-wf5-wf11-verify.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKFLOWS = [
  { file: 'email-verification-subwf.json', id: 'Aov5PfwmBDv51L0e' },
  { file: 'wf5-seznam-verify.json',        id: '7JzGHAG24ra3977B' },
  { file: 'wf11-website-fallback.json',     id: 'E5QzxzZe4JbSv5lU' },
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
  let rawStr = fs.readFileSync(path.join(__dirname, wf.file), 'utf8');
  rawStr = rawStr.replace(/SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER/g, SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(rawStr);
  delete raw.pinData; delete raw.active; delete raw.id; delete raw.staticData; delete raw.meta;
  delete raw.updatedAt; delete raw.createdAt; delete raw.isArchived; delete raw.shared;
  delete raw.tags; delete raw.versionId; delete raw.activeVersionId; delete raw.versionCounter;
  delete raw.triggerCount; delete raw.activeVersion; delete raw.description;
  if (raw.settings) delete raw.settings.availableInMCP;

  console.log(`[${wf.file}] Deactivating...`);
  await apiCall('POST', `/api/v1/workflows/${wf.id}/deactivate`);

  console.log(`[${wf.file}] Uploading...`);
  const putRes = await apiCall('PUT', `/api/v1/workflows/${wf.id}`, JSON.stringify(raw));
  if (putRes.status >= 400) {
    console.error(`[${wf.file}] PUT FAILED (${putRes.status}): ${putRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${wf.file}] PUT OK`);

  console.log(`[${wf.file}] Activating...`);
  const actRes = await apiCall('POST', `/api/v1/workflows/${wf.id}/activate`);
  if (actRes.status >= 400) {
    console.error(`[${wf.file}] ACTIVATE FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`[${wf.file}] Active!`);
}

async function main() {
  for (const wf of WORKFLOWS) {
    await pushWorkflow(wf);
  }
  console.log('\nAll workflows pushed successfully.');
}

main();
