import fs from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';

const DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/\/$/, '');
const STRIP = new Set(['pinData', 'active']);

const FILES = [
  'wf1-lead-ingest.json',
  'wf2-ares-lookup.json',
  'wf3-kurzy-scrape.json',
  'wf4-email-gen.json',
  'wf5-seznam-verify.json',
  'wf6-qev-verify.json',
  'wf7-wave-schedule.json',
  'wf8-send-cron.json',
  'wf9-reply-detection.json',
  'wf10-daily-reset.json',
];

function postWorkflow(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(N8N_BASE_URL + '/api/v1/workflows');
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  for (const fname of FILES) {
    const raw = JSON.parse(fs.readFileSync(DIR + '/' + fname, 'utf8'));
    const payload = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!STRIP.has(k)) payload[k] = v;
    }
    try {
      const { status, body } = await postWorkflow(payload);
      if (status === 200 || status === 201) {
        console.log('OK  ' + fname + ' -> id=' + body.id + ' name=' + body.name);
      } else {
        console.log('ERR ' + fname + ' -> HTTP ' + status + ': ' + body.message);
      }
    } catch (e) {
      console.log('ERR ' + fname + ' -> ' + e.message);
    }
  }
}

main();
