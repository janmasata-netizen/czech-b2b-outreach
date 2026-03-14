import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * migrate-fix-wave-trigger.mjs
 * Replaces fn_refresh_salutations_on_wave_add() to remove broken
 * jednatels.updated_at reference and use contacts table instead.
 *
 * Run once: node migrate-fix-wave-trigger.mjs
 */

async function runSQL(sql, label) {
  console.log(`\n--- ${label} ---`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`FAILED (${res.status}): ${text}`);
    return null;
  }

  const data = await res.json();
  console.log('OK:', JSON.stringify(data).slice(0, 300));
  return data;
}

async function main() {
  console.log('=== Fix Wave Trigger — Migration ===\n');

  // A. Replace the function body to use contacts instead of jednatels
  await runSQL(`
    CREATE OR REPLACE FUNCTION public.fn_refresh_salutations_on_wave_add()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE public.contacts c SET updated_at = now()
      WHERE c.company_id = (SELECT company_id FROM public.leads WHERE id = NEW.lead_id)
        AND c.full_name IS NOT NULL AND c.full_name != '';
      RETURN NEW;
    END;
    $$;
  `, 'A: Replace fn_refresh_salutations_on_wave_add() to use contacts');

  // B. Drop and recreate get_retarget_pool to use contacts instead of jednatels
  await runSQL(`
    DROP FUNCTION IF EXISTS public.get_retarget_pool(text, uuid, integer, integer);
  `, 'B1: Drop old get_retarget_pool');

  await runSQL(`
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
      contacts jsonb
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        rp.lead_id, rp.company_name, rp.ico, rp.domain, rp.team_id,
        rp.last_wave_name, rp.last_contacted_at, rp.retarget_round, rp.unlocks_at,
        (SELECT count(*) FROM public.wave_leads wl3 WHERE wl3.lead_id = rp.lead_id) AS total_waves_count,
        (SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'full_name', c.full_name, 'salutation', c.salutation
        )) FROM public.contacts c
        JOIN public.companies co ON c.company_id = co.id
        JOIN public.leads l ON l.company_id = co.id
        WHERE l.id = rp.lead_id) AS contacts
      FROM public.retarget_pool rp
      WHERE (p_search IS NULL OR rp.company_name ILIKE '%' || p_search || '%' OR rp.ico ILIKE '%' || p_search || '%')
        AND (p_team_id IS NULL OR rp.team_id = p_team_id)
      ORDER BY rp.last_contacted_at ASC
      LIMIT p_limit OFFSET p_offset;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `, 'B2: Create get_retarget_pool with contacts');

  await runSQL(`
    GRANT EXECUTE ON FUNCTION public.get_retarget_pool(text, uuid, integer, integer) TO authenticated;
  `, 'B3: Grant execute on get_retarget_pool');

  // C. Verify
  await runSQL(`
    SELECT routine_name, routine_definition
    FROM information_schema.routines
    WHERE routine_name = 'fn_refresh_salutations_on_wave_add';
  `, 'C: Verify trigger function updated');

  console.log('\n=== Migration complete ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
