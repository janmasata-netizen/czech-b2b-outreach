import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

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
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.log(`✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 400));
            resolve(false);
          } else {
            console.log(`✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`✗ ${label}: parse error -`, data.slice(0, 200));
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { console.log(`✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

const steps = [

  // ── 1. Add IMAP credential columns to salesmen ────────────────────────────────
  ['Add IMAP columns to salesmen', `
    ALTER TABLE public.salesmen
      ADD COLUMN IF NOT EXISTS imap_host text,
      ADD COLUMN IF NOT EXISTS imap_port integer DEFAULT 993,
      ADD COLUMN IF NOT EXISTS imap_secure boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS imap_user text,
      ADD COLUMN IF NOT EXISTS imap_password text;
  `],

  // ── 2. Create salesmen_safe view (excludes imap_password) ────────────────────
  ['Create salesmen_safe view', `
    CREATE OR REPLACE VIEW public.salesmen_safe AS
      SELECT id, team_id, name, email, imap_credential_name,
             imap_host, imap_port, imap_secure, imap_user,
             is_active, created_at
      FROM public.salesmen;
  `],

];

console.log(`Running imap-credentials migration on ${SUPABASE_PROJECT_REF}...\n`);
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
