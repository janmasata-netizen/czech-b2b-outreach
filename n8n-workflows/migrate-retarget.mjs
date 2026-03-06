/**
 * migrate-retarget.mjs
 * Adds retarget pool support:
 * - config: retarget_lockout_days = 120
 * - wave_leads: retarget_round column
 * - waves: source_wave_id + completed_at columns
 * - retarget_pool view
 * - get_retarget_pool() RPC
 * - Updates auto_complete_waves() to set completed_at
 */

import https from 'https';
import { SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

const SUPABASE_REF = 'cycapkswtucbucyegdsn';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`${res.statusCode}: ${data}`));
        } else {
          resolve(data ? JSON.parse(data) : {});
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runSQL(label, sql) {
  console.log(`\n=== ${label} ===`);
  const result = await request(
    'POST',
    `/v1/projects/${SUPABASE_REF}/database/query`,
    { query: sql }
  );
  console.log('Result:', JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  // Step 1a: Config entry
  await runSQL('Add retarget_lockout_days config', `
    INSERT INTO public.config (key, value) VALUES ('retarget_lockout_days', '120')
    ON CONFLICT (key) DO NOTHING;
  `);

  // Step 1b: retarget_round on wave_leads
  await runSQL('Add retarget_round to wave_leads', `
    ALTER TABLE public.wave_leads ADD COLUMN IF NOT EXISTS retarget_round integer DEFAULT 0;
  `);

  // Step 1c: source_wave_id on waves
  await runSQL('Add source_wave_id to waves', `
    ALTER TABLE public.waves ADD COLUMN IF NOT EXISTS source_wave_id uuid REFERENCES public.waves(id) ON DELETE SET NULL;
  `);

  // Step 1e: completed_at on waves
  await runSQL('Add completed_at to waves', `
    ALTER TABLE public.waves ADD COLUMN IF NOT EXISTS completed_at timestamptz;
  `);

  // Step 1d: retarget_pool view
  await runSQL('Create retarget_pool view', `
    CREATE OR REPLACE VIEW public.retarget_pool AS
    SELECT DISTINCT ON (l.id)
      l.id AS lead_id,
      l.company_name,
      l.ico,
      l.domain,
      l.team_id,
      l.status AS lead_status,
      wl.id AS last_wave_lead_id,
      wl.wave_id AS last_wave_id,
      w.name AS last_wave_name,
      w.completed_at AS last_wave_completed_at,
      wl.updated_at AS last_contacted_at,
      wl.retarget_round,
      (wl.updated_at + (
        SELECT (value::integer || ' days')::interval
        FROM public.config WHERE key = 'retarget_lockout_days'
      )) AS unlocks_at
    FROM public.leads l
    JOIN public.wave_leads wl ON wl.lead_id = l.id
    JOIN public.waves w ON w.id = wl.wave_id
    WHERE wl.status = 'completed'
      AND l.status != 'replied'
      AND l.master_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.wave_leads wl2
        JOIN public.waves w2 ON w2.id = wl2.wave_id
        WHERE wl2.lead_id = l.id
        AND w2.status IN ('draft', 'scheduled', 'sending')
      )
      AND wl.updated_at + (
        SELECT (value::integer || ' days')::interval
        FROM public.config WHERE key = 'retarget_lockout_days'
      ) <= now()
    ORDER BY l.id, wl.updated_at DESC;
  `);

  // Step 1f: get_retarget_pool() RPC
  await runSQL('Create get_retarget_pool() RPC', `
    CREATE OR REPLACE FUNCTION public.get_retarget_pool(
      p_search text DEFAULT NULL,
      p_team_id uuid DEFAULT NULL,
      p_limit integer DEFAULT 50,
      p_offset integer DEFAULT 0
    )
    RETURNS TABLE (
      lead_id uuid,
      company_name text,
      ico text,
      domain text,
      team_id uuid,
      last_wave_name text,
      last_contacted_at timestamptz,
      retarget_round integer,
      unlocks_at timestamptz,
      total_waves_count bigint,
      jednatels jsonb
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        rp.lead_id, rp.company_name, rp.ico, rp.domain, rp.team_id,
        rp.last_wave_name, rp.last_contacted_at, rp.retarget_round, rp.unlocks_at,
        (SELECT count(*) FROM public.wave_leads wl3 WHERE wl3.lead_id = rp.lead_id) AS total_waves_count,
        (SELECT jsonb_agg(jsonb_build_object(
          'id', j.id, 'full_name', j.full_name, 'salutation', j.salutation
        )) FROM public.jednatels j WHERE j.lead_id = rp.lead_id) AS jednatels
      FROM public.retarget_pool rp
      WHERE (p_search IS NULL OR rp.company_name ILIKE '%' || p_search || '%' OR rp.ico ILIKE '%' || p_search || '%')
        AND (p_team_id IS NULL OR rp.team_id = p_team_id)
      ORDER BY rp.last_contacted_at ASC
      LIMIT p_limit OFFSET p_offset;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // Step 2: Update auto_complete_waves() to set completed_at
  await runSQL('Update auto_complete_waves() with completed_at', `
    CREATE OR REPLACE FUNCTION public.auto_complete_waves()
    RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
      v_completed_ids uuid[];
      v_count integer;
    BEGIN
      WITH wave_stats AS (
        SELECT w.id AS wave_id,
               COUNT(wl.id) AS total_leads,
               COUNT(wl.id) FILTER (
                 WHERE wl.status IN ('completed','replied','failed')
               ) AS finished_leads
        FROM public.waves w
        INNER JOIN public.wave_leads wl ON wl.wave_id = w.id
        WHERE w.status IN ('scheduled','sending')
        GROUP BY w.id
      )
      SELECT ARRAY_AGG(wave_id) INTO v_completed_ids
      FROM wave_stats
      WHERE total_leads > 0 AND total_leads = finished_leads;

      IF v_completed_ids IS NOT NULL AND array_length(v_completed_ids, 1) > 0 THEN
        UPDATE public.waves
        SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE id = ANY(v_completed_ids);
        v_count := array_length(v_completed_ids, 1);
      ELSE
        v_count := 0;
      END IF;

      RETURN json_build_object(
        'waves_completed', v_count,
        'wave_ids', COALESCE(v_completed_ids, ARRAY[]::uuid[])
      );
    END;
    $$;
  `);

  console.log('\n=== All retarget migrations complete! ===');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
