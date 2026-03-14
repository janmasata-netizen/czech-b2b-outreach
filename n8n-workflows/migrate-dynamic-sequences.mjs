import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Dynamic sequences migration
 * Adds sequence_schedule JSONB column to waves, backfills existing data,
 * relaxes CHECK constraints on email_queue and wave_leads for N sequences.
 * Run once: node migrate-dynamic-sequences.mjs
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
  console.log('OK:', JSON.stringify(data).slice(0, 200));
  return true;
}

async function main() {
  console.log('=== Dynamic Sequences Migration ===\n');

  // 1. Add sequence_schedule JSONB column
  await runSQL(
    `ALTER TABLE public.waves ADD COLUMN IF NOT EXISTS sequence_schedule jsonb;`,
    '1. Add sequence_schedule column'
  );

  // 2. Backfill existing waves
  await runSQL(
    `UPDATE public.waves SET sequence_schedule = jsonb_build_array(
      jsonb_build_object('seq', 1, 'send_date', send_date_seq1::text, 'send_time', COALESCE(send_time_seq1, '08:00')),
      jsonb_build_object('seq', 2, 'send_date', send_date_seq2::text, 'send_time', COALESCE(send_time_seq2, '08:00')),
      jsonb_build_object('seq', 3, 'send_date', send_date_seq3::text, 'send_time', COALESCE(send_time_seq3, '08:00'))
    )
    WHERE sequence_schedule IS NULL
      AND (send_date_seq1 IS NOT NULL OR send_date_seq2 IS NOT NULL OR send_date_seq3 IS NOT NULL);`,
    '2. Backfill sequence_schedule from legacy columns'
  );

  // 3. Drop and re-add email_queue sequence_number CHECK to allow >= 1 (was 1-3)
  await runSQL(
    `ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_sequence_number_check;
     ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_sequence_number_check CHECK (sequence_number >= 1);`,
    '3. Relax email_queue sequence_number CHECK'
  );

  // 4. Drop wave_leads status CHECK (app layer validates)
  await runSQL(
    `ALTER TABLE public.wave_leads DROP CONSTRAINT IF EXISTS wave_leads_status_check;`,
    '4. Drop wave_leads status CHECK'
  );

  // 5. Update wave_analytics view to include sequence_schedule
  await runSQL(
    `CREATE OR REPLACE VIEW public.wave_analytics AS
     SELECT w.id, w.name, w.team_id, w.status, w.template_set_id,
            ts.name AS template_set_name,
            w.salesman_id, w.outreach_account_id, w.from_email,
            w.is_dummy, w.dummy_email, w.source_wave_id, w.completed_at,
            w.send_date_seq1, w.send_date_seq2, w.send_date_seq3,
            w.send_time_seq1, w.send_time_seq2, w.send_time_seq3,
            w.delay_seq1_to_seq2_days, w.delay_seq2_to_seq3_days,
            w.send_window_start, w.send_window_end,
            w.sequence_schedule,
            w.created_at, w.updated_at,
            w.scheduling_report,
            COALESCE(lc.cnt, 0)::int AS lead_count,
            COALESCE(sc.cnt, 0)::int AS sent_count,
            COALESCE(rc.cnt, 0)::int AS reply_count,
            CASE WHEN COALESCE(sc.cnt, 0) > 0
                 THEN ROUND(COALESCE(rc.cnt, 0)::numeric / sc.cnt * 100, 1)
                 ELSE 0 END AS reply_rate,
            COALESCE(va.cnt, 0)::int AS variant_a_leads,
            COALESCE(vb.cnt, 0)::int AS variant_b_leads,
            COALESCE(vas.cnt, 0)::int AS variant_a_sent,
            COALESCE(vbs.cnt, 0)::int AS variant_b_sent,
            COALESCE(var_.cnt, 0)::int AS variant_a_replies,
            COALESCE(vbr.cnt, 0)::int AS variant_b_replies,
            CASE WHEN COALESCE(vas.cnt, 0) > 0
                 THEN ROUND(COALESCE(var_.cnt, 0)::numeric / vas.cnt * 100, 1)
                 ELSE 0 END AS variant_a_reply_rate,
            CASE WHEN COALESCE(vbs.cnt, 0) > 0
                 THEN ROUND(COALESCE(vbr.cnt, 0)::numeric / vbs.cnt * 100, 1)
                 ELSE 0 END AS variant_b_reply_rate
     FROM public.waves w
     LEFT JOIN public.template_sets ts ON ts.id = w.template_set_id
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.wave_leads WHERE wave_id = w.id) lc ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.sent_emails se JOIN public.wave_leads wl ON wl.id = se.wave_lead_id WHERE wl.wave_id = w.id) sc ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.lead_replies lr JOIN public.wave_leads wl ON wl.id = lr.wave_lead_id WHERE wl.wave_id = w.id) rc ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.wave_leads WHERE wave_id = w.id AND ab_variant = 'A') va ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.wave_leads WHERE wave_id = w.id AND ab_variant = 'B') vb ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.sent_emails se JOIN public.wave_leads wl ON wl.id = se.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'A') vas ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.sent_emails se JOIN public.wave_leads wl ON wl.id = se.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'B') vbs ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.lead_replies lr JOIN public.wave_leads wl ON wl.id = lr.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'A') var_ ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.lead_replies lr JOIN public.wave_leads wl ON wl.id = lr.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'B') vbr ON TRUE;`,
    '5. Update wave_analytics view with sequence_schedule'
  );

  console.log('\n=== Done ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
