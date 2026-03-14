/**
 * migrate-extract-live-functions.mjs
 * Extracts live DB function definitions from Supabase and saves them
 * to version-controlled SQL files for reproducibility.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'db-functions');

const FUNCTIONS_TO_EXTRACT = [
  'claim_queued_emails',
  'increment_and_check_sends',
  'auto_complete_waves',
  'reset_daily_sends',
  'handle_lead_reply',
  'get_dashboard_stats',
  'ingest_lead',
];

function supabaseRequest(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${SUPABASE_PROJECT_REF}.supabase.co`,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${data.slice(0, 200)}`));
        else resolve(JSON.parse(data || '{}'));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function extractViaSQL(functionName) {
  // Use the Supabase SQL endpoint to extract function definition
  const sql = `SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = '${functionName}'
    LIMIT 1;`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: `${SUPABASE_PROJECT_REF}.supabase.co`,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_MANAGEMENT_TOKEN,
        'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          // exec_sql might not exist, try alternative approach
          resolve(null);
        } else {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch {
            resolve(null);
          }
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Extract Live DB Functions ===\n');

  mkdirSync(OUT_DIR, { recursive: true });

  // Try Supabase Management API first
  let usedManagementApi = false;
  try {
    const resp = await supabaseRequest('GET', '/rest/v1/');
    console.log('Connected to Supabase.\n');
  } catch {
    console.log('Note: Could not connect via Management API. Will attempt SQL extraction.\n');
  }

  for (const fn of FUNCTIONS_TO_EXTRACT) {
    console.log(`Extracting: ${fn}...`);
    const result = await extractViaSQL(fn);
    if (result && Array.isArray(result) && result[0]?.definition) {
      const sql = result[0].definition + ';';
      const outFile = join(OUT_DIR, `${fn}.sql`);
      writeFileSync(outFile, sql, 'utf-8');
      console.log(`  Saved to db-functions/${fn}.sql`);
    } else {
      console.log(`  Could not extract ${fn} — function may need manual extraction via psql or Supabase SQL Editor.`);
      // Write a placeholder
      const outFile = join(OUT_DIR, `${fn}.sql`);
      writeFileSync(outFile, `-- TODO: Extract ${fn}() definition from Supabase SQL Editor\n-- Run: SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = '${fn}';\n`, 'utf-8');
      console.log(`  Wrote placeholder to db-functions/${fn}.sql`);
    }
  }

  console.log('\nDone! Check n8n-workflows/db-functions/ for extracted SQL.');
  console.log('If placeholders were created, run the extraction query in Supabase SQL Editor.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
