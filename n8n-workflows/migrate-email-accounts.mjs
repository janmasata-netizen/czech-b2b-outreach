// STATUS: NOT RUN
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
            console.log(`✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 400));
            resolve(false);
          } else {
            console.log(`✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`✗ ${label}: parse error -`, data.slice(0, 200));
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { console.log(`✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

const steps = [

  // ── Step 0: Delete all waves and related data ─────────────────────────────────
  ['Step 0a: Delete email_queue', `
    DELETE FROM public.email_queue;
  `],

  ['Step 0b: Delete wave_leads', `
    DELETE FROM public.wave_leads;
  `],

  ['Step 0c: Delete waves', `
    DELETE FROM public.waves;
  `],

  ['Step 0d: Delete wave_presets', `
    DELETE FROM public.wave_presets;
  `],

  // ── Step 1: Create email_accounts table ───────────────────────────────────────
  ['Step 1: Create email_accounts table', `
    CREATE TABLE IF NOT EXISTS public.email_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES public.teams(id),
      name TEXT NOT NULL,
      email_address TEXT NOT NULL UNIQUE,
      smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
      smtp_port INTEGER NOT NULL DEFAULT 465,
      smtp_secure BOOLEAN NOT NULL DEFAULT true,
      smtp_user TEXT NOT NULL,
      smtp_password TEXT NOT NULL,
      imap_host TEXT NOT NULL DEFAULT 'imap.gmail.com',
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_secure BOOLEAN NOT NULL DEFAULT true,
      imap_user TEXT NOT NULL,
      imap_password TEXT NOT NULL,
      daily_send_limit INTEGER NOT NULL DEFAULT 100,
      sends_today INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `],

  // ── Step 2: Enable RLS on email_accounts ──────────────────────────────────────
  ['Step 2a: Enable RLS on email_accounts', `
    ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
  `],

  ['Step 2b: RLS policy - service role full access', `
    CREATE POLICY "Service role full access" ON public.email_accounts
      FOR ALL USING (auth.role() = 'service_role');
  `],

  ['Step 2c: RLS policy - team members can view own accounts', `
    CREATE POLICY "Team members can view own accounts" ON public.email_accounts
      FOR SELECT USING (
        team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      );
  `],

  ['Step 2d: RLS policy - admins can manage accounts', `
    CREATE POLICY "Admins can manage accounts" ON public.email_accounts
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  `],

  // ── Step 3: Create email_accounts_safe view ───────────────────────────────────
  ['Step 3: Create email_accounts_safe view', `
    CREATE OR REPLACE VIEW public.email_accounts_safe AS
    SELECT id, team_id, name, email_address,
           smtp_host, smtp_port, smtp_secure, smtp_user,
           imap_host, imap_port, imap_secure, imap_user,
           daily_send_limit, sends_today, is_active, created_at, updated_at
    FROM public.email_accounts;
  `],

  // ── Step 4: Drop wave_analytics view (references columns we are dropping) ─────
  ['Step 4: Drop wave_analytics view', `
    DROP VIEW IF EXISTS public.wave_analytics;
  `],

  // ── Step 5: Alter waves table ─────────────────────────────────────────────────
  ['Step 5a: Add email_account_id to waves', `
    ALTER TABLE public.waves ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES public.email_accounts(id);
  `],

  ['Step 5b: Drop salesman_id from waves', `
    ALTER TABLE public.waves DROP COLUMN IF EXISTS salesman_id;
  `],

  ['Step 5c: Drop outreach_account_id from waves', `
    ALTER TABLE public.waves DROP COLUMN IF EXISTS outreach_account_id;
  `],

  ['Step 5d: Drop from_email from waves', `
    ALTER TABLE public.waves DROP COLUMN IF EXISTS from_email;
  `],

  // ── Step 6: Alter wave_presets table ──────────────────────────────────────────
  ['Step 6a: Add email_account_id to wave_presets', `
    ALTER TABLE public.wave_presets ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES public.email_accounts(id);
  `],

  ['Step 6b: Drop salesman_id from wave_presets', `
    ALTER TABLE public.wave_presets DROP COLUMN IF EXISTS salesman_id;
  `],

  ['Step 6c: Drop from_email from wave_presets', `
    ALTER TABLE public.wave_presets DROP COLUMN IF EXISTS from_email;
  `],

  // ── Step 7: Alter lead_replies table ──────────────────────────────────────────
  ['Step 7a: Add email_account_id to lead_replies', `
    ALTER TABLE public.lead_replies ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES public.email_accounts(id);
  `],

  ['Step 7b: Drop salesman_id from lead_replies', `
    ALTER TABLE public.lead_replies DROP COLUMN IF EXISTS salesman_id;
  `],

  // ── Step 8: Rename outreach_account_id → email_account_id in wave_leads, email_queue, sent_emails ──
  ['Step 8a: Drop wave_leads outreach_account_id FK', `
    ALTER TABLE public.wave_leads DROP CONSTRAINT IF EXISTS wave_leads_outreach_account_id_fkey;
  `],

  ['Step 8b: Rename wave_leads outreach_account_id → email_account_id', `
    ALTER TABLE public.wave_leads RENAME COLUMN outreach_account_id TO email_account_id;
  `],

  ['Step 8c: Add wave_leads email_account_id FK', `
    ALTER TABLE public.wave_leads ADD CONSTRAINT wave_leads_email_account_id_fkey
      FOREIGN KEY (email_account_id) REFERENCES public.email_accounts(id);
  `],

  ['Step 8d: Drop email_queue outreach_account_id FK', `
    ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_outreach_account_id_fkey;
  `],

  ['Step 8e: Rename email_queue outreach_account_id → email_account_id', `
    ALTER TABLE public.email_queue RENAME COLUMN outreach_account_id TO email_account_id;
  `],

  ['Step 8f: Add email_queue email_account_id FK', `
    ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_email_account_id_fkey
      FOREIGN KEY (email_account_id) REFERENCES public.email_accounts(id);
  `],

  ['Step 8g: Drop sent_emails outreach_account_id FK', `
    ALTER TABLE public.sent_emails DROP CONSTRAINT IF EXISTS sent_emails_outreach_account_id_fkey;
  `],

  ['Step 8h: Rename sent_emails outreach_account_id → email_account_id', `
    ALTER TABLE public.sent_emails RENAME COLUMN outreach_account_id TO email_account_id;
  `],

  ['Step 8i: Add sent_emails email_account_id FK', `
    ALTER TABLE public.sent_emails ADD CONSTRAINT sent_emails_email_account_id_fkey
      FOREIGN KEY (email_account_id) REFERENCES public.email_accounts(id);
  `],

  // ── Step 9: Update increment_and_check_sends_account to use email_accounts ────
  ['Step 9: Update increment_and_check_sends_account function', `
    CREATE OR REPLACE FUNCTION public.increment_and_check_sends_account(p_account_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
      v_sends INTEGER;
      v_limit INTEGER;
    BEGIN
      UPDATE public.email_accounts
      SET sends_today = sends_today + 1, updated_at = now()
      WHERE id = p_account_id
      RETURNING sends_today, daily_send_limit INTO v_sends, v_limit;

      IF v_sends IS NULL THEN
        RETURN json_build_object('error', 'Account not found', 'is_over_limit', true);
      END IF;

      RETURN json_build_object(
        'sends_today', v_sends,
        'daily_send_limit', v_limit,
        'is_over_limit', v_sends > v_limit
      );
    END;
    $$;
  `],

  // ── Step 10: Update reset_daily_sends to use email_accounts ──────────────────
  ['Step 10: Update reset_daily_sends function', `
    CREATE OR REPLACE FUNCTION public.reset_daily_sends()
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    BEGIN
      UPDATE public.teams SET sends_today = 0;
      UPDATE public.email_accounts SET sends_today = 0, updated_at = now();
    END;
    $$;
  `],

  // ── Step 11: Drop check_max_salesmen function ─────────────────────────────────
  ['Step 11: Drop check_max_salesmen function', `
    DROP FUNCTION IF EXISTS public.check_max_salesmen();
  `],

  // ── Step 12: Recreate wave_analytics view ────────────────────────────────────
  // Based on the most complete version from migrate-dynamic-sequences.mjs,
  // with salesman_id/outreach_account_id/from_email replaced by email_account_id,
  // and a join to email_accounts added for email_address and name.
  ['Step 12: Recreate wave_analytics view', `
    CREATE VIEW public.wave_analytics AS
    SELECT w.id, w.name, w.team_id, w.status, w.template_set_id,
           ts.name AS template_set_name,
           w.email_account_id,
           ea.email_address,
           ea.name AS email_account_name,
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
    LEFT JOIN public.email_accounts ea ON ea.id = w.email_account_id
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.wave_leads WHERE wave_id = w.id) lc ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.sent_emails se JOIN public.wave_leads wl ON wl.id = se.wave_lead_id WHERE wl.wave_id = w.id) sc ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.lead_replies lr JOIN public.wave_leads wl ON wl.id = lr.wave_lead_id WHERE wl.wave_id = w.id) rc ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.wave_leads WHERE wave_id = w.id AND ab_variant = 'A') va ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.wave_leads WHERE wave_id = w.id AND ab_variant = 'B') vb ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.sent_emails se JOIN public.wave_leads wl ON wl.id = se.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'A') vas ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.sent_emails se JOIN public.wave_leads wl ON wl.id = se.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'B') vbs ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.lead_replies lr JOIN public.wave_leads wl ON wl.id = lr.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'A') var_ ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM public.lead_replies lr JOIN public.wave_leads wl ON wl.id = lr.wave_lead_id WHERE wl.wave_id = w.id AND wl.ab_variant = 'B') vbr ON TRUE;
  `],

  ['Step 12b: Grant select on wave_analytics', `
    GRANT SELECT ON public.wave_analytics TO anon, authenticated, service_role;
  `],

  // ── Step 13: Drop old tables and views ────────────────────────────────────────
  ['Step 13a: Drop salesmen_safe view', `
    DROP VIEW IF EXISTS public.salesmen_safe;
  `],

  ['Step 13b: Drop outreach_accounts_safe view', `
    DROP VIEW IF EXISTS public.outreach_accounts_safe;
  `],

  ['Step 13c: Drop salesmen table', `
    DROP TABLE IF EXISTS public.salesmen CASCADE;
  `],

  ['Step 13d: Drop outreach_accounts table', `
    DROP TABLE IF EXISTS public.outreach_accounts CASCADE;
  `],

  // ── Step 14: Handle processed_reply_emails salesman_id ────────────────────────
  ['Step 14a: Add email_account_id to processed_reply_emails', `
    ALTER TABLE public.processed_reply_emails ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES public.email_accounts(id);
  `],

  ['Step 14b: Drop salesman_id from processed_reply_emails', `
    ALTER TABLE public.processed_reply_emails DROP COLUMN IF EXISTS salesman_id;
  `],

  // ── Step 15: Recreate check_and_mark_reply_processed with email_account_id ──
  ['Step 15: Recreate check_and_mark_reply_processed RPC', `
    CREATE OR REPLACE FUNCTION check_and_mark_reply_processed(
      p_message_id text,
      p_account_id uuid DEFAULT NULL
    ) RETURNS json LANGUAGE plpgsql AS $$
    DECLARE v_count int;
    BEGIN
      INSERT INTO processed_reply_emails (message_id, email_account_id)
      VALUES (p_message_id, p_account_id)
      ON CONFLICT (message_id) DO NOTHING;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN json_build_object('is_new', v_count > 0);
    END;
    $$;
  `],

];

console.log(`Running email_accounts migration on ${SUPABASE_PROJECT_REF}...\n`);
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
