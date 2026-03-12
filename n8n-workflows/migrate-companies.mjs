/**
 * migrate-companies.mjs
 * Phase 1: Creates companies table, contacts table (replaces jednatels),
 * company_tags table, migrates data, adds FKs, recreates triggers.
 *
 * Run once: node migrate-companies.mjs
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
  // ===== 1.1 Create companies table =====
  console.log('\n=== Step 1.1: Create companies table ===');
  await runSQL('Create companies table', `
    CREATE TABLE IF NOT EXISTS public.companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text,
      ico text,
      website text,
      domain text,
      master_status text NOT NULL DEFAULT 'active',
      team_id uuid REFERENCES public.teams(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await runSQL('Create unique index on companies.ico', `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_ico_unique
    ON public.companies (ico) WHERE ico IS NOT NULL AND ico != '';
  `);

  await runSQL('Create unique index on companies.domain', `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_domain_unique
    ON public.companies (domain) WHERE domain IS NOT NULL AND domain != '';
  `);

  await runSQL('Create index on companies.team_id', `
    CREATE INDEX IF NOT EXISTS idx_companies_team_id ON public.companies (team_id);
  `);

  // ===== 1.1b RLS for companies =====
  console.log('\n=== Step 1.1b: RLS for companies ===');
  await runSQL('Enable RLS on companies', `
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
  `);

  await runSQL('RLS: service_role bypass', `
    CREATE POLICY companies_service_role ON public.companies
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  `);

  await runSQL('RLS: authenticated select', `
    CREATE POLICY companies_select ON public.companies
    FOR SELECT TO authenticated
    USING (
      team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  `);

  await runSQL('RLS: authenticated insert', `
    CREATE POLICY companies_insert ON public.companies
    FOR INSERT TO authenticated
    WITH CHECK (
      team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  `);

  await runSQL('RLS: authenticated update', `
    CREATE POLICY companies_update ON public.companies
    FOR UPDATE TO authenticated
    USING (
      team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  `);

  // ===== 1.2 Populate companies from existing leads =====
  console.log('\n=== Step 1.2: Populate companies from leads ===');
  await runSQL('Insert unique companies from leads (dedup by ICO first, then domain)', `
    INSERT INTO public.companies (company_name, ico, website, domain, master_status, team_id, created_at, updated_at)
    SELECT DISTINCT ON (COALESCE(NULLIF(l.ico, ''), '___' || COALESCE(NULLIF(l.domain, ''), l.id::text)))
      l.company_name,
      NULLIF(l.ico, ''),
      l.website,
      NULLIF(l.domain, ''),
      COALESCE(l.master_status, 'active'),
      l.team_id,
      l.created_at,
      l.updated_at
    FROM public.leads l
    ORDER BY COALESCE(NULLIF(l.ico, ''), '___' || COALESCE(NULLIF(l.domain, ''), l.id::text)), l.created_at ASC
    ON CONFLICT DO NOTHING;
  `);

  // ===== 1.3 Add leads.company_id FK =====
  console.log('\n=== Step 1.3: Add leads.company_id FK ===');
  await runSQL('Add company_id column to leads', `
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
  `);

  // Backfill: match by ICO first, then domain
  await runSQL('Backfill leads.company_id from ICO match', `
    UPDATE public.leads l
    SET company_id = c.id
    FROM public.companies c
    WHERE l.company_id IS NULL
      AND l.ico IS NOT NULL AND l.ico != ''
      AND c.ico = l.ico;
  `);

  await runSQL('Backfill leads.company_id from domain match', `
    UPDATE public.leads l
    SET company_id = c.id
    FROM public.companies c
    WHERE l.company_id IS NULL
      AND l.domain IS NOT NULL AND l.domain != ''
      AND c.domain = l.domain;
  `);

  // For any remaining leads without a match, create individual companies
  await runSQL('Create companies for unmatched leads', `
    INSERT INTO public.companies (company_name, ico, website, domain, master_status, team_id, created_at, updated_at)
    SELECT l.company_name, NULLIF(l.ico, ''), l.website, NULLIF(l.domain, ''), COALESCE(l.master_status, 'active'), l.team_id, l.created_at, l.updated_at
    FROM public.leads l
    WHERE l.company_id IS NULL
    ON CONFLICT DO NOTHING;
  `);

  await runSQL('Backfill remaining leads.company_id by matching on id fallback', `
    UPDATE public.leads l
    SET company_id = c.id
    FROM public.companies c
    WHERE l.company_id IS NULL
      AND c.company_name = l.company_name
      AND COALESCE(c.team_id::text, '') = COALESCE(l.team_id::text, '');
  `);

  // Check for any nulls remaining
  await runSQL('Count leads with NULL company_id', `
    SELECT count(*) AS null_company_leads FROM public.leads WHERE company_id IS NULL;
  `);

  await runSQL('Create index on leads.company_id', `
    CREATE INDEX IF NOT EXISTS idx_leads_company_id ON public.leads (company_id);
  `);

  // ===== 1.4 Create contacts table =====
  console.log('\n=== Step 1.4: Create contacts table ===');
  await runSQL('Create contacts table', `
    CREATE TABLE IF NOT EXISTS public.contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      full_name text,
      first_name text,
      last_name text,
      salutation text,
      role text,
      phone text,
      linkedin text,
      other_contact text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await runSQL('Create index on contacts.company_id', `
    CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON public.contacts (company_id);
  `);

  // RLS for contacts
  await runSQL('Enable RLS on contacts', `
    ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
  `);

  await runSQL('RLS: service_role bypass for contacts', `
    CREATE POLICY contacts_service_role ON public.contacts
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  `);

  await runSQL('RLS: authenticated select contacts', `
    CREATE POLICY contacts_select ON public.contacts
    FOR SELECT TO authenticated
    USING (
      company_id IN (
        SELECT c.id FROM public.companies c
        WHERE c.team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      )
    );
  `);

  await runSQL('RLS: authenticated insert contacts', `
    CREATE POLICY contacts_insert ON public.contacts
    FOR INSERT TO authenticated
    WITH CHECK (
      company_id IN (
        SELECT c.id FROM public.companies c
        WHERE c.team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      )
    );
  `);

  await runSQL('RLS: authenticated update contacts', `
    CREATE POLICY contacts_update ON public.contacts
    FOR UPDATE TO authenticated
    USING (
      company_id IN (
        SELECT c.id FROM public.companies c
        WHERE c.team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      )
    );
  `);

  await runSQL('RLS: authenticated delete contacts', `
    CREATE POLICY contacts_delete ON public.contacts
    FOR DELETE TO authenticated
    USING (
      company_id IN (
        SELECT c.id FROM public.companies c
        WHERE c.team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      )
    );
  `);

  // ===== 1.5 Populate contacts from jednatels (reuse same UUIDs) =====
  console.log('\n=== Step 1.5: Populate contacts from jednatels ===');
  await runSQL('Insert contacts from jednatels (reuse UUIDs)', `
    INSERT INTO public.contacts (id, company_id, full_name, first_name, last_name, salutation, role, phone, linkedin, other_contact, notes, created_at, updated_at)
    SELECT
      j.id,
      l.company_id,
      j.full_name,
      j.first_name,
      j.last_name,
      j.salutation,
      j.role,
      j.phone,
      j.linkedin,
      j.other_contact,
      CASE WHEN j.role IS NOT NULL THEN j.role ELSE 'jednatel' END,
      j.created_at,
      COALESCE(j.updated_at, j.created_at)
    FROM public.jednatels j
    JOIN public.leads l ON l.id = j.lead_id
    WHERE l.company_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  `);

  // ===== 1.6 Add email_candidates.contact_id FK =====
  console.log('\n=== Step 1.6: Add email_candidates.contact_id FK ===');
  await runSQL('Add contact_id to email_candidates', `
    ALTER TABLE public.email_candidates ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE;
  `);

  await runSQL('Backfill email_candidates.contact_id from jednatel_id (same UUIDs)', `
    UPDATE public.email_candidates
    SET contact_id = jednatel_id
    WHERE jednatel_id IS NOT NULL AND contact_id IS NULL;
  `);

  await runSQL('Create index on email_candidates.contact_id', `
    CREATE INDEX IF NOT EXISTS idx_email_candidates_contact_id ON public.email_candidates (contact_id);
  `);

  // ===== 1.7 Migrate triggers =====
  console.log('\n=== Step 1.7: Migrate triggers to contacts table ===');

  // Recreate trg_auto_salutation on contacts
  await runSQL('Create trigger fn_auto_salutation_contacts', `
    CREATE OR REPLACE FUNCTION public.fn_auto_salutation_contacts()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_parsed record;
      v_sal text;
    BEGIN
      IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN
        SELECT * INTO v_parsed FROM public.parse_full_name(NEW.full_name);
        NEW.first_name := v_parsed.first_name;
        NEW.last_name := v_parsed.last_name;
        SELECT public.generate_salutation(v_parsed.first_name, v_parsed.last_name) INTO v_sal;
        NEW.salutation := v_sal;
      END IF;
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$;
  `);

  await runSQL('Create trigger trg_auto_salutation on contacts', `
    DROP TRIGGER IF EXISTS trg_auto_salutation ON public.contacts;
    CREATE TRIGGER trg_auto_salutation
      BEFORE INSERT OR UPDATE OF full_name ON public.contacts
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_auto_salutation_contacts();
  `);

  // Update trg_refresh_salutations_on_wave_add to touch contacts via leads.company_id
  await runSQL('Update fn_refresh_salutations_on_wave_add for contacts', `
    CREATE OR REPLACE FUNCTION public.fn_refresh_salutations_on_wave_add()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      -- Touch contacts linked to the lead's company to refresh salutations
      UPDATE public.contacts c
      SET updated_at = now()
      WHERE c.company_id = (SELECT company_id FROM public.leads WHERE id = NEW.lead_id)
        AND c.full_name IS NOT NULL AND c.full_name != '';

      -- Also keep touching jednatels for backward compat (until jednatels dropped)
      UPDATE public.jednatels
      SET updated_at = now()
      WHERE lead_id = NEW.lead_id;

      RETURN NEW;
    END;
    $$;
  `);

  // ===== 1.8 Migrate tags to companies =====
  console.log('\n=== Step 1.8: Migrate tags to companies ===');
  await runSQL('Create company_tags table', `
    CREATE TABLE IF NOT EXISTS public.company_tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, tag_id)
    );
  `);

  await runSQL('Enable RLS on company_tags', `
    ALTER TABLE public.company_tags ENABLE ROW LEVEL SECURITY;
  `);

  await runSQL('RLS: service_role bypass for company_tags', `
    CREATE POLICY company_tags_service_role ON public.company_tags
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  `);

  await runSQL('RLS: authenticated all for company_tags', `
    CREATE POLICY company_tags_authenticated ON public.company_tags
    FOR ALL TO authenticated
    USING (
      company_id IN (
        SELECT c.id FROM public.companies c
        WHERE c.team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      )
    )
    WITH CHECK (
      company_id IN (
        SELECT c.id FROM public.companies c
        WHERE c.team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      )
    );
  `);

  await runSQL('Populate company_tags from lead_tags', `
    INSERT INTO public.company_tags (company_id, tag_id, created_at)
    SELECT DISTINCT l.company_id, lt.tag_id, lt.created_at
    FROM public.lead_tags lt
    JOIN public.leads l ON l.id = lt.lead_id
    WHERE l.company_id IS NOT NULL
    ON CONFLICT (company_id, tag_id) DO NOTHING;
  `);

  // ===== Done =====
  console.log('\n✅ Phase 1 migration complete!');
  console.log('Next: run migrate-companies-rpc.mjs for Phase 2 (RPC functions)');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
