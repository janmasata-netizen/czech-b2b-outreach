import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Thread subject migration
 * Adds thread_subject column to email_queue table for email threading fix
 * Run once: node migrate-thread-subject.mjs
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
  console.log('=== Thread Subject Migration ===\n');

  await runSQL(
    `ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS thread_subject varchar;`,
    'Add thread_subject to email_queue'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
