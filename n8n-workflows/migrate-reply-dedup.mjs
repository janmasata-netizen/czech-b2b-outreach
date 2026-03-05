import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Reply dedup migration
 * Creates processed_reply_emails table + check_and_mark_reply_processed RPC
 * Run once: node migrate-reply-dedup.mjs
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
  console.log('=== Reply Dedup Migration ===\n');

  await runSQL(
    `CREATE TABLE IF NOT EXISTS processed_reply_emails (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id text NOT NULL,
      salesman_id uuid REFERENCES salesmen(id),
      processed_at timestamptz NOT NULL DEFAULT now()
    );`,
    'Create processed_reply_emails table'
  );

  await runSQL(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_processed_reply_emails_msg
      ON processed_reply_emails (message_id);`,
    'Create unique index on message_id'
  );

  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_processed_reply_emails_at
      ON processed_reply_emails (processed_at);`,
    'Create index on processed_at'
  );

  await runSQL(
    `CREATE OR REPLACE FUNCTION check_and_mark_reply_processed(
      p_message_id text,
      p_salesman_id uuid DEFAULT NULL
    ) RETURNS json LANGUAGE plpgsql AS $$
    DECLARE v_count int;
    BEGIN
      INSERT INTO processed_reply_emails (message_id, salesman_id)
      VALUES (p_message_id, p_salesman_id)
      ON CONFLICT (message_id) DO NOTHING;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN json_build_object('is_new', v_count > 0);
    END;
    $$;`,
    'Create check_and_mark_reply_processed RPC'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
