/**
 * Migration: bug_reports + system_events tables
 *
 * bug_reports — user-submitted bug reports with screenshot support
 * system_events — general-purpose system event log
 *
 * Run once: node migrate-bug-reports.mjs
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
  // ── bug_reports table ──
  ['Create bug_reports table', `
    CREATE TABLE IF NOT EXISTS public.bug_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text NOT NULL,
      severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      category text NOT NULL DEFAULT 'other' CHECK (category IN ('ui', 'emails', 'enrichment', 'waves', 'system', 'other')),
      screenshot_url text,
      reporter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `],

  ['Enable RLS: bug_reports', 'ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;'],

  ['Policy: bug_reports - authenticated insert own', `
    CREATE POLICY br_insert ON public.bug_reports
      FOR INSERT WITH CHECK (auth.uid() = reporter_id);
  `],

  ['Policy: bug_reports - admin select all', `
    CREATE POLICY br_select ON public.bug_reports
      FOR SELECT USING (current_user_is_admin() OR auth.uid() = reporter_id);
  `],

  ['Policy: bug_reports - admin update', `
    CREATE POLICY br_update ON public.bug_reports
      FOR UPDATE USING (current_user_is_admin());
  `],

  // ── system_events table ──
  ['Create system_events table', `
    CREATE TABLE IF NOT EXISTS public.system_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type text NOT NULL,
      actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      description text,
      details jsonb,
      created_at timestamptz DEFAULT now()
    );
  `],

  ['Enable RLS: system_events', 'ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;'],

  ['Policy: system_events - admin select', `
    CREATE POLICY se_select ON public.system_events
      FOR SELECT USING (current_user_is_admin());
  `],

  ['Policy: system_events - authenticated insert', `
    CREATE POLICY se_insert ON public.system_events
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  `],

  // ── Storage bucket for screenshots ──
  ['Create bug-screenshots storage bucket', `
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('bug-screenshots', 'bug-screenshots', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  `],

  ['Policy: bug-screenshots - authenticated upload', `
    CREATE POLICY bss_insert ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'bug-screenshots' AND auth.uid() IS NOT NULL);
  `],

  ['Policy: bug-screenshots - admin read', `
    CREATE POLICY bss_select ON storage.objects
      FOR SELECT USING (bucket_id = 'bug-screenshots' AND (
        SELECT is_admin FROM public.profiles WHERE id = auth.uid()
      ));
  `],
];

console.log('Running bug_reports + system_events migration...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
