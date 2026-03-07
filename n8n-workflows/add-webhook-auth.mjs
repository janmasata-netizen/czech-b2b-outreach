// add-webhook-auth.mjs — Add headerAuth to all webhook nodes + auth header to internal calls
// Step 1: Creates httpHeaderAuth credential in n8n via API
// Step 2: Patches webhook nodes in all workflow JSONs to require headerAuth
// Step 3: Patches HTTP Request nodes that call internal webhooks to include the auth header
// Step 4: Pushes all modified workflows to n8n (deactivate → PUT → activate)
//
// Usage: WEBHOOK_SECRET=<secret> node add-webhook-auth.mjs
//   or:  node add-webhook-auth.mjs  (auto-generates secret)

import fs from 'fs';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HEADER_NAME = 'X-Webhook-Secret';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(24).toString('base64url');

// Map of webhook path → n8n workflow ID (from CLAUDE.md)
const WORKFLOW_IDS = {
  'wf1-lead-ingest.json':        'beB84wDnEG2soY1m',
  'wf2-ares-lookup.json':        '2i6zvyAy3j7BjaZE',
  'wf3-kurzy-scrape.json':       'nPbr15LJxGaZUqo7',
  'wf4-email-gen.json':          'RNuSFAtwoEAkb9rA',
  'wf5-seznam-verify.json':      '7JzGHAG24ra3977B',
  'wf5-combined-verify.json':    '7JzGHAG24ra3977B', // same ID if it replaced wf5
  'wf6-qev-verify.json':         'EbKgRSRr2Poe34vH',
  'wf7-wave-schedule.json':      'TVNOzjSnaWrmTlqw',
  'wf11-website-fallback.json':  'E5QzxzZe4JbSv5lU',
  'wf12-ico-scrape.json':        'LGEe4MTELj5lmOFX',
  'wf13-gsheet-proxy.json':      'ENcE8iMWLNwIPc5a',
  'wf-email-finder.json':        'N3cuyKRHS4wEyOwq',
  'wf-email-finder-v2.json':     '6sc6c0ZSuglJ548A',
  'wf-force-send.json':          'DPmnV2dRsbBMLAmz',
  'wf-backfill-salutations.json':'xbJfPwwNRIBtFtAX',
  'sub-burner-probe.json':       '9J5svDvgXBkZtOLX',
  'wf-admin-users.json':         null, // will be set after import
  'wf-imap-folder-probe.json':   null,
  'wf-spam-folder-test.json':    null,
};

function apiCall(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE_URL + urlPath);
    const options = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Webhook Auth Setup ===\n');
  console.log(`Secret: ${WEBHOOK_SECRET}`);
  console.log(`Header: ${HEADER_NAME}\n`);

  // Step 1: Create httpHeaderAuth credential
  console.log('Step 1: Creating httpHeaderAuth credential in n8n...');
  const credPayload = {
    name: 'Webhook Header Auth',
    type: 'httpHeaderAuth',
    data: { name: HEADER_NAME, value: WEBHOOK_SECRET },
  };
  const credRes = await apiCall('POST', '/api/v1/credentials', JSON.stringify(credPayload));
  if (credRes.status >= 400) {
    console.error(`Failed (${credRes.status}): ${credRes.data.slice(0, 300)}`);
    console.error('If credential already exists, delete it in n8n UI first, or set WEBHOOK_SECRET env var to match existing.');
    process.exit(1);
  }
  const cred = JSON.parse(credRes.data);
  console.log(`Created credential ID: ${cred.id}\n`);

  const credRef = { httpHeaderAuth: { id: cred.id, name: cred.name } };

  // Step 2: Patch all workflow JSONs
  console.log('Step 2: Patching workflow JSON files...');
  const allFiles = fs.readdirSync(__dirname).filter(f =>
    f.endsWith('.json') && !f.startsWith('package') && !f.startsWith('_')
  );

  const modifiedFiles = [];
  for (const file of allFiles) {
    const filePath = path.join(__dirname, file);
    const wf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let modified = false;

    for (const node of (wf.nodes || [])) {
      // Patch webhook nodes to require headerAuth
      if (node.type === 'n8n-nodes-base.webhook') {
        node.parameters.authentication = 'headerAuth';
        node.credentials = { ...node.credentials, ...credRef };
        modified = true;
      }

      // Patch HTTP Request nodes that call internal webhooks
      if (node.type === 'n8n-nodes-base.httpRequest') {
        const url = node.parameters?.url || '';
        if (url.includes('/webhook/') && (url.includes('32770') || url.includes('72.62.53.244'))) {
          // Add auth header to the request
          node.parameters.sendHeaders = true;
          const existingParams = node.parameters.headerParameters?.parameters || [];
          // Check if header already exists
          const hasAuth = existingParams.some(p => p.name === HEADER_NAME);
          if (!hasAuth) {
            existingParams.push({ name: HEADER_NAME, value: WEBHOOK_SECRET });
            node.parameters.headerParameters = { parameters: existingParams };
          }
          modified = true;
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(wf, null, 2) + '\n');
      console.log(`  Patched: ${file}`);
      modifiedFiles.push(file);
    }
  }

  // Step 3: Push all modified workflows to n8n
  console.log(`\nStep 3: Pushing ${modifiedFiles.length} modified workflows to n8n...`);

  // First, get all workflow IDs from n8n
  const listRes = await apiCall('GET', '/api/v1/workflows');
  let existingWorkflows = {};
  if (listRes.status === 200) {
    const list = JSON.parse(listRes.data);
    for (const wf of (list.data || list)) {
      existingWorkflows[wf.name] = wf.id;
    }
  }

  for (const file of modifiedFiles) {
    const filePath = path.join(__dirname, file);
    const wf = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Find workflow ID — from our map or from n8n's list
    let wfId = WORKFLOW_IDS[file] || existingWorkflows[wf.name];
    if (!wfId) {
      console.log(`  SKIP ${file} — no known workflow ID`);
      continue;
    }

    const payload = { ...wf };
    delete payload.pinData;
    delete payload.active;
    delete payload.id;

    try {
      // Deactivate
      await apiCall('POST', `/api/v1/workflows/${wfId}/deactivate`);
      // PUT
      const putRes = await apiCall('PUT', `/api/v1/workflows/${wfId}`, JSON.stringify(payload));
      if (putRes.status >= 400) {
        console.log(`  FAIL ${file} PUT (${putRes.status}): ${putRes.data.slice(0, 200)}`);
        continue;
      }
      // Activate
      await apiCall('POST', `/api/v1/workflows/${wfId}/activate`);
      console.log(`  OK ${file} (${wfId})`);
    } catch (err) {
      console.log(`  ERR ${file}: ${err.message}`);
    }
  }

  console.log('\n=== Done ===');
  console.log(`\nAdd to .env.local:\n  WEBHOOK_SECRET=${WEBHOOK_SECRET}`);
  console.log(`  VITE_WEBHOOK_SECRET=${WEBHOOK_SECRET}`);
  console.log(`\nUI fetch calls must include: headers: { '${HEADER_NAME}': import.meta.env.VITE_WEBHOOK_SECRET }`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
