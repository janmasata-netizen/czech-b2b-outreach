import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

function runSQL(label, query) {
  return new Promise((resolve, reject) => {
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
            console.log(`  ✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 300));
            resolve(false);
          } else {
            console.log(`  ✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error -`, data.slice(0, 300));
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

const steps = [

  ['1a. Add pending_prev to email_queue CHECK constraint', `
    ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_status_check;
    ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_status_check
      CHECK (status IN ('queued','sending','sent','failed','cancelled','pending_prev'));
  `],

  ['1b. Create increment_and_check_sends RPC', `
    CREATE OR REPLACE FUNCTION public.increment_and_check_sends(p_account_id uuid)
    RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE v_sends integer; v_limit integer;
    BEGIN
      UPDATE public.outreach_accounts SET sends_today = sends_today + 1
        WHERE id = p_account_id
        RETURNING sends_today, daily_send_limit INTO v_sends, v_limit;
      RETURN json_build_object('sends_today', v_sends, 'daily_send_limit', v_limit,
        'is_over_limit', v_sends > v_limit);
    END; $$;
  `],

  ['1c. Update handle_lead_reply to also cancel pending_prev items', `
    CREATE OR REPLACE FUNCTION public.handle_lead_reply()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      UPDATE public.email_queue
        SET status = 'cancelled'
        WHERE wave_lead_id = NEW.wave_lead_id
          AND status IN ('queued', 'sending', 'pending_prev');

      UPDATE public.wave_leads
        SET status = 'replied', updated_at = now()
        WHERE id = NEW.wave_lead_id;

      UPDATE public.leads
        SET status = 'replied', updated_at = now()
        WHERE id = NEW.lead_id;

      RETURN NEW;
    END;
    $$;
  `],

];

console.log('Running bugfix migrations for cycapkswtucbucyegdsn...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
