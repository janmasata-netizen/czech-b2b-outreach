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
            console.log(`✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 200));
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

  ['Extensions', `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  `],

  ['Table: teams', `
    CREATE TABLE IF NOT EXISTS public.teams (
      id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name          text NOT NULL,
      salesman_email              text,
      salesman_email_app_password text,
      is_active     boolean DEFAULT true,
      created_at    timestamptz DEFAULT now(),
      updated_at    timestamptz DEFAULT now()
    );
  `],

  ['Table: outreach_accounts (1 burner per team)', `
    CREATE TABLE IF NOT EXISTS public.outreach_accounts (
      id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      team_id              uuid REFERENCES public.teams(id) ON DELETE CASCADE,
      email_address        text NOT NULL,
      display_name         text,
      smtp_credential_name text,
      daily_send_limit     integer DEFAULT 130,
      sends_today          integer DEFAULT 0,
      is_active            boolean DEFAULT true,
      created_at           timestamptz DEFAULT now(),
      UNIQUE(team_id)
    );
  `],

  ['Table: leads', `
    CREATE TABLE IF NOT EXISTS public.leads (
      id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      company_name     text NOT NULL,
      website          text,
      domain           text,
      ico              text,
      team_id          uuid REFERENCES public.teams(id),
      status           text DEFAULT 'new' CHECK (status IN (
                         'new','enriching','enriched','email_discovery',
                         'ready','failed','replied','in_wave')),
      enrichment_error text,
      is_active        boolean DEFAULT true,
      created_at       timestamptz DEFAULT now(),
      updated_at       timestamptz DEFAULT now()
    );
  `],

  ['Table: enrichment_log', `
    CREATE TABLE IF NOT EXISTS public.enrichment_log (
      id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      lead_id      uuid REFERENCES public.leads(id) ON DELETE CASCADE,
      step         text NOT NULL,
      status       text NOT NULL CHECK (status IN ('started','success','failed')),
      error_message text,
      details      jsonb,
      completed_at timestamptz,
      created_at   timestamptz DEFAULT now()
    );
  `],

  ['Table: jednatels', `
    CREATE TABLE IF NOT EXISTS public.jednatels (
      id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      lead_id    uuid REFERENCES public.leads(id) ON DELETE CASCADE,
      full_name  text,
      first_name text,
      last_name  text,
      salutation text,
      created_at timestamptz DEFAULT now()
    );
  `],

  ['Table: email_candidates', `
    CREATE TABLE IF NOT EXISTS public.email_candidates (
      id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      jednatel_id        uuid REFERENCES public.jednatels(id) ON DELETE CASCADE,
      email_address      text NOT NULL,
      seznam_status      text DEFAULT 'pending' CHECK (seznam_status IN ('pending','sent','bounced','likely_valid')),
      seznam_checked_at  timestamptz,
      qev_status         text CHECK (qev_status IN ('valid','invalid','unknown')),
      qev_checked_at     timestamptz,
      is_verified        boolean DEFAULT false,
      created_at         timestamptz DEFAULT now()
    );
  `],

  ['Table: template_sets', `
    CREATE TABLE IF NOT EXISTS public.template_sets (
      id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name        text NOT NULL,
      description text,
      created_at  timestamptz DEFAULT now()
    );
  `],

  ['Table: email_templates', `
    CREATE TABLE IF NOT EXISTS public.email_templates (
      id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      template_set_id  uuid REFERENCES public.template_sets(id) ON DELETE CASCADE,
      sequence_number  integer NOT NULL CHECK (sequence_number IN (1,2,3)),
      variant          text NOT NULL CHECK (variant IN ('A','B')),
      subject          text NOT NULL,
      body_html        text NOT NULL,
      created_at       timestamptz DEFAULT now(),
      UNIQUE(template_set_id, sequence_number, variant)
    );
  `],

  ['Table: waves', `
    CREATE TABLE IF NOT EXISTS public.waves (
      id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      team_id                   uuid REFERENCES public.teams(id),
      template_set_id           uuid REFERENCES public.template_sets(id),
      name                      text,
      status                    text DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','completed','paused')),
      send_date_seq1            date,
      delay_seq1_to_seq2_days   integer DEFAULT 3,
      delay_seq2_to_seq3_days   integer DEFAULT 5,
      send_window_start         time DEFAULT '08:00',
      send_window_end           time DEFAULT '17:00',
      created_at                timestamptz DEFAULT now(),
      updated_at                timestamptz DEFAULT now()
    );
  `],

  ['Table: wave_leads', `
    CREATE TABLE IF NOT EXISTS public.wave_leads (
      id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      wave_id             uuid REFERENCES public.waves(id) ON DELETE CASCADE,
      lead_id             uuid REFERENCES public.leads(id),
      jednatel_id         uuid REFERENCES public.jednatels(id),
      status              text DEFAULT 'pending' CHECK (status IN (
                            'pending','seq1_sent','seq2_sent','seq3_sent',
                            'completed','replied','failed')),
      ab_variant          text CHECK (ab_variant IN ('A','B')),
      outreach_account_id uuid REFERENCES public.outreach_accounts(id),
      created_at          timestamptz DEFAULT now(),
      updated_at          timestamptz DEFAULT now()
    );
  `],

  ['Table: email_queue', `
    CREATE TABLE IF NOT EXISTS public.email_queue (
      id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      wave_lead_id         uuid REFERENCES public.wave_leads(id) ON DELETE CASCADE,
      jednatel_id          uuid REFERENCES public.jednatels(id),
      email_address        text NOT NULL,
      sequence_number      integer NOT NULL CHECK (sequence_number IN (1,2,3)),
      outreach_account_id  uuid REFERENCES public.outreach_accounts(id),
      smtp_message_id_ref  text,
      subject_rendered     text,
      body_rendered        text,
      scheduled_at         timestamptz NOT NULL,
      status               text DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','cancelled')),
      retry_count          integer DEFAULT 0,
      error_message        text,
      sent_at              timestamptz,
      created_at           timestamptz DEFAULT now()
    );
  `],

  ['Table: sent_emails', `
    CREATE TABLE IF NOT EXISTS public.sent_emails (
      id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      queue_id            uuid REFERENCES public.email_queue(id),
      wave_lead_id        uuid REFERENCES public.wave_leads(id),
      jednatel_id         uuid REFERENCES public.jednatels(id),
      email_address       text NOT NULL,
      sequence_number     integer NOT NULL,
      outreach_account_id uuid REFERENCES public.outreach_accounts(id),
      smtp_message_id     text,
      subject             text,
      sent_at             timestamptz DEFAULT now(),
      created_at          timestamptz DEFAULT now()
    );
  `],

  ['Table: lead_replies', `
    CREATE TABLE IF NOT EXISTS public.lead_replies (
      id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      lead_id      uuid REFERENCES public.leads(id),
      wave_lead_id uuid REFERENCES public.wave_leads(id),
      from_email   text,
      subject      text,
      body_preview text,
      received_at  timestamptz,
      created_at   timestamptz DEFAULT now()
    );
  `],

  ['Indexes: leads', `
    CREATE INDEX IF NOT EXISTS idx_leads_domain    ON public.leads(domain) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_leads_team_id   ON public.leads(team_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status    ON public.leads(status);
  `],

  ['Indexes: jednatels + candidates', `
    CREATE INDEX IF NOT EXISTS idx_jednatels_lead_id              ON public.jednatels(lead_id);
    CREATE INDEX IF NOT EXISTS idx_email_candidates_jednatel_id   ON public.email_candidates(jednatel_id);
    CREATE INDEX IF NOT EXISTS idx_email_candidates_seznam_status ON public.email_candidates(seznam_status);
    CREATE INDEX IF NOT EXISTS idx_email_candidates_is_verified   ON public.email_candidates(is_verified);
  `],

  ['Indexes: queue + wave', `
    CREATE INDEX IF NOT EXISTS idx_email_queue_status_scheduled ON public.email_queue(status, scheduled_at) WHERE status = 'queued';
    CREATE INDEX IF NOT EXISTS idx_email_queue_wave_lead_id     ON public.email_queue(wave_lead_id);
    CREATE INDEX IF NOT EXISTS idx_wave_leads_wave_id           ON public.wave_leads(wave_id);
    CREATE INDEX IF NOT EXISTS idx_wave_leads_lead_id           ON public.wave_leads(lead_id);
    CREATE INDEX IF NOT EXISTS idx_enrichment_log_lead_id       ON public.enrichment_log(lead_id);
    CREATE INDEX IF NOT EXISTS idx_sent_emails_smtp_message_id  ON public.sent_emails(smtp_message_id);
  `],

  ['Function: reset_daily_sends()', `
    CREATE OR REPLACE FUNCTION public.reset_daily_sends()
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      UPDATE public.outreach_accounts SET sends_today = 0;
    $$;
  `],

  ['Function: handle_lead_reply()', `
    CREATE OR REPLACE FUNCTION public.handle_lead_reply()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
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
  `],

  ['Trigger: on_lead_reply', `
    DROP TRIGGER IF EXISTS on_lead_reply ON public.lead_replies;
    CREATE TRIGGER on_lead_reply
      AFTER INSERT ON public.lead_replies
      FOR EACH ROW EXECUTE FUNCTION public.handle_lead_reply();
  `],

];

console.log('Building Supabase schema for cycapkswtucbucyegdsn...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
