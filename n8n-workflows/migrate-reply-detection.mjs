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
            console.log(`  ✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 300));
            resolve(false);
          } else {
            console.log(`  ✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error -`, data.slice(0, 300));
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

const steps = [

  ['1. Add salesman_id to lead_replies', `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lead_replies' AND column_name = 'salesman_id'
      ) THEN
        ALTER TABLE public.lead_replies ADD COLUMN salesman_id uuid REFERENCES public.salesmen(id);
      END IF;
    END $$;
  `],

  ['2. Create unmatched_replies table', `
    CREATE TABLE IF NOT EXISTS public.unmatched_replies (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      from_email text NOT NULL,
      sender_domain text,
      subject text,
      body_preview text,
      salesman_id uuid REFERENCES public.salesmen(id),
      received_at timestamptz,
      created_at timestamptz DEFAULT now(),
      resolved boolean DEFAULT false
    );
  `],

  ['3. Index on unmatched_replies.resolved', `
    CREATE INDEX IF NOT EXISTS idx_unmatched_replies_resolved
      ON public.unmatched_replies (resolved) WHERE resolved = false;
  `],

  ['4. Enable RLS on unmatched_replies', `
    ALTER TABLE public.unmatched_replies ENABLE ROW LEVEL SECURITY;
  `],

  ['5. RLS policy for unmatched_replies (service role)', `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'unmatched_replies' AND policyname = 'service_role_all'
      ) THEN
        CREATE POLICY service_role_all ON public.unmatched_replies FOR ALL
          USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');
      END IF;
    END $$;
  `],

  ['6. Index on email_candidates.email_address for reply matching', `
    CREATE INDEX IF NOT EXISTS idx_email_candidates_email_address
      ON public.email_candidates (email_address);
  `],

];

console.log('=== Reply Detection Migration ===\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
