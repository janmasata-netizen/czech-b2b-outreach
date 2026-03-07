import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * migrate-refresh-salutations.mjs
 * Creates a trigger on wave_leads INSERT that refreshes salutations
 * for all jednatels of the added lead, ensuring salutations are
 * always up-to-date when leads are assigned to a wave.
 *
 * Run once: node migrate-refresh-salutations.mjs
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
  console.log('=== Refresh Salutations on Wave Add — Migration ===\n');

  // A. Create trigger function
  await runSQL(`
    CREATE OR REPLACE FUNCTION fn_refresh_salutations_on_wave_add()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE jednatels SET updated_at = now()
      WHERE lead_id = NEW.lead_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `, 'A: Create fn_refresh_salutations_on_wave_add()');

  // B. Create trigger on wave_leads
  await runSQL(`
    DROP TRIGGER IF EXISTS trg_refresh_salutations_on_wave_add ON wave_leads;
    CREATE TRIGGER trg_refresh_salutations_on_wave_add
    AFTER INSERT ON wave_leads
    FOR EACH ROW EXECUTE FUNCTION fn_refresh_salutations_on_wave_add();
  `, 'B: Create trigger on wave_leads INSERT');

  // C. Verification — check trigger exists
  await runSQL(`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE trigger_name = 'trg_refresh_salutations_on_wave_add';
  `, 'C: Verify trigger exists');

  console.log('\n=== Migration complete ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
