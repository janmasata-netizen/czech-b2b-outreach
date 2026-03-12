/**
 * migrate-companies-rpc.mjs
 * Phase 2: Creates/updates RPC functions to work with companies + contacts.
 * Old functions become wrappers for backward compatibility.
 *
 * Run once (after migrate-companies.mjs): node migrate-companies-rpc.mjs
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

async function main() {
  // ===== New: get_contacts_for_company =====
  console.log('\n=== New RPC: get_contacts_for_company ===');
  await runSQL('Create get_contacts_for_company()', `
    CREATE OR REPLACE FUNCTION public.get_contacts_for_company(p_company_id uuid)
    RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
      SELECT json_build_object(
        'contacts', COALESCE(
          json_agg(
            json_build_object(
              'id', c.id,
              'full_name', c.full_name,
              'first_name', c.first_name,
              'last_name', c.last_name,
              'salutation', c.salutation,
              'role', c.role,
              'phone', c.phone,
              'linkedin', c.linkedin,
              'other_contact', c.other_contact,
              'notes', c.notes
            )
            ORDER BY c.created_at
          ),
          '[]'::json
        ),
        'count', COUNT(c.id)
      )
      FROM public.contacts c
      WHERE c.company_id = p_company_id;
    $$;
  `);

  // ===== New: get_contacts_for_lead =====
  console.log('\n=== New RPC: get_contacts_for_lead ===');
  await runSQL('Create get_contacts_for_lead()', `
    CREATE OR REPLACE FUNCTION public.get_contacts_for_lead(p_lead_id uuid)
    RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
      SELECT json_build_object(
        'contacts', COALESCE(
          json_agg(
            json_build_object(
              'id', c.id,
              'first_name', c.first_name,
              'last_name', c.last_name,
              'salutation', c.salutation
            )
            ORDER BY c.created_at
          ),
          '[]'::json
        ),
        'count', COUNT(c.id)
      )
      FROM public.contacts c
      JOIN public.leads l ON l.company_id = c.company_id
      WHERE l.id = p_lead_id;
    $$;
  `);

  // ===== Update get_jednatels_for_lead to be a wrapper =====
  console.log('\n=== Update get_jednatels_for_lead (wrapper) ===');
  await runSQL('Make get_jednatels_for_lead a wrapper around contacts', `
    CREATE OR REPLACE FUNCTION public.get_jednatels_for_lead(p_lead_id uuid)
    RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
      SELECT json_build_object(
        'jednatels', COALESCE(
          json_agg(
            json_build_object(
              'id', c.id,
              'first_name', c.first_name,
              'last_name', c.last_name,
              'salutation', c.salutation
            )
            ORDER BY c.created_at
          ),
          '[]'::json
        ),
        'count', COUNT(c.id)
      )
      FROM public.contacts c
      JOIN public.leads l ON l.company_id = c.company_id
      WHERE l.id = p_lead_id;
    $$;
  `);

  // ===== New: mark_contacts_email_status =====
  console.log('\n=== New RPC: mark_contacts_email_status ===');
  await runSQL('Create mark_contacts_email_status()', `
    CREATE OR REPLACE FUNCTION public.mark_contacts_email_status(
      p_contact_id uuid,
      p_email text,
      p_status text,
      p_source text DEFAULT NULL
    )
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    BEGIN
      UPDATE public.email_candidates
      SET
        seznam_status = CASE WHEN p_status = 'seznam' THEN 'likely_valid' ELSE seznam_status END,
        qev_status = CASE WHEN p_status = 'qev' THEN p_source ELSE qev_status END,
        is_verified = CASE WHEN p_status IN ('seznam', 'qev') AND p_source IN ('valid', 'likely_valid') THEN true ELSE is_verified END,
        updated_at = now()
      WHERE contact_id = p_contact_id AND email_address = p_email;
    END;
    $$;
  `);

  // ===== Update backfill_salutations to iterate contacts =====
  console.log('\n=== Update backfill_salutations for contacts ===');
  await runSQL('Update backfill_salutations to use contacts', `
    CREATE OR REPLACE FUNCTION public.backfill_salutations()
    RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
      v_count integer := 0;
      rec record;
      v_parsed record;
      v_sal text;
    BEGIN
      FOR rec IN
        SELECT id, full_name FROM public.contacts
        WHERE full_name IS NOT NULL AND full_name != ''
      LOOP
        SELECT * INTO v_parsed FROM public.parse_full_name(rec.full_name);
        SELECT public.generate_salutation(v_parsed.first_name, v_parsed.last_name) INTO v_sal;
        UPDATE public.contacts
        SET first_name = v_parsed.first_name,
            last_name = v_parsed.last_name,
            salutation = v_sal,
            updated_at = now()
        WHERE id = rec.id;
        v_count := v_count + 1;
      END LOOP;

      -- Also backfill jednatels for backward compat
      FOR rec IN
        SELECT id, full_name FROM public.jednatels
        WHERE full_name IS NOT NULL AND full_name != ''
      LOOP
        SELECT * INTO v_parsed FROM public.parse_full_name(rec.full_name);
        SELECT public.generate_salutation(v_parsed.first_name, v_parsed.last_name) INTO v_sal;
        UPDATE public.jednatels
        SET first_name = v_parsed.first_name,
            last_name = v_parsed.last_name,
            salutation = v_sal,
            updated_at = now()
        WHERE id = rec.id;
      END LOOP;

      RETURN json_build_object('updated', v_count);
    END;
    $$;
  `);

  // ===== Update ingest_lead to create/find company first =====
  console.log('\n=== Update ingest_lead for companies ===');
  await runSQL('Update ingest_lead to upsert company', `
    CREATE OR REPLACE FUNCTION public.ingest_lead(
      p_company_name text,
      p_ico text DEFAULT NULL,
      p_website text DEFAULT NULL,
      p_domain text DEFAULT NULL,
      p_team_id uuid DEFAULT NULL,
      p_status text DEFAULT 'new',
      p_lead_type text DEFAULT 'company'
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
        -- Update company info if better data available
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
        -- Update existing lead
        UPDATE public.leads
        SET company_name = COALESCE(NULLIF(p_company_name, ''), company_name),
            website = COALESCE(NULLIF(p_website, ''), website),
            domain = COALESCE(NULLIF(p_domain, ''), domain),
            company_id = v_company_id,
            updated_at = now()
        WHERE id = v_lead_id;
      ELSE
        -- Create new lead
        INSERT INTO public.leads (company_name, ico, website, domain, team_id, status, lead_type, company_id)
        VALUES (p_company_name, p_ico, p_website, p_domain, p_team_id, p_status, p_lead_type, v_company_id)
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
  `);

  console.log('\n✅ Phase 2 RPC migration complete!');
  console.log('Next: Update n8n workflows (Phase 3) and UI (Phase 4)');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
