import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * migrate-diacritics-fix.mjs
 * Fixes diacritics loss in jednatels.first_name/last_name.
 *
 * Root cause: WF1/WF3 pre-fill first_name/last_name (stripping diacritics),
 * and the trigger only parsed full_name when both were NULL.
 *
 * Fix: trigger now ALWAYS re-derives first_name/last_name from full_name,
 * and backfill re-parses ALL existing rows.
 *
 * Run once: node migrate-diacritics-fix.mjs
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
  console.log('=== Diacritics Fix: Trigger + Backfill ===\n');

  // 1. Update fn_auto_salutation — always re-parse from full_name
  await runSQL(`
    CREATE OR REPLACE FUNCTION fn_auto_salutation()
    RETURNS TRIGGER AS $$
    DECLARE
      parsed RECORD;
    BEGIN
      -- Always derive first_name/last_name from full_name (source of truth)
      IF NEW.full_name IS NOT NULL THEN
        SELECT * INTO parsed FROM parse_full_name(NEW.full_name);
        NEW.first_name := parsed.first_name;
        NEW.last_name := parsed.last_name;
      END IF;

      -- Always regenerate salutation from (re-parsed) last_name
      IF NEW.last_name IS NOT NULL THEN
        NEW.salutation := generate_salutation(NEW.first_name, NEW.last_name);
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `, '1: Update fn_auto_salutation (always re-parse from full_name)');

  // 2. Update backfill_salutations — re-parse ALL rows with full_name
  await runSQL(`
    CREATE OR REPLACE FUNCTION backfill_salutations()
    RETURNS jsonb AS $$
    DECLARE
      v_names_parsed int := 0;
      v_salutations_generated int := 0;
      v_prefixes_fixed int := 0;
      rec RECORD;
      parsed RECORD;
    BEGIN
      -- 1. Parse names for ALL jednatels with full_name (overwrite WF1/WF3 values)
      FOR rec IN
        SELECT id, full_name FROM jednatels
        WHERE full_name IS NOT NULL
      LOOP
        SELECT * INTO parsed FROM parse_full_name(rec.full_name);
        UPDATE jednatels SET first_name = parsed.first_name, last_name = parsed.last_name WHERE id = rec.id;
        v_names_parsed := v_names_parsed + 1;
      END LOOP;

      -- 2. Strip "Dobrý den " prefix from old WF3-format salutations (before generating new ones)
      UPDATE jednatels
      SET salutation = REGEXP_REPLACE(salutation, '^Dobrý den\\s+', '')
      WHERE salutation LIKE 'Dobrý den %';
      GET DIAGNOSTICS v_prefixes_fixed = ROW_COUNT;

      -- 3. Regenerate salutation for ALL with last_name (not just NULL salutation)
      FOR rec IN
        SELECT id, first_name, last_name FROM jednatels
        WHERE last_name IS NOT NULL
      LOOP
        UPDATE jednatels
        SET salutation = generate_salutation(rec.first_name, rec.last_name)
        WHERE id = rec.id;
        v_salutations_generated := v_salutations_generated + 1;
      END LOOP;

      RETURN jsonb_build_object(
        'names_parsed', v_names_parsed,
        'salutations_generated', v_salutations_generated,
        'prefixes_fixed', v_prefixes_fixed
      );
    END;
    $$ LANGUAGE plpgsql;
  `, '2: Update backfill_salutations (re-parse ALL rows)');

  // 3. Run backfill to fix existing data
  console.log('\n--- 3: Running backfill ---');
  const result = await runSQL(`SELECT backfill_salutations() as result;`, '3: Execute backfill');
  if (result && Array.isArray(result) && result.length > 0) {
    console.log('\nBackfill result:', JSON.stringify(result[0]?.result || result[0], null, 2));
  }

  // 4. Verification — check existing data
  console.log('\n--- 4: Verification ---');
  await runSQL(
    `SELECT full_name, first_name, last_name, salutation FROM jednatels LIMIT 20;`,
    'Verify: existing jednatels data'
  );

  // 5. Test new insert behavior (insert + select + delete)
  await runSQL(`
    DO $$
    DECLARE
      test_lead_id uuid;
      test_jednatel_id uuid;
      rec RECORD;
    BEGIN
      -- Find any lead to use as FK
      SELECT id INTO test_lead_id FROM leads LIMIT 1;
      IF test_lead_id IS NULL THEN
        RAISE NOTICE 'No leads found, skipping insert test';
        RETURN;
      END IF;

      -- Insert with wrong first/last (simulating WF1/WF3 behavior)
      INSERT INTO jednatels (full_name, first_name, last_name, lead_id)
      VALUES ('Jan Mašata', 'Jan', 'Masata', test_lead_id)
      RETURNING id INTO test_jednatel_id;

      SELECT full_name, first_name, last_name, salutation INTO rec
      FROM jednatels WHERE id = test_jednatel_id;

      RAISE NOTICE 'Test insert: full_name=%, first_name=%, last_name=%, salutation=%',
        rec.full_name, rec.first_name, rec.last_name, rec.salutation;

      -- Verify diacritics preserved
      IF rec.last_name != 'Mašata' THEN
        RAISE WARNING 'FAIL: last_name should be Mašata but got %', rec.last_name;
      ELSE
        RAISE NOTICE 'PASS: diacritics preserved in last_name';
      END IF;

      -- Clean up test row
      DELETE FROM jednatels WHERE id = test_jednatel_id;
    END $$;
  `, '5: Test insert with wrong first/last (trigger should overwrite)');

  console.log('\n=== Diacritics fix migration complete ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
