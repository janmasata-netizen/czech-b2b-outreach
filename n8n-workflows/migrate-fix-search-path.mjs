/**
 * migrate-fix-search-path.mjs
 * Re-applies SET search_path = public to auto_complete_waves()
 * to fix security regression.
 */

import https from 'https';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

const SQL = `
-- Fix security regression: ensure auto_complete_waves uses public schema
ALTER FUNCTION public.auto_complete_waves() SET search_path = public;
`;

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL('/rest/v1/rpc/exec_sql', SUPABASE_URL);
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${data.slice(0, 300)}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Fix auto_complete_waves() search_path ===\n');
  console.log('SQL:', SQL.trim());

  try {
    const result = await runSQL(SQL);
    console.log('\nResult:', result);
    console.log('\nDone!');
  } catch (err) {
    console.error('\nRPC exec_sql not available. Run this SQL manually in Supabase SQL Editor:');
    console.error(SQL);
    console.error('\nError:', err.message);
    process.exit(1);
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
