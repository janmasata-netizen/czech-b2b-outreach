/**
 * migrate-fix-dedup-v2.mjs
 * Fixes duplicate detection to check BOTH leads and companies tables.
 *
 * Issues fixed:
 *   1. check_lead_duplicates() only checked leads table — now also checks companies
 *   2. ingest_lead() company_name fallback was scoped to import_group_id — now checks team-wide
 *   3. check_lead_duplicates() email check only used jednatels path — now also checks contacts
 *
 * Run once: node migrate-fix-dedup-v2.mjs
 */

import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

function runSQL(label, query, { returnData = false } = {}) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.log(`  ✗ ${label}: ${JSON.stringify(parsed).slice(0, 400)}`);
            resolve(returnData ? null : false);
          } else {
            console.log(`  ✓ ${label}`);
            resolve(returnData ? parsed : true);
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error — ${data.slice(0, 200)}`);
          resolve(returnData ? null : false);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(returnData ? null : false); });
    req.write(body);
    req.end();
  });
}

// ── 1. Update check_lead_duplicates to check BOTH leads AND companies ──
const SQL_CHECK_DUPLICATES = `
CREATE OR REPLACE FUNCTION check_lead_duplicates(
  candidates jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  candidate jsonb;
  i int := 0;
  rec record;
  found_ico boolean;
  found_domain boolean;
BEGIN
  FOR candidate IN SELECT * FROM jsonb_array_elements(candidates)
  LOOP
    found_ico := false;
    found_domain := false;

    -- ICO match: check leads first, then companies
    IF candidate->>'ico' IS NOT NULL AND candidate->>'ico' != '' THEN
      FOR rec IN
        SELECT id, company_name, 'leads' AS source FROM leads
        WHERE ico = candidate->>'ico' AND is_active = true
        UNION ALL
        SELECT id, company_name, 'companies' AS source FROM companies
        WHERE ico = candidate->>'ico'
        LIMIT 1
      LOOP
        found_ico := true;
        result := result || jsonb_build_array(jsonb_build_object(
          'candidate_index', i,
          'match_field', 'ico',
          'match_value', candidate->>'ico',
          'existing_lead_id', rec.id,
          'existing_company', rec.company_name
        ));
      END LOOP;
    END IF;

    -- Domain match: check leads first, then companies
    IF NOT found_ico AND candidate->>'domain' IS NOT NULL AND candidate->>'domain' != '' THEN
      FOR rec IN
        SELECT id, company_name, 'leads' AS source FROM leads
        WHERE domain = candidate->>'domain' AND is_active = true
        UNION ALL
        SELECT id, company_name, 'companies' AS source FROM companies
        WHERE domain = candidate->>'domain'
        LIMIT 1
      LOOP
        found_domain := true;
        result := result || jsonb_build_array(jsonb_build_object(
          'candidate_index', i,
          'match_field', 'domain',
          'match_value', candidate->>'domain',
          'existing_lead_id', rec.id,
          'existing_company', rec.company_name
        ));
      END LOOP;
    END IF;

    -- Email match: check via contacts (new) and jednatels (legacy)
    IF candidate->>'email' IS NOT NULL AND candidate->>'email' != '' THEN
      FOR rec IN
        SELECT DISTINCT l.id, l.company_name FROM email_candidates ec
        JOIN contacts ct ON ct.id = ec.contact_id
        JOIN companies co ON co.id = ct.company_id
        JOIN leads l ON l.company_id = co.id
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

      -- Also check via jednatels (legacy path)
      IF NOT FOUND THEN
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
    END IF;

    -- Company name match (case-insensitive): check leads then companies
    IF NOT found_ico AND NOT found_domain
       AND candidate->>'company_name' IS NOT NULL AND candidate->>'company_name' != '' THEN
      FOR rec IN
        SELECT id, company_name, 'leads' AS source FROM leads
        WHERE lower(company_name) = lower(candidate->>'company_name')
          AND is_active = true
        UNION ALL
        SELECT id, company_name, 'companies' AS source FROM companies
        WHERE lower(company_name) = lower(candidate->>'company_name')
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
$$;
`;

// ── 2. Update ingest_lead: company_name fallback without import_group_id scope ──
const SQL_INGEST_LEAD = `
CREATE OR REPLACE FUNCTION public.ingest_lead(
  p_company_name text,
  p_ico text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_status text DEFAULT 'new',
  p_lead_type text DEFAULT 'company',
  p_language text DEFAULT 'cs',
  p_custom_fields jsonb DEFAULT '{}',
  p_import_group_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_lead_id uuid;
  v_lead_status text;
  v_is_new boolean := false;
BEGIN
  -- 1. Find or create company (dedup by ICO, then domain, then company_name)
  IF p_ico IS NOT NULL AND p_ico != '' THEN
    SELECT id INTO v_company_id FROM public.companies WHERE ico = p_ico LIMIT 1;
  END IF;
  IF v_company_id IS NULL AND p_domain IS NOT NULL AND p_domain != '' THEN
    SELECT id INTO v_company_id FROM public.companies WHERE domain = p_domain LIMIT 1;
  END IF;
  IF v_company_id IS NULL AND p_company_name IS NOT NULL AND p_company_name != '' THEN
    SELECT id INTO v_company_id FROM public.companies
    WHERE lower(company_name) = lower(p_company_name)
      AND (team_id = p_team_id OR team_id IS NULL)
    LIMIT 1;
  END IF;
  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (company_name, ico, website, domain, team_id)
    VALUES (p_company_name, NULLIF(p_ico, ''), p_website, NULLIF(p_domain, ''), p_team_id)
    RETURNING id INTO v_company_id;
  ELSE
    UPDATE public.companies
    SET company_name = COALESCE(NULLIF(p_company_name, ''), company_name),
        website = COALESCE(NULLIF(p_website, ''), website),
        domain = COALESCE(NULLIF(p_domain, ''), domain),
        updated_at = now()
    WHERE id = v_company_id;
  END IF;

  -- 2. Find or create lead (dedup by ICO+team, then domain+team, then company_id+team)
  IF p_ico IS NOT NULL AND p_ico != '' THEN
    SELECT id, status INTO v_lead_id, v_lead_status
    FROM public.leads
    WHERE ico = p_ico AND team_id = p_team_id
    LIMIT 1;
  END IF;
  IF v_lead_id IS NULL AND p_domain IS NOT NULL AND p_domain != '' THEN
    SELECT id, status INTO v_lead_id, v_lead_status
    FROM public.leads
    WHERE domain = p_domain AND team_id = p_team_id
    LIMIT 1;
  END IF;
  -- Fallback: dedup by company_id + team (catches company_name matches across all import groups)
  IF v_lead_id IS NULL AND v_company_id IS NOT NULL THEN
    SELECT id, status INTO v_lead_id, v_lead_status
    FROM public.leads
    WHERE company_id = v_company_id AND team_id = p_team_id
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET company_name = COALESCE(NULLIF(p_company_name, ''), company_name),
        website = COALESCE(NULLIF(p_website, ''), website),
        domain = COALESCE(NULLIF(p_domain, ''), domain),
        company_id = v_company_id,
        language = p_language,
        custom_fields = CASE WHEN p_custom_fields != '{}'::jsonb THEN p_custom_fields ELSE custom_fields END,
        import_group_id = COALESCE(p_import_group_id, import_group_id),
        updated_at = now()
    WHERE id = v_lead_id;
  ELSE
    INSERT INTO public.leads (company_name, ico, website, domain, team_id, status, lead_type, company_id, language, custom_fields, import_group_id)
    VALUES (p_company_name, p_ico, p_website, p_domain, p_team_id, p_status, p_lead_type, v_company_id, p_language, p_custom_fields, p_import_group_id)
    RETURNING id INTO v_lead_id;
    v_is_new := true;
  END IF;

  RETURN json_build_object(
    'lead_id', v_lead_id,
    'company_id', v_company_id,
    'is_new', v_is_new,
    'status', COALESCE(v_lead_status, p_status)
  );
END;
$$;
`;

// ── 3. Add index on companies for company_name dedup ──
const SQL_COMPANY_NAME_INDEX = `
CREATE INDEX IF NOT EXISTS idx_companies_name_lower
  ON public.companies (lower(company_name));
`;

const SQL_COMPANY_DOMAIN_INDEX = `
CREATE INDEX IF NOT EXISTS idx_companies_domain
  ON public.companies (domain) WHERE domain IS NOT NULL;
`;

async function main() {
  console.log('\n=== Fix dedup v2: check both leads AND companies ===\n');

  // Step 1: Update check_lead_duplicates
  console.log('Step 1: Updating check_lead_duplicates() to check both tables...');
  const ok1 = await runSQL('Update check_lead_duplicates()', SQL_CHECK_DUPLICATES);

  // Step 2: Update ingest_lead
  console.log('\nStep 2: Updating ingest_lead() with cross-group company_id dedup...');
  const ok2 = await runSQL('Update ingest_lead()', SQL_INGEST_LEAD);

  // Step 3: Add performance indexes
  console.log('\nStep 3: Adding performance indexes on companies...');
  const ok3a = await runSQL('Index companies.company_name (lower)', SQL_COMPANY_NAME_INDEX);
  const ok3b = await runSQL('Index companies.domain', SQL_COMPANY_DOMAIN_INDEX);

  const allOk = ok1 && ok2 && ok3a && ok3b;
  if (!allOk) {
    console.log('\n⚠ Some steps failed. Run SQL manually in Supabase SQL Editor:');
    console.log('─────────────────────────────────────────────────');
    if (!ok1) console.log(SQL_CHECK_DUPLICATES);
    if (!ok2) console.log(SQL_INGEST_LEAD);
    if (!ok3a) console.log(SQL_COMPANY_NAME_INDEX);
    if (!ok3b) console.log(SQL_COMPANY_DOMAIN_INDEX);
    console.log('─────────────────────────────────────────────────');
    console.log('\nRefresh SUPABASE_MANAGEMENT_TOKEN in .env.local and re-run.');
    process.exit(1);
  }

  console.log('\n✅ All done:');
  console.log('   - check_lead_duplicates() now checks BOTH leads AND companies tables');
  console.log('   - ingest_lead() company dedup now uses company_name (case-insensitive) + company_id fallback');
  console.log('   - Email dedup now checks via contacts (new) + jednatels (legacy)');
  console.log('   - Performance indexes added on companies table');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
