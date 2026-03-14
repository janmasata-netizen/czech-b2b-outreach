/**
 * migrate-fix-ingest-lead.mjs
 * Fixes ingest_lead() RPC signature mismatch:
 * UI sends p_language + p_custom_fields but the function only accepts 7 params → PGRST202 (404).
 * Adds p_language and p_custom_fields with defaults so existing callers still work.
 *
 * Run once: node migrate-fix-ingest-lead.mjs
 */

import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

function runSQL_management(label, query) {
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
            console.log(`  ✗ ${label} (management API): ${JSON.stringify(parsed).slice(0, 400)}`);
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

function runSQL_rpc(label, query) {
  return new Promise((resolve) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/rpc/exec_sql');
    // Try via pg_net or a custom RPC — fallback: use the raw pg connection
    // Actually, the simplest approach: call the Supabase SQL editor endpoint
    // Or use the dashboard API. Let's try management API first, then fallback.
    resolve(false);
  });
}

const SQL = `
    CREATE OR REPLACE FUNCTION public.ingest_lead(
      p_company_name text,
      p_ico text DEFAULT NULL,
      p_website text DEFAULT NULL,
      p_domain text DEFAULT NULL,
      p_team_id uuid DEFAULT NULL,
      p_status text DEFAULT 'new',
      p_lead_type text DEFAULT 'company',
      p_language text DEFAULT 'cs',
      p_custom_fields jsonb DEFAULT '{}'
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
            updated_at = now()
        WHERE id = v_lead_id;
      ELSE
        INSERT INTO public.leads (company_name, ico, website, domain, team_id, status, lead_type, company_id, language, custom_fields)
        VALUES (p_company_name, p_ico, p_website, p_domain, p_team_id, p_status, p_lead_type, v_company_id, p_language, p_custom_fields)
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

async function main() {
  console.log('\n=== Fix ingest_lead() — add p_language + p_custom_fields ===');

  // Try management API first
  let ok = await runSQL_management('Update ingest_lead signature', SQL);

  if (!ok) {
    console.log('\n  Management API failed (token may be expired).');
    console.log('  Please run this SQL manually in the Supabase SQL Editor:');
    console.log('  ─────────────────────────────────────────────────');
    console.log(SQL);
    console.log('  ─────────────────────────────────────────────────');
    console.log('\n  Or refresh your SUPABASE_MANAGEMENT_TOKEN in .env.local and re-run.');
    process.exit(1);
  }

  console.log('\n✅ ingest_lead() updated — now accepts p_language + p_custom_fields');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
