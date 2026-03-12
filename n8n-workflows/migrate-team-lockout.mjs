import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

/**
 * Per-team retarget lockout migration
 * Adds retarget_lockout_days column to teams table
 * Run once: node migrate-team-lockout.mjs
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
  console.log('=== Per-Team Lockout Migration ===\n');

  await runSQL(
    `ALTER TABLE teams ADD COLUMN IF NOT EXISTS retarget_lockout_days integer DEFAULT 120;`,
    'Add retarget_lockout_days to teams'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
