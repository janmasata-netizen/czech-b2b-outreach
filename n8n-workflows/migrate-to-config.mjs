import fs from 'fs';
import https from 'https';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL, SUPABASE_URL, SUPABASE_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

// ── constants ──────────────────────────────────────────────────────────────
const DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/\/$/, '');
const WF_IDS = {
  'wf1-lead-ingest.json':    'beB84wDnEG2soY1m',
  'wf2-ares-lookup.json':    '2i6zvyAy3j7BjaZE',
  'wf3-kurzy-scrape.json':   'nPbr15LJxGaZUqo7',
  'wf4-email-gen.json':      'RNuSFAtwoEAkb9rA',
  'wf5-seznam-verify.json':  '7JzGHAG24ra3977B',
  'wf6-qev-verify.json':     'EbKgRSRr2Poe34vH',
  'wf7-wave-schedule.json':  'TVNOzjSnaWrmTlqw',
  'wf8-send-cron.json':      'wJLD5sFxddNNxR7p',
  'wf9-reply-detection.json':'AaHXknYh9egPDxcG',
  'wf10-daily-reset.json':   '50Odnt5vzIMfSBZE',
};

const STRIP = new Set(['pinData', 'active']);

// ── http helpers ───────────────────────────────────────────────────────────
function runSQL(label, query) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (res.statusCode >= 400) {
          console.log(`  ✗ ${label}: ${JSON.stringify(parsed).slice(0, 150)}`);
          resolve(false);
        } else {
          console.log(`  ✓ ${label}`);
          resolve(true);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

function putWorkflow(id, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(`${N8N_BASE_URL}/api/v1/workflows/${id}`);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── step 1: create config table ────────────────────────────────────────────
console.log('\n=== Step 1: Create config table in Supabase ===');
await runSQL('Create config table', `
  CREATE TABLE IF NOT EXISTS public.config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
  );
`);
await runSQL('Seed config rows', `
  INSERT INTO public.config (key, value) VALUES
    ('seznam_from_email', 'PLACEHOLDER'),
    ('qev_api_key',       'PLACEHOLDER')
  ON CONFLICT (key) DO NOTHING;
`);

// ── helper: build a Supabase GET config node ───────────────────────────────
function makeConfigNode(id, name, configKey, position) {
  return {
    parameters: {
      method: 'GET',
      url: `${SUPABASE_URL}/rest/v1/config`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey',         value: SUPABASE_SERVICE_ROLE_KEY },
          { name: 'Authorization',  value: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        ]
      },
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'select', value: 'key,value' },
          { name: 'key',    value: `eq.${configKey}` },
          { name: 'limit',  value: '1' },
        ]
      },
      options: { timeout: 30000, fullResponse: true, neverError: true }
    },
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
  };
}

// ── step 2: patch each workflow JSON ───────────────────────────────────────
console.log('\n=== Step 2: Patch workflow JSON files ===');

for (const [fname, wfId] of Object.entries(WF_IDS)) {
  const path = `${DIR}/${fname}`;
  if (!fs.existsSync(path)) {
    console.log(`  SKIP ${fname} (file not found)`);
    continue;
  }

  let wf = JSON.parse(fs.readFileSync(path, 'utf8'));

  // ── WF5: add "Get Config SEZNAM" node between "Get Pending Candidates" and "Flatten Candidates"
  if (fname === 'wf5-seznam-verify.json') {
    const configNode = makeConfigNode(
      'wf05-conf-seznam-0000-000000000001',
      'Get Config SEZNAM',
      'seznam_from_email',
      [720, 300]  // between Get Pending Candidates(480) and Flatten Candidates(720→960)
    );
    // Shift positions of downstream nodes to make room
    for (const node of wf.nodes) {
      if (['Flatten Candidates','Log Started','Loop Send Emails','Send Test Email',
           'Mark Sent','Wait 3 Minutes','Check Bounces IMAP','Extract Bounced Emails',
           'Classify Candidates','Loop Update Candidates','Update Candidate Status',
           'Log Success','Trigger WF6'].includes(node.name)) {
        node.position[0] += 240;
      }
    }
    wf.nodes.push(configNode);

    // Update fromEmail in "Send Test Email"
    const sendNode = wf.nodes.find(n => n.name === 'Send Test Email');
    if (sendNode) {
      sendNode.parameters.fromEmail = "={{ $('Get Config SEZNAM').first().json.body[0].value }}";
    }

    // Rewire connections: Get Pending Candidates → Get Config SEZNAM → Flatten Candidates
    wf.connections['Get Pending Candidates'] = {
      main: [[{ node: 'Get Config SEZNAM', type: 'main', index: 0 }]]
    };
    wf.connections['Get Config SEZNAM'] = {
      main: [[{ node: 'Flatten Candidates', type: 'main', index: 0 }]]
    };
  }

  // ── WF6: add "Get Config QEV" node between "Get Likely Valid Candidates" and "Flatten Candidates"
  if (fname === 'wf6-qev-verify.json') {
    const configNode = makeConfigNode(
      'wf06-conf-qev-00000-000000000001',
      'Get Config QEV',
      'qev_api_key',
      [720, 300]
    );
    // Shift downstream nodes
    for (const node of wf.nodes) {
      if (['Flatten Candidates','Log Started','Loop Candidates','QEV API Call',
           'Evaluate QEV Result','Update Candidate QEV','Count Verified Emails',
           'Check Verified Count','IF Has Verified','Set Lead Ready','Log Success',
           'Set Lead Failed','Log Failed'].includes(node.name)) {
        node.position[0] += 240;
      }
    }
    wf.nodes.push(configNode);

    // Update QEV API Call apikey param
    const qevNode = wf.nodes.find(n => n.name === 'QEV API Call');
    if (qevNode) {
      const params = qevNode.parameters.queryParameters.parameters;
      const apikeyParam = params.find(p => p.name === 'apikey');
      if (apikeyParam) {
        apikeyParam.value = "={{ $('Get Config QEV').first().json.body[0].value }}";
      }
    }

    // Rewire connections
    wf.connections['Get Likely Valid Candidates'] = {
      main: [[{ node: 'Get Config QEV', type: 'main', index: 0 }]]
    };
    wf.connections['Get Config QEV'] = {
      main: [[{ node: 'Flatten Candidates', type: 'main', index: 0 }]]
    };
  }

  // ── Apply text replacements on the stringified JSON ──────────────────────
  let text = JSON.stringify(wf, null, 2);

  // SUPABASE_URL in n8n expression URLs  →  hardcoded static URL (drop the = prefix)
  text = text.replaceAll('={{ $env.SUPABASE_URL }}/', `${SUPABASE_URL}/`);

  // SUPABASE_SERVICE_KEY as standalone value
  text = text.replaceAll('={{ $env.SUPABASE_SERVICE_KEY }}"', `${SUPABASE_SERVICE_ROLE_KEY}"`);

  // SUPABASE_SERVICE_KEY in Bearer header
  text = text.replaceAll('=Bearer {{ $env.SUPABASE_SERVICE_KEY }}"', `Bearer ${SUPABASE_SERVICE_ROLE_KEY}"`);

  // N8N_BASE_URL webhook triggers
  text = text.replaceAll('={{ $env.N8N_BASE_URL }}/webhook/', `${N8N_BASE_URL}/webhook/`);

  fs.writeFileSync(path, text, 'utf8');
  console.log(`  ✓ ${fname}`);
}

// ── step 3: push all workflows to n8n ─────────────────────────────────────
console.log('\n=== Step 3: Push all workflows to n8n ===');

for (const [fname, wfId] of Object.entries(WF_IDS)) {
  const path = `${DIR}/${fname}`;
  if (!fs.existsSync(path)) {
    console.log(`  SKIP ${fname}`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  const payload = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!STRIP.has(k)) payload[k] = v;
  }
  try {
    const { status, body } = await putWorkflow(wfId, payload);
    if (status === 200 || status === 201) {
      console.log(`  ✓ ${fname} → ${body.name}`);
    } else {
      console.log(`  ✗ ${fname} HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  ✗ ${fname}: ${e.message}`);
  }
}

console.log('\nDone.');
