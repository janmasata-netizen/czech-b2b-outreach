import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

/**
 * Scheduling report migration
 * Adds scheduling_report column to waves table for skip tracking
 * Run once: node migrate-scheduling-report.mjs
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
  console.log('=== Scheduling Report Migration ===\n');

  await runSQL(
    `ALTER TABLE waves ADD COLUMN IF NOT EXISTS scheduling_report jsonb;`,
    'Add scheduling_report to waves'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
