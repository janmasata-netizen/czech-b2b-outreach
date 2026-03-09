import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Fix broken dedup system (post PR #16)
 * 1. Backfill domain column from website for existing leads
 * 2. Report duplicate ICOs/domains (informational)
 * 3. Add UNIQUE partial indexes on ico and domain
 *
 * Run once: node migrate-dedup-fix.mjs
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
  console.log('OK:', JSON.stringify(data).slice(0, 500));
  return data;
}

async function main() {
  console.log('=== Dedup Fix Migration ===\n');

  // 1. Backfill domain from website for existing leads
  await runSQL(
    `UPDATE leads SET domain = split_part(
       regexp_replace(
         regexp_replace(
           regexp_replace(lower(trim(website)), '^https?://', ''),
           '^www\\.', ''),
         '/.*$', ''),
       '?', 1)
     WHERE website IS NOT NULL AND website != ''
       AND (domain IS NULL OR domain = '');`,
    'Backfill domain from website'
  );

  // 2. Report duplicate ICOs (informational)
  await runSQL(
    `SELECT ico, count(*) AS cnt
     FROM leads
     WHERE ico IS NOT NULL AND is_active = true
     GROUP BY ico HAVING count(*) > 1
     ORDER BY cnt DESC LIMIT 20;`,
    'Report duplicate ICOs'
  );

  // 3. Report duplicate domains (informational)
  await runSQL(
    `SELECT domain, count(*) AS cnt
     FROM leads
     WHERE domain IS NOT NULL AND is_active = true
     GROUP BY domain HAVING count(*) > 1
     ORDER BY cnt DESC LIMIT 20;`,
    'Report duplicate domains'
  );

  // 4. Add UNIQUE partial index on ico (active leads only)
  // Using CREATE UNIQUE INDEX ... ON CONFLICT will fail if duplicates exist
  // We use IF NOT EXISTS so re-running is safe
  const icoResult = await runSQL(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_ico_active
      ON leads (ico) WHERE ico IS NOT NULL AND is_active = true;`,
    'Create UNIQUE index on ico'
  );

  if (icoResult === null) {
    console.log('\n⚠️  ICO unique index failed — likely existing duplicates. Check report above and resolve manually.');
  }

  // 5. Add UNIQUE partial index on domain (active leads only)
  const domainResult = await runSQL(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_domain_active
      ON leads (domain) WHERE domain IS NOT NULL AND is_active = true;`,
    'Create UNIQUE index on domain'
  );

  if (domainResult === null) {
    console.log('\n⚠️  Domain unique index failed — likely existing duplicates. Check report above and resolve manually.');
  }

  // 6. Add index on domain for dedup RPC lookups
  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_leads_domain_dedup
      ON leads (domain) WHERE domain IS NOT NULL AND is_active = true;`,
    'Create idx_leads_domain_dedup'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
