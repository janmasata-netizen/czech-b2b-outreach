import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Master Lead Database — CRM Layer + Tags + Contact Methods
 * Run once: node migrate-master-db.mjs
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
  console.log('=== Master DB Migration: CRM Layer + Tags + Contact Methods ===\n');

  // 1a. Add master_status column to leads
  await runSQL(`
    DO $$ BEGIN
      ALTER TABLE leads ADD COLUMN master_status TEXT NOT NULL DEFAULT 'active'
        CHECK (master_status IN ('active','blacklisted','archived'));
    EXCEPTION WHEN duplicate_column THEN
      RAISE NOTICE 'master_status column already exists';
    END $$;
  `, '1a: Add master_status column to leads');

  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_leads_master_status ON leads (master_status);`,
    '1a: Index on leads.master_status'
  );

  // 1b. Create tags table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6b7280',
      team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `, '1b: Create tags table');

  await runSQL(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_name_team
    ON tags (lower(name), COALESCE(team_id, '00000000-0000-0000-0000-000000000000'));
  `, '1b: Unique index on tags(name, team_id)');

  // 1c. Create lead_tags junction table
  await runSQL(`
    CREATE TABLE IF NOT EXISTS lead_tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (lead_id, tag_id)
    );
  `, '1c: Create lead_tags junction table');

  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON lead_tags (lead_id);`,
    '1c: Index on lead_tags.lead_id'
  );

  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_lead_tags_tag_id ON lead_tags (tag_id);`,
    '1c: Index on lead_tags.tag_id'
  );

  // 1d. Add contact method columns to jednatels
  await runSQL(`
    DO $$ BEGIN
      ALTER TABLE jednatels ADD COLUMN phone TEXT;
    EXCEPTION WHEN duplicate_column THEN
      RAISE NOTICE 'phone column already exists';
    END $$;
  `, '1d: Add phone column to jednatels');

  await runSQL(`
    DO $$ BEGIN
      ALTER TABLE jednatels ADD COLUMN linkedin TEXT;
    EXCEPTION WHEN duplicate_column THEN
      RAISE NOTICE 'linkedin column already exists';
    END $$;
  `, '1d: Add linkedin column to jednatels');

  await runSQL(`
    DO $$ BEGIN
      ALTER TABLE jednatels ADD COLUMN other_contact TEXT;
    EXCEPTION WHEN duplicate_column THEN
      RAISE NOTICE 'other_contact column already exists';
    END $$;
  `, '1d: Add other_contact column to jednatels');

  // 1e. Seed default tags
  await runSQL(`
    INSERT INTO tags (name, color, team_id) VALUES
      ('Blacklist',      '#ef4444', NULL),
      ('Email outreach', '#3ecf8e', NULL),
      ('Telefon',        '#fb923c', NULL),
      ('VIP',            '#a78bfa', NULL)
    ON CONFLICT DO NOTHING;
  `, '1e: Seed default tags');

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
