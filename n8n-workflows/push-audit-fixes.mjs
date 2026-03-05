// push-audit-fixes.mjs — Deploy audit fix workflows (WF7, WF8, WF10, wf-force-send)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKFLOWS = [
  { file: 'wf7-wave-schedule.json',  id: 'TVNOzjSnaWrmTlqw' },
  { file: 'wf8-send-cron.json',      id: 'wJLD5sFxddNNxR7p' },
  { file: 'wf10-daily-reset.json',   id: '50Odnt5vzIMfSBZE' },
  { file: 'wf-force-send.json',      id: 'DPmnV2dRsbBMLAmz' },
];

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

async function pushWorkflow(wf) {
  const filePath = path.join(__dirname, wf.file);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Strip fields that cause issues on PUT
  delete raw.pinData;
  delete raw.active;
  delete raw.id;

  // Step 1: Deactivate
  console.log(`[${wf.file}] Deactivating...`);
  await apiCall('POST', `/api/v1/workflows/${wf.id}/deactivate`);

  // Step 2: PUT updated workflow
  console.log(`[${wf.file}] Uploading...`);
  const putRes = await apiCall('PUT', `/api/v1/workflows/${wf.id}`, JSON.stringify(raw));
  if (putRes.status >= 400) {
    console.error(`[${wf.file}] PUT FAILED (${putRes.status}): ${putRes.data.slice(0, 300)}`);
    return false;
  }
  console.log(`[${wf.file}] PUT OK (${putRes.status})`);

  // Step 3: Reactivate
  console.log(`[${wf.file}] Activating...`);
  const actRes = await apiCall('POST', `/api/v1/workflows/${wf.id}/activate`);
  if (actRes.status >= 400) {
    console.error(`[${wf.file}] ACTIVATE FAILED (${actRes.status}): ${actRes.data.slice(0, 300)}`);
    return false;
  }
  console.log(`[${wf.file}] Active!`);
  return true;
}

(async () => {
  let allOk = true;
  for (const wf of WORKFLOWS) {
    try {
      const ok = await pushWorkflow(wf);
      if (!ok) allOk = false;
    } catch (err) {
      console.error(`[${wf.file}] ERROR: ${err.message}`);
      allOk = false;
    }
  }
  console.log(allOk ? '\nAll workflows deployed successfully!' : '\nSome workflows failed — check output above.');
  process.exit(allOk ? 0 : 1);
})();
