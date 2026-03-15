import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Fix increment_and_check_sends: use p_team_id on teams table (not outreach_accounts).
 * Run once: node migrate-fix-increment-sends.mjs
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
    return false;
  }

  const data = await res.json();
  console.log('OK:', JSON.stringify(data).slice(0, 200));
  return true;
}

async function main() {
  console.log('=== Fix: increment_and_check_sends → p_team_id on teams table ===\n');

  await runSQL(`DROP FUNCTION IF EXISTS public.increment_and_check_sends(uuid);`,
    'Drop old increment_and_check_sends');

  await runSQL(`
CREATE OR REPLACE FUNCTION public.increment_and_check_sends(p_team_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sends integer; v_limit integer;
BEGIN
  UPDATE public.teams SET sends_today = sends_today + 1
    WHERE id = p_team_id
    RETURNING sends_today, daily_send_limit INTO v_sends, v_limit;
  IF NOT FOUND THEN
    RETURN json_build_object('is_over_limit', true, 'reason', 'team_not_found');
  END IF;
  RETURN json_build_object('sends_today', v_sends, 'daily_send_limit', v_limit,
    'is_over_limit', v_sends > v_limit);
END; $$;
  `, 'Fix increment_and_check_sends');

  console.log('\nDone!');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
