/**
 * migrate-fix-dedup.mjs
 * Fixes duplicate leads caused by overloaded ingest_lead() functions.
 *
 * Root cause: Three migrations each used CREATE OR REPLACE FUNCTION with
 * different param counts, creating 3 coexisting overloads in PostgreSQL.
 * PostgREST can't reliably resolve which to call → ambiguity/duplicates.
 *
 * This migration:
 *   1. Lists current overloads (diagnostic)
 *   2. Drops the 7-param and 9-param overloads
 *   3. Replaces the 10-param version with enhanced dedup
 *      (adds company_name+team+import_group fallback)
 *   4. Soft-deletes existing duplicate leads (keeps oldest)
 *   5. Replaces unique indexes with team-scoped versions
 *   6. Verifies only 1 overload remains
 *
 * Run once: node migrate-fix-dedup.mjs
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
            if (returnData) {
              resolve(parsed);
            } else {
              resolve(true);
            }
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

// ── Step 1: Diagnostic — list current overloads ──
const SQL_LIST_OVERLOADS = `
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'ingest_lead';
`;

// ── Step 2: Drop old overloads ──
const SQL_DROP_7 = `DROP FUNCTION IF EXISTS public.ingest_lead(text, text, text, text, uuid, text, text);`;
const SQL_DROP_9 = `DROP FUNCTION IF EXISTS public.ingest_lead(text, text, text, text, uuid, text, text, text, jsonb);`;

// ── Step 3: Replace 10-param with enhanced dedup ──
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
  -- 1. Find or create company (dedup by ICO, then domain)
  IF p_ico IS NOT NULL AND p_ico != '' THEN
    SELECT id INTO v_company_id FROM public.companies WHERE ico = p_ico LIMIT 1;
  END IF;
  IF v_company_id IS NULL AND p_domain IS NOT NULL AND p_domain != '' THEN
    SELECT id INTO v_company_id FROM public.companies WHERE domain = p_domain LIMIT 1;
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

  -- 2. Find or create lead (dedup by ICO+team, then domain+team, then company_name+team+import_group)
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
  -- Fallback: dedup by company_name + team + import_group when no ICO/domain
  IF v_lead_id IS NULL AND p_company_name IS NOT NULL AND p_company_name != '' THEN
    SELECT id, status INTO v_lead_id, v_lead_status
    FROM public.leads
    WHERE company_name = p_company_name AND team_id = p_team_id
      AND import_group_id = p_import_group_id
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

// ── Step 4: Soft-delete existing duplicates (keep oldest per group) ──
const SQL_DEDUP_ICO = `
UPDATE public.leads SET is_active = false, updated_at = now()
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY ico, team_id ORDER BY created_at ASC) AS rn
    FROM public.leads WHERE ico IS NOT NULL AND is_active = true
  ) sub WHERE rn > 1
);
`;

const SQL_DEDUP_DOMAIN = `
UPDATE public.leads SET is_active = false, updated_at = now()
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY domain, team_id ORDER BY created_at ASC) AS rn
    FROM public.leads WHERE domain IS NOT NULL AND is_active = true
  ) sub WHERE rn > 1
);
`;

// ── Step 5: Replace unique indexes with team-scoped versions ──
const SQL_INDEXES = `
DROP INDEX IF EXISTS uq_leads_ico_active;
DROP INDEX IF EXISTS uq_leads_domain_active;
CREATE UNIQUE INDEX leads_ico_team_uniq ON public.leads (ico, team_id) WHERE ico IS NOT NULL AND is_active = true;
CREATE UNIQUE INDEX leads_domain_team_uniq ON public.leads (domain, team_id) WHERE domain IS NOT NULL AND is_active = true;
`;

async function main() {
  console.log('\n=== Fix duplicate leads: drop overloads + enhanced dedup ===\n');

  // Step 1: List current overloads
  console.log('Step 1: Listing current ingest_lead() overloads...');
  const overloads = await runSQL('List overloads', SQL_LIST_OVERLOADS, { returnData: true });
  if (overloads) {
    console.log('  Current overloads:');
    for (const row of overloads) {
      console.log(`    → ingest_lead(${row.args})`);
    }
    console.log(`  Total: ${overloads.length} overload(s)\n`);
  } else {
    console.log('  Could not list overloads (non-fatal, continuing...)\n');
  }

  // Step 2: Drop old overloads
  console.log('Step 2: Dropping old overloads...');
  const ok2a = await runSQL('Drop 7-param overload', SQL_DROP_7);
  const ok2b = await runSQL('Drop 9-param overload', SQL_DROP_9);
  console.log('');

  // Step 3: Replace with enhanced dedup version
  console.log('Step 3: Replacing ingest_lead() with enhanced dedup...');
  const ok3 = await runSQL('Create enhanced ingest_lead()', SQL_INGEST_LEAD);
  console.log('');

  // Step 4: Clean existing duplicates
  console.log('Step 4: Soft-deleting existing duplicate leads...');
  const ok4a = await runSQL('Dedup by ICO+team (keep oldest)', SQL_DEDUP_ICO);
  const ok4b = await runSQL('Dedup by domain+team (keep oldest)', SQL_DEDUP_DOMAIN);
  console.log('');

  // Step 5: Replace unique indexes
  console.log('Step 5: Replacing unique indexes with team-scoped versions...');
  const ok5 = await runSQL('Drop old + create team-scoped indexes', SQL_INDEXES);
  console.log('');

  // Step 6: Verify only 1 overload remains
  console.log('Step 6: Verifying overload count...');
  const verify = await runSQL('Verify overloads', SQL_LIST_OVERLOADS, { returnData: true });
  if (verify) {
    console.log(`  Overloads remaining: ${verify.length}`);
    for (const row of verify) {
      console.log(`    → ingest_lead(${row.args})`);
    }
    if (verify.length === 1) {
      console.log('  ✓ Exactly 1 overload — correct!\n');
    } else {
      console.log(`  ⚠ Expected 1 overload, found ${verify.length} — investigate manually\n`);
    }
  }

  const allOk = ok2a && ok2b && ok3 && ok4a && ok4b && ok5;
  if (!allOk) {
    console.log('\n⚠ Some steps failed. Run the following SQL manually in Supabase SQL Editor:');
    console.log('─────────────────────────────────────────────────');
    if (!ok2a) console.log(SQL_DROP_7);
    if (!ok2b) console.log(SQL_DROP_9);
    if (!ok3) console.log(SQL_INGEST_LEAD);
    if (!ok4a) console.log(SQL_DEDUP_ICO);
    if (!ok4b) console.log(SQL_DEDUP_DOMAIN);
    if (!ok5) console.log(SQL_INDEXES);
    console.log('─────────────────────────────────────────────────');
    console.log('\nRefresh SUPABASE_MANAGEMENT_TOKEN in .env.local and re-run.');
    process.exit(1);
  }

  console.log('✅ All done:');
  console.log('   - Old 7-param and 9-param overloads dropped');
  console.log('   - ingest_lead() enhanced with company_name+team+import_group dedup fallback');
  console.log('   - Existing duplicate leads soft-deleted (is_active=false, oldest kept)');
  console.log('   - Unique indexes now team-scoped (ico+team_id, domain+team_id)');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
