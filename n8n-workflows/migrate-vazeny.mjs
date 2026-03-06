import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * migrate-vazeny.mjs
 * Updates generate_salutation() to prepend "Vážený/Vážená" prefix,
 * updates backfill_salutations() to strip old bare prefixes,
 * updates email_templates to remove "Dobrý den" / "Ahoj" greeting prefix,
 * then runs backfill.
 *
 * Run once: node migrate-vazeny.mjs
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
  console.log('=== Vážený/á Salutation Migration ===\n');

  // A. Update generate_salutation() — prepend "Vážený pane" / "Vážená paní"
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
        RETURN 'Vážená paní ' || ln;
      END IF;

      -- Male vocative rules (applied to all names, including foreign)
      vocative := ln;

      -- 1. Adjective-type endings → unchanged
      IF vocative ~* '(ský|cký|ný|tý|ový|ží|ší|čí|ří)$' THEN
        RETURN 'Vážený pane ' || vocative;
      END IF;

      -- 2. Specific endings
      IF vocative ~ 'ek$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 2) || 'ku';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      IF vocative ~ 'ec$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 2) || 'če';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      IF vocative ~ 'el$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 2) || 'le';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      -- 3. -a → -o (male surnames: Svoboda → Svobodo)
      IF vocative ~ 'a$' THEN
        vocative := LEFT(vocative, LENGTH(vocative) - 1) || 'o';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      -- 4. Foreign digraphs ending in h (th, ph, gh) → +e
      IF vocative ~* '(th|ph|gh)$' THEN
        vocative := vocative || 'e';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      -- 5. -k → +u, -h/-g → +u
      IF vocative ~ '[khg]$' THEN
        vocative := vocative || 'u';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      -- 6. Soft consonants → +i
      IF vocative ~ '[čřžšňcjďť]$' THEN
        vocative := vocative || 'i';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      -- 7. Other consonants → +e
      IF vocative ~ '[bcdfglmnprstvwxzq]$' THEN
        vocative := vocative || 'e';
        RETURN 'Vážený pane ' || vocative;
      END IF;

      -- Fallback: uninflected
      RETURN 'Vážený pane ' || ln;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `, 'A: Updated generate_salutation with Vážený/á prefix');

  // B. Update backfill_salutations() — strip old bare prefixes before regenerating
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
      -- 1. Parse names for ALL jednatels with full_name
      FOR rec IN
        SELECT id, full_name FROM jednatels
        WHERE full_name IS NOT NULL
      LOOP
        SELECT * INTO parsed FROM parse_full_name(rec.full_name);
        UPDATE jednatels SET first_name = parsed.first_name, last_name = parsed.last_name WHERE id = rec.id;
        v_names_parsed := v_names_parsed + 1;
      END LOOP;

      -- 2. Strip legacy prefixes from old salutations before regeneration
      --    Handles: "Dobrý den pane X" → "pane X", bare "pane X" / "paní X" without Vážený/á
      UPDATE jednatels
      SET salutation = REGEXP_REPLACE(salutation, '^Dobrý den\\s+', '')
      WHERE salutation LIKE 'Dobrý den %';
      GET DIAGNOSTICS v_prefixes_fixed = ROW_COUNT;

      -- Also strip bare "pane "/"paní " if they exist without "Vážený/á" prefix
      UPDATE jednatels
      SET salutation = REGEXP_REPLACE(salutation, '^(pane|paní)\\s+', '')
      WHERE salutation ~ '^(pane|paní)\\s+'
        AND salutation NOT LIKE 'Vážen%';
      v_prefixes_fixed := v_prefixes_fixed + FOUND::int;

      -- 3. Regenerate salutation for ALL with last_name
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
  `, 'B: Updated backfill_salutations with legacy prefix stripping');

  // C. Update email templates — remove "Dobrý den " and "Ahoj " greeting prefixes
  // Handle all "Dobrý den" patterns: with/without comma, with/without {{salutation}}
  await runSQL(`
    UPDATE email_templates
    SET body_html = REPLACE(body_html, '<p>Dobrý den {{salutation}},</p>', '<p>{{salutation}},</p>')
    WHERE body_html LIKE '%Dobrý den {{salutation}}%';
  `, 'C1: Remove "Dobrý den {{salutation}}," pattern');

  await runSQL(`
    UPDATE email_templates
    SET body_html = REPLACE(body_html, '<p>Dobrý den, {{salutation}},</p>', '<p>{{salutation}},</p>')
    WHERE body_html LIKE '%Dobrý den, {{salutation}},%';
  `, 'C2: Remove "Dobrý den, {{salutation}}," pattern');

  await runSQL(`
    UPDATE email_templates
    SET body_html = REPLACE(body_html, 'Dobrý den {{salutation}}', '{{salutation}}')
    WHERE body_html LIKE '%Dobrý den {{salutation}}%';
  `, 'C3: Remove remaining "Dobrý den {{salutation}}" patterns');

  await runSQL(`
    UPDATE email_templates
    SET body_html = REPLACE(body_html, '<p>Dobrý den,</p>', '<p>{{salutation}},</p>')
    WHERE body_html LIKE '%<p>Dobrý den,</p>%';
  `, 'C4: Replace standalone "Dobrý den," with {{salutation}},');

  await runSQL(`
    UPDATE email_templates
    SET body_html = REPLACE(body_html, '<p>Ahoj {{salutation}},</p>', '<p>{{salutation}},</p>')
    WHERE body_html LIKE '%Ahoj {{salutation}}%';
  `, 'C5: Remove "Ahoj" prefix from templates');

  // D. Run backfill
  console.log('\n--- D: Running backfill ---');
  const result = await runSQL(`SELECT backfill_salutations() as result;`, 'D: Execute backfill');
  if (result && Array.isArray(result) && result.length > 0) {
    console.log('\nBackfill result:', JSON.stringify(result[0]?.result || result[0], null, 2));
  }

  // E. Verification
  console.log('\n--- E: Verification ---');
  await runSQL(`SELECT generate_salutation('Jan', 'Novák') as result;`, 'Test: Jan Novák → Vážený pane Nováku');
  await runSQL(`SELECT generate_salutation('Jana', 'Nováková') as result;`, 'Test: Jana Nováková → Vážená paní Nováková');
  await runSQL(`SELECT generate_salutation('John', 'Smith') as result;`, 'Test: John Smith → Vážený pane Smithe');
  await runSQL(`SELECT full_name, salutation FROM jednatels LIMIT 10;`, 'Spot-check: first 10 jednatels');
  await runSQL(`SELECT id, body_html FROM email_templates;`, 'Verify: templates no longer have Dobrý den prefix');

  console.log('\n=== Vážený/á migration complete ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
