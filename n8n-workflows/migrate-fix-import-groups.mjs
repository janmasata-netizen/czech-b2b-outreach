/**
 * migrate-fix-import-groups.mjs
 * Fixes two bugs causing import groups to show 0 leads:
 *
 * 1. Adds p_import_group_id to ingest_lead() so it's set atomically inside
 *    the SECURITY DEFINER function (bypasses RLS). Previously the UI did a
 *    separate .update() that was silently blocked by RLS.
 *
 * 2. Adds email_candidates RLS policies for the contact_id path. Existing
 *    policies only check via jednatel_id → jednatels → leads. The UI inserts
 *    with contact_id (not jednatel_id), so INSERTs were silently blocked.
 *
 * Run once: node migrate-fix-import-groups.mjs
 */

import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

function runSQL(label, query) {
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
            resolve(false);
          } else {
            console.log(`  ✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error — ${data.slice(0, 200)}`);
          resolve(false);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ── 1. Update ingest_lead() with p_import_group_id ──
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

  -- 2. Find or create lead (dedup by ICO+team, then domain+team)
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

// ── 2. Add email_candidates RLS policies for contact_id path ──
const SQL_EC_SELECT = `
CREATE POLICY ec_select_contact ON public.email_candidates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.contacts ct
      JOIN public.companies co ON co.id = ct.company_id
      WHERE ct.id = email_candidates.contact_id
        AND (co.team_id = current_user_team_id() OR current_user_is_admin())
    )
  );
`;

const SQL_EC_INSERT = `
CREATE POLICY ec_insert_contact ON public.email_candidates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts ct
      JOIN public.companies co ON co.id = ct.company_id
      WHERE ct.id = email_candidates.contact_id
        AND (co.team_id = current_user_team_id() OR current_user_is_admin())
    )
  );
`;

const SQL_EC_UPDATE = `
CREATE POLICY ec_update_contact ON public.email_candidates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.contacts ct
      JOIN public.companies co ON co.id = ct.company_id
      WHERE ct.id = email_candidates.contact_id
        AND (co.team_id = current_user_team_id() OR current_user_is_admin())
    )
  );
`;

async function main() {
  console.log('\n=== Fix import groups: ingest_lead + email_candidates RLS ===\n');

  // Step 1: Update ingest_lead()
  const ok1 = await runSQL('Update ingest_lead() with p_import_group_id', SQL_INGEST_LEAD);

  // Step 2: Add email_candidates RLS policies for contact_id path
  const ok2 = await runSQL('Add ec_select_contact policy', SQL_EC_SELECT);
  const ok3 = await runSQL('Add ec_insert_contact policy', SQL_EC_INSERT);
  const ok4 = await runSQL('Add ec_update_contact policy', SQL_EC_UPDATE);

  if (!ok1 || !ok2 || !ok3 || !ok4) {
    console.log('\n⚠ Some steps failed. If management API token expired, run SQL manually:');
    console.log('─────────────────────────────────────────────────');
    if (!ok1) console.log(SQL_INGEST_LEAD);
    if (!ok2) console.log(SQL_EC_SELECT);
    if (!ok3) console.log(SQL_EC_INSERT);
    if (!ok4) console.log(SQL_EC_UPDATE);
    console.log('─────────────────────────────────────────────────');
    console.log('\nRefresh SUPABASE_MANAGEMENT_TOKEN in .env.local and re-run.');
    process.exit(1);
  }

  console.log('\n✅ All done:');
  console.log('   - ingest_lead() now accepts p_import_group_id (10th param, DEFAULT NULL)');
  console.log('   - email_candidates has 3 new RLS policies for contact_id path');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
