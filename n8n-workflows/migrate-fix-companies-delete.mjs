/**
 * migrate-fix-companies-delete.mjs
 * Adds missing DELETE RLS policy on companies table and fixes
 * leads.company_id FK to ON DELETE SET NULL.
 *
 * Run once: node migrate-fix-companies-delete.mjs
 */

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
            console.log(`  ✗ ${label}: ${JSON.stringify(parsed).slice(0, 400)}`);
            resolve(false);
          } else {
            console.log(`  ✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error — ${data.slice(0, 200)}`);
          resolve(false);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('\n=== Fix: Add DELETE RLS policy on companies ===');

  // 1. Add missing DELETE policy (matching SELECT/INSERT/UPDATE pattern)
  await runSQL('RLS: authenticated delete', `
    CREATE POLICY companies_delete ON public.companies
    FOR DELETE TO authenticated
    USING (
      team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  `);

  // 2. Fix leads.company_id FK to ON DELETE SET NULL
  // (contacts.company_id and company_tags.company_id already have ON DELETE CASCADE)
  // leads.company_id → ON DELETE CASCADE (deleting a company deletes its leads)
  console.log('\n=== Fix: leads.company_id FK → ON DELETE CASCADE ===');

  await runSQL('Drop old leads_company_id_fkey', `
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_company_id_fkey;
  `);

  await runSQL('Add leads_company_id_fkey with ON DELETE CASCADE', `
    ALTER TABLE public.leads ADD CONSTRAINT leads_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  `);

  console.log('\nDone.');
}

main();
