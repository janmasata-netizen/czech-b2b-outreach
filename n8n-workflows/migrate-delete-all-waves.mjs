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
        const parsed = JSON.parse(data);
        if (res.statusCode >= 400) {
          console.log(`  ✗ ${label}: ${JSON.stringify(parsed).slice(0, 200)}`);
          resolve(false);
        } else {
          console.log(`  ✓ ${label}`);
          resolve(true);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

console.log('\n=== Delete All Waves (Clean Slate) ===\n');

// 1. Clean up reply-tracking tables
await runSQL(
  'Delete processed_reply_emails',
  `DELETE FROM public.processed_reply_emails;`
);
await runSQL(
  'Delete unmatched_replies',
  `DELETE FROM public.unmatched_replies;`
);

// 2. Delete all waves (cascade-deletes wave_leads, email_queue, sent_emails, lead_replies)
await runSQL(
  'Delete all waves (cascades to wave_leads, email_queue, sent_emails, lead_replies)',
  `DELETE FROM public.waves;`
);

// 3. Reset lead statuses set by wave activity back to 'ready'
await runSQL(
  'Reset wave-activity lead statuses to ready',
  `UPDATE public.leads SET status = 'ready'
   WHERE status IN ('replied', 'completed', 'in_wave', 'bounced');`
);

// 4. Reset daily send counters
await runSQL(
  'Reset teams.sends_today to 0',
  `UPDATE public.teams SET sends_today = 0;`
);

console.log('\nDone.');
