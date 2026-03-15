/**
 * migrate-fix-claim-tz.mjs
 *
 * Investigation: "Emails sent 1 hour late" timezone bug
 *
 * FINDING: claim_queued_emails() is NOT the cause.
 *   - Function already uses `scheduled_at <= now()` (pure UTC, no AT TIME ZONE)
 *   - Column `scheduled_at` is `timestamptz` (correct)
 *   - Postgres timezone is UTC (correct)
 *   - WF7 getCzechOffset() returns correct offset (1 for CET, 2 for CEST)
 *
 * The 44-min delay observed on 2026-03-15 was because:
 *   - Wave send_time was 11:15 Czech (10:15 UTC)
 *   - WF7 ran at ~10:55 UTC, creating queue items with scheduled_at 10:16-10:31 UTC (already past)
 *   - WF8 cron claimed them at 11:00 UTC (next 5-min tick)
 *   - Result: emails sent 44 min after their scheduled_at
 *
 * This script:
 *   1. Extracts and displays current claim_queued_emails() definition
 *   2. Checks column type, Postgres timezone, and time comparisons
 *   3. Shows recent email delays for diagnosis
 *   4. Resets any stuck 'sending' emails
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
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.log(`  ✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 500));
            resolve({ ok: false, data: parsed });
          } else {
            console.log(`  ✓ ${label}`);
            resolve({ ok: true, data: parsed });
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error -`, data.slice(0, 500));
          resolve({ ok: false, data: null });
        }
      });
    });
    req.on('error', (e) => { console.log(`  ✗ ${label}: ${e.message}`); resolve({ ok: false, data: null }); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Email Timing Diagnostic ===\n');

  // 1. Extract function definition
  console.log('1. claim_queued_emails() definition:\n');
  const fn = await runSQL('Extract function', `
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'claim_queued_emails' LIMIT 1;
  `);
  if (fn.ok && fn.data?.[0]?.definition) {
    console.log(fn.data[0].definition);
    const def = fn.data[0].definition;
    if (def.includes('AT TIME ZONE') || def.includes('LOCALTIMESTAMP')) {
      console.log('  ⚠ TIMEZONE CONVERSION DETECTED — this may be the bug!\n');
    } else {
      console.log('  ✓ No timezone conversion — pure UTC comparison\n');
    }
  }

  // 2. Check column type + timezone
  console.log('2. Infrastructure checks:\n');
  const col = await runSQL('Column type', `
    SELECT udt_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_queue' AND column_name='scheduled_at';
  `);
  if (col.ok) console.log('  scheduled_at type:', col.data?.[0]?.udt_name || 'unknown');

  const tz = await runSQL('Postgres timezone', `SELECT current_setting('TIMEZONE') AS tz;`);
  if (tz.ok) console.log('  Postgres timezone:', tz.data?.[0]?.tz || 'unknown');

  const times = await runSQL('Current time', `SELECT now() AS utc, now() AT TIME ZONE 'Europe/Prague' AS prague;`);
  if (times.ok) {
    console.log('  now() UTC:  ', times.data?.[0]?.utc);
    console.log('  now() Prague:', times.data?.[0]?.prague);
  }

  // 3. Recent email delays
  console.log('\n3. Recent email delays:\n');
  const delays = await runSQL('Email delays', `
    SELECT
      eq.scheduled_at,
      eq.sent_at,
      EXTRACT(EPOCH FROM (eq.sent_at - eq.scheduled_at))/60 AS delay_min,
      w.send_window_start
    FROM public.email_queue eq
    JOIN public.wave_leads wl ON wl.id = eq.wave_lead_id
    JOIN public.waves w ON w.id = wl.wave_id
    WHERE eq.sent_at IS NOT NULL
    ORDER BY eq.sent_at DESC LIMIT 10;
  `);
  if (delays.ok && Array.isArray(delays.data)) {
    for (const r of delays.data) {
      console.log(`  scheduled: ${r.scheduled_at} | sent: ${r.sent_at} | delay: ${Math.round(r.delay_min)}min | window: ${r.send_window_start}`);
    }
    if (!delays.data.length) console.log('  (no sent emails)');
  }

  // 4. Reset stuck emails
  console.log('\n4. Reset stuck emails:\n');
  await runSQL('Reset sending→queued', `
    UPDATE public.email_queue SET status = 'queued' WHERE status = 'sending';
  `);

  console.log('\n=== Done ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
