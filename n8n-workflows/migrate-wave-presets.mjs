/**
 * Migration: wave_presets table
 *
 * Stores reusable wave configurations (template_set, from_email, salesman).
 * Run once: node migrate-wave-presets.mjs
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
  ['Create wave_presets table', `
    CREATE TABLE IF NOT EXISTS public.wave_presets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      name text NOT NULL,
      template_set_id uuid REFERENCES public.template_sets(id) ON DELETE SET NULL,
      from_email text,
      salesman_id uuid REFERENCES public.salesmen(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `],

  ['Enable RLS: wave_presets', 'ALTER TABLE public.wave_presets ENABLE ROW LEVEL SECURITY;'],

  ['Policy: wave_presets - select', `
    CREATE POLICY wp_select ON public.wave_presets
      FOR SELECT USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  ['Policy: wave_presets - insert', `
    CREATE POLICY wp_insert ON public.wave_presets
      FOR INSERT WITH CHECK (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  ['Policy: wave_presets - update', `
    CREATE POLICY wp_update ON public.wave_presets
      FOR UPDATE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  ['Policy: wave_presets - delete', `
    CREATE POLICY wp_delete ON public.wave_presets
      FOR DELETE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],
];

console.log('Running wave_presets migration...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
