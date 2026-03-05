import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Migration: Create reorder_template_sequences RPC + fix existing template data
 * Run once: node migrate-reorder-rpc.mjs
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
    return false;
  }

  const data = await res.json();
  console.log('OK:', JSON.stringify(data).slice(0, 300));
  return true;
}

async function main() {
  console.log('=== Reorder Template Sequences RPC Migration ===\n');

  // 1. Drop CHECK constraint if it exists (prevents negative/high temp values)
  await runSQL(`
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_sequence_number_check;
  `, 'Drop sequence_number CHECK constraint');

  // 2. Create the RPC function (uses 1000+ offset to avoid unique conflicts)
  await runSQL(`
CREATE OR REPLACE FUNCTION public.reorder_template_sequences(p_set_id uuid, p_order int[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  old_seq int;
  new_seq int := 1;
BEGIN
  -- Temporarily shift all to 1000+ to avoid unique constraint conflicts
  FOREACH old_seq IN ARRAY p_order LOOP
    UPDATE public.email_templates
    SET sequence_number = 1000 + new_seq
    WHERE template_set_id = p_set_id AND sequence_number = old_seq;
    new_seq := new_seq + 1;
  END LOOP;
  -- Shift back to final values (1001→1, 1002→2, etc.)
  UPDATE public.email_templates
  SET sequence_number = sequence_number - 1000
  WHERE template_set_id = p_set_id AND sequence_number > 1000;
END;
$$;
  `, 'Create reorder_template_sequences RPC');

  // 2. Fix existing template set "test" (c2ef529d-8ce3-4882-a342-877c6efef769)
  // Current: seq 1, 5, 6 → Target: seq 1, 2, 3
  const SET_ID = 'c2ef529d-8ce3-4882-a342-877c6efef769';

  await runSQL(`
-- Use RPC to reorder: [1, 5, 6] → [1, 2, 3]
SELECT public.reorder_template_sequences(
  '${SET_ID}'::uuid,
  ARRAY[1, 5, 6]
);
  `, 'Fix template set "test" sequence numbers (1,5,6 → 1,2,3)');

  // 3. Verify the fix
  await runSQL(`
SELECT id, sequence_number, variant, subject
FROM public.email_templates
WHERE template_set_id = '${SET_ID}'
ORDER BY sequence_number, variant;
  `, 'Verify template sequence numbers');

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
