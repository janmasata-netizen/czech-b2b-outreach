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
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.log(`✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 400));
            resolve(false);
          } else {
            console.log(`✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`✗ ${label}: parse error -`, data.slice(0, 200));
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { console.log(`✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Company Name Detection Migration ===\n');

  // Step A: Create is_likely_company_name() function
  await runSQL('Create is_likely_company_name()', `
    CREATE OR REPLACE FUNCTION is_likely_company_name(p_name text)
    RETURNS boolean
    LANGUAGE plpgsql
    IMMUTABLE
    AS $$
    BEGIN
      IF p_name IS NULL OR trim(p_name) = '' THEN
        RETURN false;
      END IF;

      -- Czech legal entity suffixes (conservative — only unambiguous ones)
      IF trim(p_name) ~* E'(?:s\\.\\s?r\\.\\s?o\\.|spol\\.\\s?s\\s?r\\.o\\.|a\\.\\s?s\\.|k\\.\\s?s\\.|v\\.\\s?o\\.\\s?s\\.|z\\.\\s?s\\.|o\\.\\s?s\\.|o\\.\\s?p\\.\\s?s\\.|s\\.\\s?p\\.|z\\.\\s?ú\\.)\\s*$' THEN
        RETURN true;
      END IF;

      -- Trailing SE (e.g. "Energo SE")
      IF trim(p_name) ~* E'\\S+\\s+SE\\s*$' THEN
        RETURN true;
      END IF;

      -- Embedded 8-digit IČO
      IF trim(p_name) ~ E'\\d{8}' THEN
        RETURN true;
      END IF;

      RETURN false;
    END;
    $$;
  `);

  // Step B: Update fn_auto_salutation_contacts() trigger on contacts table
  await runSQL('Update fn_auto_salutation_contacts() with company guard', `
    CREATE OR REPLACE FUNCTION fn_auto_salutation_contacts()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_parts  record;
      v_sal    text;
    BEGIN
      -- Skip salutation for company names
      IF is_likely_company_name(NEW.full_name) THEN
        NEW.first_name := NULL;
        NEW.last_name := NULL;
        NEW.salutation := NULL;
        RETURN NEW;
      END IF;

      -- Parse full_name → first_name / last_name
      IF NEW.full_name IS NOT NULL AND trim(NEW.full_name) <> '' THEN
        v_parts := parse_full_name(NEW.full_name);
        NEW.first_name := v_parts.first_name;
        NEW.last_name  := v_parts.last_name;
      ELSE
        NEW.first_name := NULL;
        NEW.last_name  := NULL;
        NEW.salutation := NULL;
        RETURN NEW;
      END IF;

      -- Generate salutation (Czech vocative)
      IF NEW.last_name IS NOT NULL AND trim(NEW.last_name) <> '' THEN
        v_sal := generate_salutation(NEW.full_name);
        NEW.salutation := v_sal;
      ELSE
        NEW.salutation := NULL;
      END IF;

      RETURN NEW;
    END;
    $$;
  `);

  // Step C: Update fn_auto_salutation() trigger on jednatels table (backward compat)
  await runSQL('Update fn_auto_salutation() with company guard', `
    CREATE OR REPLACE FUNCTION fn_auto_salutation()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_parts  record;
      v_sal    text;
    BEGIN
      -- Skip salutation for company names
      IF is_likely_company_name(NEW.full_name) THEN
        NEW.first_name := NULL;
        NEW.last_name := NULL;
        NEW.salutation := NULL;
        RETURN NEW;
      END IF;

      -- Parse full_name → first_name / last_name
      IF NEW.full_name IS NOT NULL AND trim(NEW.full_name) <> '' THEN
        v_parts := parse_full_name(NEW.full_name);
        NEW.first_name := v_parts.first_name;
        NEW.last_name  := v_parts.last_name;
      ELSE
        NEW.first_name := NULL;
        NEW.last_name  := NULL;
        NEW.salutation := NULL;
        RETURN NEW;
      END IF;

      -- Generate salutation (Czech vocative)
      IF NEW.last_name IS NOT NULL AND trim(NEW.last_name) <> '' THEN
        v_sal := generate_salutation(NEW.full_name);
        NEW.salutation := v_sal;
      ELSE
        NEW.salutation := NULL;
      END IF;

      RETURN NEW;
    END;
    $$;
  `);

  // Step D: Backfill — clear salutation for existing company names in contacts
  await runSQL('Backfill contacts: clear salutation for company names', `
    UPDATE contacts
    SET salutation = NULL, first_name = NULL, last_name = NULL
    WHERE is_likely_company_name(full_name);
  `);

  // Step E: Backfill — clear salutation for existing company names in jednatels
  await runSQL('Backfill jednatels: clear salutation for company names', `
    UPDATE jednatels
    SET salutation = NULL, first_name = NULL, last_name = NULL
    WHERE is_likely_company_name(full_name);
  `);

  console.log('\n=== Done ===');
}

main();
