/**
 * Migration: import_groups table + leads.import_group_id FK + get_import_group_stats() RPC
 *
 * Run once: node migrate-import-groups.mjs
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
  ['Create import_groups table', `
    CREATE TABLE IF NOT EXISTS public.import_groups (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name             text NOT NULL,
      source           text NOT NULL DEFAULT 'csv',
      enrichment_level text NOT NULL DEFAULT 'import_only',
      team_id          uuid REFERENCES public.teams(id),
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );
  `],

  ['Add import_group_id to leads', `
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS import_group_id uuid REFERENCES public.import_groups(id);
  `],

  ['Index leads.import_group_id', `
    CREATE INDEX IF NOT EXISTS idx_leads_import_group_id ON public.leads(import_group_id) WHERE import_group_id IS NOT NULL;
  `],

  ['Enable RLS: import_groups', 'ALTER TABLE public.import_groups ENABLE ROW LEVEL SECURITY;'],

  ['Policy: import_groups - select', `
    CREATE POLICY ig_select ON public.import_groups
      FOR SELECT USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  ['Policy: import_groups - insert', `
    CREATE POLICY ig_insert ON public.import_groups
      FOR INSERT WITH CHECK (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  ['Policy: import_groups - update', `
    CREATE POLICY ig_update ON public.import_groups
      FOR UPDATE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  ['Policy: import_groups - delete', `
    CREATE POLICY ig_delete ON public.import_groups
      FOR DELETE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  ['Create get_import_group_stats() RPC', `
    CREATE OR REPLACE FUNCTION public.get_import_group_stats()
    RETURNS TABLE (
      id uuid, name text, source text, enrichment_level text,
      team_id uuid, created_at timestamptz, updated_at timestamptz,
      total_leads bigint, ready_count bigint, backup_count bigint,
      failed_count bigint, in_progress_count bigint
    )
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
      SELECT
        ig.id, ig.name, ig.source, ig.enrichment_level,
        ig.team_id, ig.created_at, ig.updated_at,
        COUNT(l.id) AS total_leads,
        COUNT(l.id) FILTER (WHERE l.status = 'ready') AS ready_count,
        COUNT(l.id) FILTER (WHERE l.status IN ('info_email','staff_email')) AS backup_count,
        COUNT(l.id) FILTER (WHERE l.status = 'failed') AS failed_count,
        COUNT(l.id) FILTER (WHERE l.status IN ('new','enriching','enriched','email_discovery','email_verified','needs_review')) AS in_progress_count
      FROM public.import_groups ig
      LEFT JOIN public.leads l ON l.import_group_id = ig.id
      GROUP BY ig.id
      ORDER BY ig.created_at DESC;
    $$;
  `],
];

console.log('Running import_groups migration...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
