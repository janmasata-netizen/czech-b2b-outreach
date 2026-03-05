import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Per-sequence scheduling migration
 * Adds send_date_seq2, send_date_seq3, send_time_seq1/2/3 to waves table
 * Run once: node migrate-per-seq-schedule.mjs
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
  console.log('=== Per-Sequence Scheduling Migration ===\n');

  await runSQL(
    `ALTER TABLE waves ADD COLUMN IF NOT EXISTS send_date_seq2 date;`,
    'Add send_date_seq2'
  );

  await runSQL(
    `ALTER TABLE waves ADD COLUMN IF NOT EXISTS send_date_seq3 date;`,
    'Add send_date_seq3'
  );

  await runSQL(
    `ALTER TABLE waves ADD COLUMN IF NOT EXISTS send_time_seq1 time DEFAULT '08:00';`,
    'Add send_time_seq1'
  );

  await runSQL(
    `ALTER TABLE waves ADD COLUMN IF NOT EXISTS send_time_seq2 time DEFAULT '08:00';`,
    'Add send_time_seq2'
  );

  await runSQL(
    `ALTER TABLE waves ADD COLUMN IF NOT EXISTS send_time_seq3 time DEFAULT '08:00';`,
    'Add send_time_seq3'
  );

  // Backfill seq1 time from existing send_window_start
  await runSQL(
    `UPDATE waves SET send_time_seq1 = send_window_start
     WHERE send_window_start IS NOT NULL AND send_time_seq1 = '08:00:00';`,
    'Backfill send_time_seq1 from send_window_start'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
