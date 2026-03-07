// migrate-security-definer.mjs — Fix SECURITY DEFINER functions
// Adds SET search_path = public to all SECURITY DEFINER functions
// to prevent search_path injection attacks.
// Also scopes reset_daily_sends() to prevent abuse.
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
            console.log(`  FAIL ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 200));
            resolve(false);
          } else {
            console.log(`  OK ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`  FAIL ${label}: parse error -`, data.slice(0, 200));
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { console.log(`  FAIL ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== SECURITY DEFINER Fixes ===\n');

  // 1. reset_daily_sends — add search_path + restrict to service role only
  await runSQL('Fix reset_daily_sends()', `
    CREATE OR REPLACE FUNCTION public.reset_daily_sends()
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      UPDATE public.outreach_accounts SET sends_today = 0;
    $$;

    -- Revoke from anon/authenticated, only service_role can call
    REVOKE EXECUTE ON FUNCTION public.reset_daily_sends() FROM anon, authenticated;
  `);

  // 2. handle_lead_reply trigger — add search_path
  await runSQL('Fix handle_lead_reply()', `
    CREATE OR REPLACE FUNCTION public.handle_lead_reply()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      UPDATE public.email_queue
        SET status = 'cancelled'
        WHERE wave_lead_id = NEW.wave_lead_id
          AND status IN ('queued', 'sending');

      UPDATE public.wave_leads
        SET status = 'replied', updated_at = now()
        WHERE id = NEW.wave_lead_id;

      UPDATE public.leads
        SET status = 'replied', updated_at = now()
        WHERE id = NEW.lead_id;

      RETURN NEW;
    END;
    $$;
  `);

  // 3. increment_and_check_sends — add search_path + restrict
  await runSQL('Fix increment_and_check_sends()', `
    CREATE OR REPLACE FUNCTION public.increment_and_check_sends(p_account_id uuid)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE v_sends integer; v_limit integer;
    BEGIN
      UPDATE public.outreach_accounts SET sends_today = sends_today + 1
        WHERE id = p_account_id
        RETURNING sends_today, daily_send_limit INTO v_sends, v_limit;
      IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'reason', 'account_not_found');
      END IF;
      IF v_sends > v_limit THEN
        RETURN json_build_object('ok', false, 'reason', 'limit_reached', 'sends', v_sends, 'limit', v_limit);
      END IF;
      RETURN json_build_object('ok', true, 'sends', v_sends, 'limit', v_limit);
    END;
    $$;

    REVOKE EXECUTE ON FUNCTION public.increment_and_check_sends(uuid) FROM anon, authenticated;
  `);

  // 4. auto_complete_waves — add search_path + restrict
  await runSQL('Fix auto_complete_waves()', `
    CREATE OR REPLACE FUNCTION public.auto_complete_waves()
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_completed_ids uuid[];
      v_count integer;
    BEGIN
      WITH completable AS (
        SELECT w.id
        FROM public.waves w
        WHERE w.status = 'sending'
        AND NOT EXISTS (
          SELECT 1 FROM public.email_queue eq
          JOIN public.wave_leads wl ON wl.id = eq.wave_lead_id
          WHERE wl.wave_id = w.id
          AND eq.status IN ('queued', 'sending', 'scheduled', 'pending')
        )
      )
      UPDATE public.waves SET status = 'completed', completed_at = now()
      WHERE id IN (SELECT id FROM completable)
      RETURNING id INTO v_completed_ids;

      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN json_build_object('completed', v_count);
    END;
    $$;

    REVOKE EXECUTE ON FUNCTION public.auto_complete_waves() FROM anon, authenticated;
  `);

  // 5. claim_queued_emails — add search_path + restrict
  await runSQL('Fix claim_queued_emails()', `
    DO $do$
    BEGIN
      -- Only fix if function exists
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_queued_emails') THEN
        EXECUTE 'ALTER FUNCTION public.claim_queued_emails SET search_path = public';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.claim_queued_emails FROM anon, authenticated';
      END IF;
    END $do$;
  `);

  console.log('\nDone!');
}

main();
