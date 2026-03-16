/**
 * diagnose-wave-send.mjs
 *
 * Comprehensive diagnostic for "wave emails not sending" issues.
 * Checks all possible failure points in the WF7→WF8 pipeline:
 *   1. WF8 active status on n8n
 *   2. WF8 recent executions
 *   3. email_queue state (grouped by status)
 *   4. claim_queued_emails() function existence & definition
 *   5. Current UTC vs Prague time
 *   6. Latest waves and their queue items
 *   7. Stuck "sending" items
 *
 * Usage: node n8n-workflows/diagnose-wave-send.mjs
 */

import https from 'https';
import http from 'http';
import {
  SUPABASE_PROJECT_REF,
  SUPABASE_MANAGEMENT_TOKEN,
  N8N_BASE_URL,
  N8N_API_KEY,
} from './env.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function n8nAPI(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(N8N_BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: `/api/v1${path}`,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ ok: false, status: res.statusCode, data: data.slice(0, 500) });
        }
      });
    });
    req.on('error', (e) => { resolve({ ok: false, status: 0, data: e.message }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Wave Email Sending — Full Diagnostic       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── 1. WF8 active status ──────────────────────────────────────────────────
  console.log('━━━ 1. WF8 Active Status ━━━');
  const wf8 = await n8nAPI('GET', '/workflows/wJLD5sFxddNNxR7p');
  if (wf8.ok) {
    const active = wf8.data.active;
    console.log(`  WF8 active: ${active ? '✓ YES' : '✗ NO  ← THIS IS THE PROBLEM'}`);
    console.log(`  WF8 name:   ${wf8.data.name}`);
    if (!active) {
      console.log('\n  ⚠ WF8 is INACTIVE — cron is not firing. Emails will never be claimed.\n');
    }
  } else {
    console.log(`  ✗ Could not fetch WF8: HTTP ${wf8.status}`, JSON.stringify(wf8.data).slice(0, 300));
  }

  // ── 2. WF8 recent executions ──────────────────────────────────────────────
  console.log('\n━━━ 2. WF8 Recent Executions ━━━');
  const execs = await n8nAPI('GET', '/executions?workflowId=wJLD5sFxddNNxR7p&limit=5&status=success,error,waiting');
  if (execs.ok && execs.data?.data) {
    const runs = execs.data.data;
    if (runs.length === 0) {
      console.log('  No recent executions found ← WF8 has not run recently');
    } else {
      for (const r of runs) {
        const start = r.startedAt ? new Date(r.startedAt).toISOString() : '?';
        const end = r.stoppedAt ? new Date(r.stoppedAt).toISOString() : 'running';
        console.log(`  ${r.status?.padEnd(8)} | started: ${start} | stopped: ${end}`);
      }
    }
  } else {
    console.log('  ✗ Could not fetch executions:', JSON.stringify(execs.data).slice(0, 300));
  }

  // ── 3. email_queue state ──────────────────────────────────────────────────
  console.log('\n━━━ 3. Email Queue State ━━━');
  const queueState = await runSQL('Queue status counts', `
    SELECT status, count(*) AS cnt,
           min(scheduled_at) AS earliest,
           max(scheduled_at) AS latest
    FROM public.email_queue
    GROUP BY status
    ORDER BY cnt DESC;
  `);
  if (queueState.ok && Array.isArray(queueState.data)) {
    if (queueState.data.length === 0) {
      console.log('  ⚠ email_queue is EMPTY — WF7 may not have created queue items');
    } else {
      for (const r of queueState.data) {
        console.log(`  ${String(r.status).padEnd(15)} : ${String(r.cnt).padStart(4)} items | earliest: ${r.earliest || '-'} | latest: ${r.latest || '-'}`);
      }
    }
  }

  // ── 4. claim_queued_emails() function ─────────────────────────────────────
  console.log('\n━━━ 4. claim_queued_emails() Function ━━━');
  const fn = await runSQL('Extract function', `
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'claim_queued_emails' LIMIT 1;
  `);
  if (fn.ok && fn.data?.[0]?.definition) {
    console.log('  ✓ Function EXISTS');
    const def = fn.data[0].definition;
    // Show the key WHERE clause
    const whereMatch = def.match(/WHERE[\s\S]*?(?:RETURNING|;)/i);
    if (whereMatch) {
      console.log('  Key clause:');
      for (const line of whereMatch[0].split('\n').slice(0, 8)) {
        console.log('    ' + line.trim());
      }
    }
    // Check for wave status filtering
    if (def.toLowerCase().includes('waves') || def.toLowerCase().includes('wave_status')) {
      console.log('  ⚠ Function joins to waves table — wave status may affect claiming');
    } else {
      console.log('  ✓ No wave-status filtering detected');
    }
    // Full definition for reference
    console.log('\n  Full definition:');
    for (const line of def.split('\n')) {
      console.log('    ' + line);
    }
  } else {
    console.log('  ✗ claim_queued_emails() NOT FOUND — this would break WF8 completely');
  }

  // ── 5. Current times ─────────────────────────────────────────────────────
  console.log('\n━━━ 5. Current Times ━━━');
  const times = await runSQL('Times', `SELECT now() AS utc, now() AT TIME ZONE 'Europe/Prague' AS prague;`);
  if (times.ok && times.data?.[0]) {
    console.log(`  DB now() UTC:    ${times.data[0].utc}`);
    console.log(`  DB now() Prague: ${times.data[0].prague}`);
    console.log(`  Script local:    ${new Date().toISOString()}`);
  }

  // ── 6. Latest waves ──────────────────────────────────────────────────────
  console.log('\n━━━ 6. Latest Waves ━━━');
  const waves = await runSQL('Latest waves', `
    SELECT id, name, status, from_email, sequence_schedule,
           created_at, updated_at
    FROM public.waves
    ORDER BY updated_at DESC
    LIMIT 5;
  `);
  if (waves.ok && Array.isArray(waves.data)) {
    for (const w of waves.data) {
      console.log(`  Wave: ${w.name || '(unnamed)'}`);
      console.log(`    id:       ${w.id}`);
      console.log(`    status:   ${w.status}`);
      console.log(`    from:     ${w.from_email || '-'}`);
      console.log(`    schedule: ${JSON.stringify(w.sequence_schedule) || '-'}`);
      console.log(`    updated:  ${w.updated_at}`);

      // Show queue items for this wave
      const items = await runSQL(`Queue for wave ${w.id}`, `
        SELECT eq.id, eq.status, eq.scheduled_at, eq.email_address,
               eq.sequence_number, eq.error_message, eq.retry_count
        FROM public.email_queue eq
        JOIN public.wave_leads wl ON wl.id = eq.wave_lead_id
        WHERE wl.wave_id = '${w.id}'
        ORDER BY eq.scheduled_at
        LIMIT 20;
      `);
      if (items.ok && Array.isArray(items.data) && items.data.length > 0) {
        for (const i of items.data) {
          const err = i.error_message ? ` | err: ${i.error_message}` : '';
          const retry = i.retry_count > 0 ? ` | retries: ${i.retry_count}` : '';
          console.log(`    📧 seq${i.sequence_number} ${String(i.status).padEnd(13)} | ${i.email_address} | sched: ${i.scheduled_at}${err}${retry}`);
        }
      } else {
        console.log('    (no queue items for this wave)');
      }
      console.log('');
    }
  }

  // ── 7. Stuck "sending" items ──────────────────────────────────────────────
  console.log('━━━ 7. Stuck Items ━━━');
  const stuck = await runSQL('Stuck sending', `
    SELECT count(*) AS cnt FROM public.email_queue WHERE status = 'sending';
  `);
  if (stuck.ok && stuck.data?.[0]) {
    const cnt = parseInt(stuck.data[0].cnt);
    if (cnt > 0) {
      console.log(`  ⚠ ${cnt} items stuck in 'sending' status`);
      console.log('  These will never be claimed again. Run reset to fix:');
      console.log("  UPDATE email_queue SET status = 'queued' WHERE status = 'sending';");
    } else {
      console.log('  ✓ No stuck items');
    }
  }

  // ── 8. Queued items past due ──────────────────────────────────────────────
  console.log('\n━━━ 8. Queued Items Past Due (should have been sent) ━━━');
  const pastDue = await runSQL('Past due', `
    SELECT id, email_address, scheduled_at, status,
           EXTRACT(EPOCH FROM (now() - scheduled_at))/60 AS minutes_overdue
    FROM public.email_queue
    WHERE status = 'queued' AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT 10;
  `);
  if (pastDue.ok && Array.isArray(pastDue.data)) {
    if (pastDue.data.length === 0) {
      console.log('  ✓ No past-due queued items');
    } else {
      console.log(`  ⚠ ${pastDue.data.length} items are queued but past their scheduled_at:`);
      for (const r of pastDue.data) {
        console.log(`    ${r.email_address} | sched: ${r.scheduled_at} | overdue: ${Math.round(r.minutes_overdue)} min`);
      }
      console.log('  → If WF8 is active, these should be claimed on next tick');
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Diagnostic Summary                         ║');
  console.log('╚══════════════════════════════════════════════╝');

  const issues = [];
  if (wf8.ok && !wf8.data.active) issues.push('WF8 is INACTIVE → activate it');
  if (fn.ok && !fn.data?.[0]?.definition) issues.push('claim_queued_emails() missing → re-create it');
  if (queueState.ok && queueState.data?.length === 0) issues.push('email_queue is empty → WF7 failed to create items');
  if (stuck.ok && parseInt(stuck.data?.[0]?.cnt) > 0) issues.push(`${stuck.data[0].cnt} items stuck in 'sending' → reset them`);
  if (pastDue.ok && pastDue.data?.length > 0) issues.push(`${pastDue.data.length} past-due queued items → WF8 not processing them`);

  if (issues.length === 0) {
    console.log('\n  ✓ No obvious issues detected. Pipeline looks healthy.\n');
  } else {
    console.log(`\n  Found ${issues.length} issue(s):\n`);
    for (const iss of issues) {
      console.log(`  ⚠ ${iss}`);
    }
    console.log('');
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
