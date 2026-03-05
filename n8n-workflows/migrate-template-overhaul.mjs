import { SUPABASE_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * migrate-template-overhaul.mjs
 * Adds: team_id + variables to template_sets, custom_fields to leads
 * Run once: node migrate-template-overhaul.mjs
 */

const SUPABASE_REF = 'cycapkswtucbucyegdsn';
async function runSQL(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);
  console.log('OK:', sql.slice(0, 80) + '...');
  return text;
}

async function main() {
  console.log('=== Template Overhaul Migration ===\n');

  // 1. Add team_id to template_sets
  await runSQL(`
    ALTER TABLE template_sets
    ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
  `);

  await runSQL(`
    CREATE INDEX IF NOT EXISTS idx_template_sets_team_id ON template_sets(team_id);
  `);

  // 2. Add variables jsonb to template_sets
  await runSQL(`
    ALTER TABLE template_sets
    ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '[]'::jsonb;
  `);

  // 3. Add custom_fields jsonb to leads
  await runSQL(`
    ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;
  `);

  // 4. Backfill: set team_id on existing template_sets to the first team
  // First get the first team ID
  const teamsRes = await fetch(
    `https://${SUPABASE_REF}.supabase.co/rest/v1/teams?select=id&order=created_at&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const teams = await teamsRes.json();
  if (teams.length > 0) {
    const firstTeamId = teams[0].id;
    console.log(`\nBackfilling template_sets.team_id with first team: ${firstTeamId}`);
    await runSQL(`
      UPDATE template_sets SET team_id = '${firstTeamId}' WHERE team_id IS NULL;
    `);
  } else {
    console.log('\nNo teams found — skipping team_id backfill');
  }

  console.log('\n=== Migration complete ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
