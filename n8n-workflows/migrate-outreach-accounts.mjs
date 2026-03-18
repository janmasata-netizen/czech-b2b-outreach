// STATUS: RUN 2026-03-18 — all steps succeeded (RLS policies pre-existed)
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

  // ── 1. Create outreach_accounts table ────────────────────────────────────────
  ['Create outreach_accounts table', `
    CREATE TABLE IF NOT EXISTS public.outreach_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES public.teams(id),
      email_address TEXT NOT NULL UNIQUE,
      display_name TEXT,
      smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
      smtp_port INTEGER NOT NULL DEFAULT 465,
      smtp_secure BOOLEAN NOT NULL DEFAULT true,
      smtp_user TEXT NOT NULL,
      smtp_password TEXT NOT NULL,
      daily_send_limit INTEGER NOT NULL DEFAULT 100,
      sends_today INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `],

  // ── 2. Add outreach_account_id to waves ──────────────────────────────────────
  ['Add outreach_account_id column to waves', `
    ALTER TABLE public.waves ADD COLUMN IF NOT EXISTS outreach_account_id UUID REFERENCES public.outreach_accounts(id);
  `],

  // ── 3. Create increment_and_check_sends_account RPC ──────────────────────────
  ['Create increment_and_check_sends_account function', `
    CREATE OR REPLACE FUNCTION public.increment_and_check_sends_account(p_account_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
      v_sends INTEGER;
      v_limit INTEGER;
    BEGIN
      UPDATE public.outreach_accounts
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

  // ── 4. Modify reset_daily_sends to also reset outreach_accounts ───────────────
  ['Update reset_daily_sends to include outreach_accounts', `
    CREATE OR REPLACE FUNCTION public.reset_daily_sends()
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    BEGIN
      UPDATE public.teams SET sends_today = 0;
      UPDATE public.outreach_accounts SET sends_today = 0, updated_at = now();
    END;
    $$;
  `],

  // ── 5. Enable RLS on outreach_accounts ───────────────────────────────────────
  ['Enable RLS on outreach_accounts', `
    ALTER TABLE public.outreach_accounts ENABLE ROW LEVEL SECURITY;
  `],

  ['Create RLS policy: service role full access', `
    CREATE POLICY "Service role full access" ON public.outreach_accounts
      FOR ALL USING (auth.role() = 'service_role');
  `],

  ['Create RLS policy: team members can view own accounts', `
    CREATE POLICY "Team members can view own accounts" ON public.outreach_accounts
      FOR SELECT USING (
        team_id IN (SELECT team_id FROM public.profiles WHERE id = auth.uid())
      );
  `],

  ['Create RLS policy: admins can manage accounts', `
    CREATE POLICY "Admins can manage accounts" ON public.outreach_accounts
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  `],

  // ── 6. Create safe view (excludes smtp_password) ──────────────────────────────
  ['Create outreach_accounts_safe view', `
    CREATE OR REPLACE VIEW public.outreach_accounts_safe AS
    SELECT id, team_id, email_address, display_name, smtp_host, smtp_port, smtp_secure,
           daily_send_limit, sends_today, is_active, created_at, updated_at
    FROM public.outreach_accounts;
  `],

];

console.log(`Running outreach_accounts migration on ${SUPABASE_PROJECT_REF}...\n`);
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
