/**
 * Migration: Add type, confidence, source columns to email_candidates
 * + backfill existing candidates with type='jednatel' where contact_id is set
 *
 * Run once: node migrate-fix-email-type.mjs
 */
import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

function runSQL(label, query) {
  return new Promise((resolve, reject) => {
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
            console.log(`✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 300));
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
  ['Add type column to email_candidates', `
    ALTER TABLE public.email_candidates
      ADD COLUMN IF NOT EXISTS type text;
  `],

  ['Add confidence column to email_candidates', `
    ALTER TABLE public.email_candidates
      ADD COLUMN IF NOT EXISTS confidence text;
  `],

  ['Add source column to email_candidates', `
    ALTER TABLE public.email_candidates
      ADD COLUMN IF NOT EXISTS source text;
  `],

  ['Backfill type=jednatel for candidates with contact_id', `
    UPDATE public.email_candidates
      SET type = 'jednatel'
      WHERE contact_id IS NOT NULL AND type IS NULL;
  `],
];

console.log('Running email_candidates type/confidence/source migration...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
