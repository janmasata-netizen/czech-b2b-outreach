import { SUPABASE_URL, SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';
/**
 * Audit fixes migration — indexes + unique constraints
 * Run once: node migrate-audit-fixes.mjs
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
  console.log('=== Audit Migration: Indexes + Unique Constraints ===\n');

  // B1: Missing indexes
  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications (email);`,
    'B1a: Index on email_verifications.email'
  );

  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_waves_team_status ON waves (team_id, status);`,
    'B1b: Index on waves(team_id, status)'
  );

  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_salesmen_team_id ON salesmen (team_id);`,
    'B1c: Index on salesmen.team_id'
  );

  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_lead_replies_wave_lead_id ON lead_replies (wave_lead_id);`,
    'B1d: Index on lead_replies.wave_lead_id'
  );

  // B2: Check for existing duplicates before adding unique constraints
  console.log('\n--- B2: Checking for existing duplicates ---');

  const dupeCheckWL = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `SELECT wave_id, lead_id, COUNT(*) as cnt FROM wave_leads GROUP BY wave_id, lead_id HAVING COUNT(*) > 1;`
    }),
  });

  const dupeWL = await dupeCheckWL.json();
  if (Array.isArray(dupeWL) && dupeWL.length > 0) {
    console.log('WARNING: Duplicate wave_leads found:', JSON.stringify(dupeWL));
    console.log('Deduplicating — keeping earliest row per (wave_id, lead_id)...');
    await runSQL(
      `DELETE FROM wave_leads a USING wave_leads b
       WHERE a.wave_id = b.wave_id AND a.lead_id = b.lead_id
         AND a.created_at > b.created_at;`,
      'B2: Deduplicate wave_leads'
    );
  } else {
    console.log('No duplicate wave_leads found.');
  }

  const dupeCheckEC = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `SELECT jednatel_id, email_address, COUNT(*) as cnt FROM email_candidates WHERE jednatel_id IS NOT NULL GROUP BY jednatel_id, email_address HAVING COUNT(*) > 1;`
    }),
  });

  const dupeEC = await dupeCheckEC.json();
  if (Array.isArray(dupeEC) && dupeEC.length > 0) {
    console.log('WARNING: Duplicate email_candidates found:', JSON.stringify(dupeEC));
    console.log('Deduplicating — keeping earliest row per (jednatel_id, email_address)...');
    await runSQL(
      `DELETE FROM email_candidates a USING email_candidates b
       WHERE a.jednatel_id = b.jednatel_id AND a.email_address = b.email_address
         AND a.jednatel_id IS NOT NULL
         AND a.created_at > b.created_at;`,
      'B2: Deduplicate email_candidates'
    );
  } else {
    console.log('No duplicate email_candidates found.');
  }

  // B2: Unique constraints
  await runSQL(
    `ALTER TABLE wave_leads ADD CONSTRAINT uq_wave_leads_wave_lead UNIQUE (wave_id, lead_id);`,
    'B2a: UNIQUE(wave_id, lead_id) on wave_leads'
  );

  await runSQL(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_email_candidates_jednatel_email
     ON email_candidates (jednatel_id, email_address)
     WHERE jednatel_id IS NOT NULL;`,
    'B2b: UNIQUE(jednatel_id, email_address) on email_candidates (partial, non-null jednatel_id)'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
