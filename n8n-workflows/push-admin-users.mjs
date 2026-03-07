// push-admin-users.mjs — Import wf-admin-users.json to n8n and activate it
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function apiCall(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE_URL + urlPath);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
    };
    const req = http.request(options, (res) => {
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
  const filePath = path.join(__dirname, 'wf-admin-users.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Strip fields that cause issues on import
  delete raw.pinData;
  delete raw.active;
  delete raw.id;
  delete raw.tags;

  console.log('Importing wf-admin-users.json...');
  const importRes = await apiCall('POST', '/api/v1/workflows', JSON.stringify(raw));

  if (importRes.status >= 400) {
    console.error(`Import FAILED (${importRes.status}): ${importRes.data.slice(0, 300)}`);
    process.exit(1);
  }

  const wfData = JSON.parse(importRes.data);
  const wfId = wfData.id;
  console.log(`Imported! ID: ${wfId}`);

  // Activate
  console.log('Activating...');
  const actRes = await apiCall('POST', `/api/v1/workflows/${wfId}/activate`);
  if (actRes.status >= 400) {
    console.error(`Activate FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    process.exit(1);
  }

  console.log(`wf-admin-users active! ID: ${wfId}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
