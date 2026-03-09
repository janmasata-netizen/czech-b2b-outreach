import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Lead deduplication migration
 * Creates check_lead_duplicates() RPC + performance indexes
 * Run once: node migrate-dedup.mjs
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
  console.log('=== Lead Dedup Migration ===\n');

  // Index: leads.ico (for ICO dedup lookups)
  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_leads_ico_dedup
      ON leads (ico) WHERE ico IS NOT NULL AND is_active = true;`,
    'Create idx_leads_ico_dedup'
  );

  // Index: leads.lower(company_name) (for case-insensitive company name dedup)
  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_leads_company_lower
      ON leads (lower(company_name)) WHERE is_active = true;`,
    'Create idx_leads_company_lower'
  );

  // Index: email_candidates.email_address (for email dedup lookups)
  await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_email_candidates_address
      ON email_candidates (email_address);`,
    'Create idx_email_candidates_address'
  );

  // RPC: check_lead_duplicates
  // Takes a JSON array of candidates [{ico, domain, email, company_name}, ...]
  // Returns matches: [{candidate_index, match_field, match_value, existing_lead_id, existing_company}]
  await runSQL(
    `CREATE OR REPLACE FUNCTION check_lead_duplicates(
      candidates jsonb
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
      result jsonb := '[]'::jsonb;
      candidate jsonb;
      i int := 0;
      rec record;
    BEGIN
      FOR candidate IN SELECT * FROM jsonb_array_elements(candidates)
      LOOP
        -- ICO match
        IF candidate->>'ico' IS NOT NULL AND candidate->>'ico' != '' THEN
          FOR rec IN
            SELECT id, company_name FROM leads
            WHERE ico = candidate->>'ico'
              AND is_active = true
            LIMIT 1
          LOOP
            result := result || jsonb_build_array(jsonb_build_object(
              'candidate_index', i,
              'match_field', 'ico',
              'match_value', candidate->>'ico',
              'existing_lead_id', rec.id,
              'existing_company', rec.company_name
            ));
          END LOOP;
        END IF;

        -- Domain match
        IF candidate->>'domain' IS NOT NULL AND candidate->>'domain' != '' THEN
          FOR rec IN
            SELECT id, company_name FROM leads
            WHERE domain = candidate->>'domain'
              AND is_active = true
            LIMIT 1
          LOOP
            result := result || jsonb_build_array(jsonb_build_object(
              'candidate_index', i,
              'match_field', 'domain',
              'match_value', candidate->>'domain',
              'existing_lead_id', rec.id,
              'existing_company', rec.company_name
            ));
          END LOOP;
        END IF;

        -- Email match (2-hop: email_candidates → jednatels → leads)
        IF candidate->>'email' IS NOT NULL AND candidate->>'email' != '' THEN
          FOR rec IN
            SELECT l.id, l.company_name FROM email_candidates ec
            JOIN jednatels j ON j.id = ec.jednatel_id
            JOIN leads l ON l.id = j.lead_id
            WHERE ec.email_address = lower(candidate->>'email')
              AND l.is_active = true
            LIMIT 1
          LOOP
            result := result || jsonb_build_array(jsonb_build_object(
              'candidate_index', i,
              'match_field', 'email',
              'match_value', candidate->>'email',
              'existing_lead_id', rec.id,
              'existing_company', rec.company_name
            ));
          END LOOP;
        END IF;

        -- Company name match (case-insensitive)
        IF candidate->>'company_name' IS NOT NULL AND candidate->>'company_name' != '' THEN
          FOR rec IN
            SELECT id, company_name FROM leads
            WHERE lower(company_name) = lower(candidate->>'company_name')
              AND is_active = true
            LIMIT 1
          LOOP
            result := result || jsonb_build_array(jsonb_build_object(
              'candidate_index', i,
              'match_field', 'company_name',
              'match_value', candidate->>'company_name',
              'existing_lead_id', rec.id,
              'existing_company', rec.company_name
            ));
          END LOOP;
        END IF;

        i := i + 1;
      END LOOP;

      RETURN result;
    END;
    $$;`,
    'Create check_lead_duplicates RPC'
  );

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
