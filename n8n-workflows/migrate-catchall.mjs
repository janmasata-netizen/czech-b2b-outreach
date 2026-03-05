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
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.log(`  ✗ ${label}: ${JSON.stringify(parsed).slice(0, 200)}`);
            resolve(false);
          } else {
            console.log(`  ✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error ${e.message}`);
          resolve(false);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

console.log('\n=== Catch-all email verification schema migration ===\n');

// 1. Add is_catch_all column to email_candidates
await runSQL(
  'Add is_catch_all column to email_candidates',
  `ALTER TABLE public.email_candidates
   ADD COLUMN IF NOT EXISTS is_catch_all boolean DEFAULT false;`
);

// 2. Add catch_all_confidence column to email_candidates
await runSQL(
  'Add catch_all_confidence column to email_candidates',
  `ALTER TABLE public.email_candidates
   ADD COLUMN IF NOT EXISTS catch_all_confidence text;`
);

// 3. Drop existing qev_status constraint
await runSQL(
  'Drop qev_status check constraint',
  `ALTER TABLE public.email_candidates
   DROP CONSTRAINT IF EXISTS email_candidates_qev_status_check;`
);

// 4. Add updated qev_status constraint with catch_all and manually_verified
await runSQL(
  'Add updated qev_status constraint (catch_all + manually_verified)',
  `ALTER TABLE public.email_candidates
   ADD CONSTRAINT email_candidates_qev_status_check
   CHECK (qev_status IN ('valid','invalid','unknown','catch_all','manually_verified'));`
);

// 5. Drop existing leads status constraint
await runSQL(
  'Drop leads status check constraint',
  `ALTER TABLE public.leads
   DROP CONSTRAINT IF EXISTS leads_status_check;`
);

// 6. Add updated leads status constraint with needs_review
await runSQL(
  'Add updated leads status constraint (needs_review)',
  `ALTER TABLE public.leads
   ADD CONSTRAINT leads_status_check
   CHECK (status IN ('new','enriching','enriched','email_discovery','email_verified',
                     'ready','in_wave','completed','replied','bounced','failed',
                     'needs_review','problematic'));`
);

console.log('\nDone.');
