import fs from 'fs';
import http from 'http';
import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';

const DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/\/$/, '');
const STRIP = new Set(['pinData', 'active']);

const UPDATES = [
  { file: 'wf7-wave-schedule.json', id: 'TVNOzjSnaWrmTlqw' },
  { file: 'wf8-send-cron.json',     id: 'wJLD5sFxddNNxR7p' },
  { file: 'wf10-daily-reset.json',  id: '50Odnt5vzIMfSBZE' },
];

function putWorkflow(id, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(N8N_BASE_URL + '/api/v1/workflows/' + id);
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
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  for (const { file, id } of UPDATES) {
    const raw = JSON.parse(fs.readFileSync(DIR + '/' + file, 'utf8'));
    const payload = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!STRIP.has(k)) payload[k] = v;
    }
    try {
      const { status, body } = await putWorkflow(id, payload);
      if (status === 200 || status === 201) {
        console.log('OK  ' + file + ' -> id=' + body.id + ' name=' + body.name);
      } else {
        console.log('ERR ' + file + ' -> HTTP ' + status + ': ' + JSON.stringify(body).slice(0, 300));
      }
    } catch (e) {
      console.log('ERR ' + file + ' -> ' + e.message);
    }
  }
}

main();
