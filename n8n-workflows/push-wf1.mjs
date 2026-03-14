import fs from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const DIR = decodeURIComponent(new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/\/$/, ''));
const STRIP = new Set(['pinData', 'active', 'id', 'staticData', 'meta']);

const WF = { file: 'wf1-lead-ingest.json', id: 'beB84wDnEG2soY1m' };

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
  // Read and replace placeholders with real keys
  let rawStr = fs.readFileSync(DIR + '/' + WF.file, 'utf8');
  rawStr = rawStr.replace(/SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER/g, SUPABASE_SERVICE_ROLE_KEY);
  const raw = JSON.parse(rawStr);

  const payload = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!STRIP.has(k)) payload[k] = v;
  }
  if (payload.settings) delete payload.settings.availableInMCP;

  try {
    // Deactivate
    console.log('[' + WF.file + '] Deactivating...');
    await apiCall('POST', '/api/v1/workflows/' + WF.id + '/deactivate');

    // Upload
    console.log('[' + WF.file + '] Uploading...');
    const putRes = await apiCall('PUT', '/api/v1/workflows/' + WF.id, JSON.stringify(payload));
    if (putRes.status >= 400) {
      console.error('[' + WF.file + '] PUT FAILED (' + putRes.status + '): ' + putRes.data.slice(0, 300));
      process.exit(1);
    }
    console.log('[' + WF.file + '] PUT OK');

    // Activate
    console.log('[' + WF.file + '] Activating...');
    const actRes = await apiCall('POST', '/api/v1/workflows/' + WF.id + '/activate');
    if (actRes.status >= 400) {
      console.error('[' + WF.file + '] ACTIVATE FAILED (' + actRes.status + '): ' + actRes.data.slice(0, 300));
      process.exit(1);
    }
    console.log('[' + WF.file + '] Active!');
  } catch (e) {
    console.error('[' + WF.file + '] ERROR: ' + e.message);
    process.exit(1);
  }
}

main();
