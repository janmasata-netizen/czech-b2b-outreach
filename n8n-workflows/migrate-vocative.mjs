import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * migrate-vocative.mjs
 * Creates DB functions + trigger for auto-generating Czech vocative salutations on jednatels.
 * Run once: node migrate-vocative.mjs
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
  console.log('OK:', JSON.stringify(data).slice(0, 300));
  return data;
}

async function main() {
  console.log('=== Vocative Migration: Functions + Trigger + Backfill ===\n');

  // A. parse_full_name(p_full_name text) → TABLE(first_name, last_name)
  await runSQL(`
    CREATE OR REPLACE FUNCTION parse_full_name(p_full_name text)
    RETURNS TABLE(first_name text, last_name text) AS $$
    DECLARE
      cleaned text;
      parts text[];
    BEGIN
      cleaned := COALESCE(TRIM(p_full_name), '');

      IF cleaned = '' THEN
        first_name := NULL;
        last_name := NULL;
        RETURN NEXT;
        RETURN;
      END IF;

      -- Strip Czech academic prefix titles (Ing., Mgr., Bc., etc.)
      cleaned := REGEXP_REPLACE(cleaned, '(Ing|Mgr|Bc|PhDr|JUDr|MUDr|RNDr|Doc|Prof|PaedDr|ThDr|Th\\.D|MVDr|ICDr)\\.',  '', 'gi');
      -- Strip suffix titles (Ph.D., MBA, DiS., CSc., DrSc.)
      cleaned := REGEXP_REPLACE(cleaned, ',?\\s*(Ph\\.D\\.|MBA|DiS\\.|CSc\\.|DrSc\\.?)\\s*', '', 'gi');
      -- Normalize whitespace
      cleaned := TRIM(REGEXP_REPLACE(cleaned, '\\s+', ' ', 'g'));

      IF cleaned = '' THEN
        first_name := NULL;
        last_name := NULL;
        RETURN NEXT;
        RETURN;
      END IF;

      parts := STRING_TO_ARRAY(cleaned, ' ');

      IF ARRAY_LENGTH(parts, 1) = 1 THEN
        first_name := NULL;
        last_name := parts[1];
      ELSE
        first_name := parts[1];
        last_name := parts[ARRAY_LENGTH(parts, 1)];
      END IF;

      RETURN NEXT;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `, 'A: parse_full_name function');

  // B. generate_salutation(p_first_name text, p_last_name text) → text
  await runSQL(`
    CREATE OR REPLACE FUNCTION generate_salutation(p_first_name text, p_last_name text)
    RETURNS text AS $$
    DECLARE
      ln text;
      fn text;
      is_female boolean := false;
      vocative text;
    BEGIN
      ln := COALESCE(TRIM(p_last_name), '');
      fn := COALESCE(TRIM(p_first_name), '');

      IF ln = '' THEN RETURN NULL; END IF;

      -- Gender detection: female if last_name ends in -ová/-ská/-cká
      IF ln ~ '(ová|ská|cká)$' THEN
        is_female := true;
      -- Or first_name ends in -a/-e (Czech female first names)
      ELSIF fn != '' AND fn ~ '[ae]$' THEN
        is_female := true;
      END IF;

      -- Female → uninflected
      IF is_female THEN
        RETURN 'paní ' || ln;
      END IF;

      -- Male vocative rules (applied to all names, including foreign)
      vocative := ln;

      -- 1. Adjective-type endings → unchanged
      IF vocative ~* '(ský|cký|ný|tý|ový|ží|ší|čí|ří)$' THEN
        RETURN 'pane ' || vocative;
      END IF;

      -- 2. Specific endings
      IF vocative ~ 'ek$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 2) || 'ku';
        RETURN 'pane ' || vocative;
      END IF;

      IF vocative ~ 'ec$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 2) || 'če';
        RETURN 'pane ' || vocative;
      END IF;

      IF vocative ~ 'el$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 2) || 'le';
        RETURN 'pane ' || vocative;
      END IF;

      -- 3. -a → -o (male surnames: Svoboda → Svobodo)
      IF vocative ~ 'a$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 1) || 'o';
        RETURN 'pane ' || vocative;
      END IF;

      -- 4. Foreign digraphs ending in h (th, ph, gh) → +e (before rule 5 catches standalone h)
      IF vocative ~* '(th|ph|gh)$' THEN
        vocative := vocative || 'e';
        RETURN 'pane ' || vocative;
      END IF;

      -- 5. -k → +u, -h/-g → +u
      IF vocative ~ '[khg]$' THEN
        vocative := vocative || 'u';
        RETURN 'pane ' || vocative;
      END IF;

      -- 6. Soft consonants → +i
      IF vocative ~ '[čřžšňcjďť]$' THEN
        vocative := vocative || 'i';
        RETURN 'pane ' || vocative;
      END IF;

      -- 7. Other consonants → +e
      IF vocative ~ '[bcdfglmnprstvwxzq]$' THEN
        vocative := vocative || 'e';
        RETURN 'pane ' || vocative;
      END IF;

      -- Fallback: uninflected
      RETURN 'pane ' || ln;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `, 'B: generate_salutation function');

  // C. Trigger function + trigger
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
  `, 'C1: fn_auto_salutation trigger function');

  await runSQL(`
    DROP TRIGGER IF EXISTS trg_auto_salutation ON jednatels;
    CREATE TRIGGER trg_auto_salutation
    BEFORE INSERT OR UPDATE ON jednatels
    FOR EACH ROW EXECUTE FUNCTION fn_auto_salutation();
  `, 'C2: trg_auto_salutation trigger');

  // D. backfill_salutations() RPC
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
  `, 'D: backfill_salutations RPC function');

  // E. Run backfill
  console.log('\n--- E: Running backfill ---');
  const result = await runSQL(`SELECT backfill_salutations() as result;`, 'E: Execute backfill');
  if (result && Array.isArray(result) && result.length > 0) {
    console.log('\nBackfill result:', JSON.stringify(result[0]?.result || result[0], null, 2));
  }

  // F. Verification queries
  console.log('\n--- F: Verification ---');
  await runSQL(`SELECT generate_salutation('Jan', 'Novák') as result;`, 'Test: Jan Novák → pane Nováku');
  await runSQL(`SELECT generate_salutation('Jana', 'Nováková') as result;`, 'Test: Jana Nováková → paní Nováková');
  await runSQL(`SELECT generate_salutation('John', 'Smith') as result;`, 'Test: John Smith → pane Smithe');
  await runSQL(`SELECT generate_salutation('Hans', 'Muller') as result;`, 'Test: Hans Muller → pane Mullere');
  await runSQL(`SELECT generate_salutation('Robert', 'Fox') as result;`, 'Test: Robert Fox → pane Foxe');
  await runSQL(`SELECT * FROM parse_full_name('Ing. Jan Novák, Ph.D.');`, 'Test: parse Ing. Jan Novák, Ph.D.');

  console.log('\n=== Vocative migration complete ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
