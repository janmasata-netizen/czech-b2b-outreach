/**
 * Migration: bug_report_notes + bug_report_tags tables + seed predefined tags
 *
 * bug_report_notes — threaded admin notes on bug reports
 * bug_report_tags — junction table linking bug_reports to tags
 *
 * Run once: node migrate-bug-report-details.mjs
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
  // ── bug_report_notes table ──
  ['Create bug_report_notes table', `
    CREATE TABLE IF NOT EXISTS public.bug_report_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bug_report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES public.profiles(id),
      content text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `],

  ['Index: bug_report_notes by report', `
    CREATE INDEX IF NOT EXISTS idx_brn_report ON public.bug_report_notes(bug_report_id);
  `],

  ['Enable RLS: bug_report_notes', 'ALTER TABLE public.bug_report_notes ENABLE ROW LEVEL SECURITY;'],

  ['Policy: bug_report_notes - authenticated select', `
    CREATE POLICY brn_select ON public.bug_report_notes
      FOR SELECT USING (auth.uid() IS NOT NULL);
  `],

  ['Policy: bug_report_notes - insert own', `
    CREATE POLICY brn_insert ON public.bug_report_notes
      FOR INSERT WITH CHECK (auth.uid() = author_id);
  `],

  ['Policy: bug_report_notes - update own', `
    CREATE POLICY brn_update ON public.bug_report_notes
      FOR UPDATE USING (auth.uid() = author_id);
  `],

  ['Policy: bug_report_notes - delete own', `
    CREATE POLICY brn_delete ON public.bug_report_notes
      FOR DELETE USING (auth.uid() = author_id);
  `],

  // ── bug_report_tags junction table ──
  ['Create bug_report_tags table', `
    CREATE TABLE IF NOT EXISTS public.bug_report_tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bug_report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
      tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      UNIQUE(bug_report_id, tag_id)
    );
  `],

  ['Index: bug_report_tags by report', `
    CREATE INDEX IF NOT EXISTS idx_brt_report ON public.bug_report_tags(bug_report_id);
  `],

  ['Enable RLS: bug_report_tags', 'ALTER TABLE public.bug_report_tags ENABLE ROW LEVEL SECURITY;'],

  ['Policy: bug_report_tags - authenticated select', `
    CREATE POLICY brt_select ON public.bug_report_tags
      FOR SELECT USING (auth.uid() IS NOT NULL);
  `],

  ['Policy: bug_report_tags - authenticated insert', `
    CREATE POLICY brt_insert ON public.bug_report_tags
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  `],

  ['Policy: bug_report_tags - authenticated delete', `
    CREATE POLICY brt_delete ON public.bug_report_tags
      FOR DELETE USING (auth.uid() IS NOT NULL);
  `],

  // ── Seed predefined bug report tags ──
  ['Seed predefined bug report tags', `
    INSERT INTO public.tags (name, color, team_id) VALUES
      ('frontend', '#3b82f6', NULL),
      ('backend', '#8b5cf6', NULL),
      ('auth', '#f59e0b', NULL),
      ('email', '#10b981', NULL),
      ('enrichment', '#06b6d4', NULL),
      ('n8n', '#f97316', NULL),
      ('database', '#6366f1', NULL),
      ('urgent', '#ef4444', NULL),
      ('regression', '#ec4899', NULL),
      ('ux', '#14b8a6', NULL)
    ON CONFLICT DO NOTHING;
  `],
];

console.log('Running bug_report_notes + bug_report_tags migration...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
