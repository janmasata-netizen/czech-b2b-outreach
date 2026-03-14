import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * migrate-add-leads-rpc.mjs
 * Creates a SECURITY DEFINER RPC function `add_leads_to_wave()`
 * that handles lead insertion server-side, bypassing RLS.
 * Also ensures the UNIQUE constraint on (wave_id, lead_id) exists.
 *
 * Run once: node migrate-add-leads-rpc.mjs
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
  console.log('=== Add Leads to Wave RPC — Migration ===\n');

  // A. Ensure UNIQUE constraint on wave_leads(wave_id, lead_id)
  await runSQL(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'wave_leads_wave_id_lead_id_key'
      ) THEN
        ALTER TABLE wave_leads
          ADD CONSTRAINT wave_leads_wave_id_lead_id_key UNIQUE (wave_id, lead_id);
      END IF;
    END $$;
  `, 'A: Ensure UNIQUE constraint on (wave_id, lead_id)');

  // B. Create the RPC function
  await runSQL(`
    CREATE OR REPLACE FUNCTION public.add_leads_to_wave(
      p_wave_id uuid,
      p_lead_ids uuid[],
      p_retarget_mode boolean DEFAULT false
    )
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_team_id uuid;
      v_caller_team_id uuid;
      v_is_admin boolean;
      v_inserted integer;
      v_lead_id uuid;
      v_retarget_round integer;
    BEGIN
      -- 1. Validate caller owns the wave
      SELECT team_id INTO v_team_id FROM waves WHERE id = p_wave_id;
      IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'error', 'wave_not_found');
      END IF;

      SELECT team_id, COALESCE(is_admin, false)
        INTO v_caller_team_id, v_is_admin
        FROM profiles WHERE id = auth.uid();

      IF v_caller_team_id IS NULL THEN
        RETURN json_build_object('ok', false, 'error', 'no_profile');
      END IF;

      IF v_team_id != v_caller_team_id AND NOT v_is_admin THEN
        RETURN json_build_object('ok', false, 'error', 'unauthorized');
      END IF;

      -- 2. Insert leads
      IF p_retarget_mode THEN
        v_inserted := 0;
        FOREACH v_lead_id IN ARRAY p_lead_ids LOOP
          SELECT COALESCE(MAX(wl.retarget_round), 0) + 1
            INTO v_retarget_round
            FROM wave_leads wl WHERE wl.lead_id = v_lead_id;

          INSERT INTO wave_leads (wave_id, lead_id, ab_variant, status, retarget_round)
          VALUES (p_wave_id, v_lead_id, 'A', 'pending', v_retarget_round)
          ON CONFLICT (wave_id, lead_id) DO NOTHING;

          IF FOUND THEN v_inserted := v_inserted + 1; END IF;
        END LOOP;
      ELSE
        WITH ins AS (
          INSERT INTO wave_leads (wave_id, lead_id, ab_variant, status)
          SELECT p_wave_id, unnest(p_lead_ids), 'A', 'pending'
          ON CONFLICT (wave_id, lead_id) DO NOTHING
          RETURNING id
        )
        SELECT count(*) INTO v_inserted FROM ins;
      END IF;

      RETURN json_build_object('ok', true, 'inserted', v_inserted);
    END;
    $$;
  `, 'B: Create add_leads_to_wave() RPC function');

  // C. Grant execute to authenticated role
  await runSQL(`
    GRANT EXECUTE ON FUNCTION public.add_leads_to_wave(uuid, uuid[], boolean) TO authenticated;
  `, 'C: Grant EXECUTE to authenticated');

  // D. Verification
  await runSQL(`
    SELECT routine_name, security_type
    FROM information_schema.routines
    WHERE routine_name = 'add_leads_to_wave';
  `, 'D: Verify function exists');

  console.log('\n=== Migration complete ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
