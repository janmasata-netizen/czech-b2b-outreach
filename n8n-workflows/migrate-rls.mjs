/**
 * RLS Migration — Enable Row Level Security on all tables
 *
 * Policy design:
 * - Users can only see/modify data belonging to their team
 * - Team is resolved via profiles.team_id linked to auth.uid()
 * - config table: read-only for authenticated, write for admins only
 * - profiles table: users can read own + team members, update own
 *
 * Run once: node migrate-rls.mjs
 */
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
            console.log(`✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 300));
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

// Helper function to get user's team_id
const TEAM_ID_FUNC = `
CREATE OR REPLACE FUNCTION public.current_user_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$;
`;

// Helper function to check if user is admin
const IS_ADMIN_FUNC = `
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(is_admin, false) FROM public.profiles WHERE id = auth.uid();
$$;
`;

const steps = [

  // ── Helper functions ──
  ['Function: current_user_team_id()', TEAM_ID_FUNC],
  ['Function: current_user_is_admin()', IS_ADMIN_FUNC],

  // ── Drop existing policies (idempotent) ──
  ['Drop old policies', `
    DO $$ BEGIN
      -- This block drops all existing policies on our tables so we can recreate them cleanly
      EXECUTE (
        SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(polname) || ' ON ' || schemaname || '.' || quote_ident(tablename) || ';', E'\n')
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
            'teams','outreach_accounts','leads','enrichment_log','jednatels',
            'email_candidates','template_sets','email_templates','waves','wave_leads',
            'email_queue','sent_emails','lead_replies','config','salesmen',
            'email_verifications','email_probe_bounces','profiles','processed_reply_emails'
          )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `],

  // ── Enable RLS on all 19 tables ──
  ['Enable RLS: teams', 'ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: outreach_accounts', 'ALTER TABLE public.outreach_accounts ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: leads', 'ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: enrichment_log', 'ALTER TABLE public.enrichment_log ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: jednatels', 'ALTER TABLE public.jednatels ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: email_candidates', 'ALTER TABLE public.email_candidates ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: template_sets', 'ALTER TABLE public.template_sets ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: email_templates', 'ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: waves', 'ALTER TABLE public.waves ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: wave_leads', 'ALTER TABLE public.wave_leads ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: email_queue', 'ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: sent_emails', 'ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: lead_replies', 'ALTER TABLE public.lead_replies ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: config', 'ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: salesmen', 'ALTER TABLE public.salesmen ENABLE ROW LEVEL SECURITY;'],
  ['Enable RLS: profiles', 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;'],

  // Also enable on tables that may or may not exist yet
  ['Enable RLS: email_verifications (if exists)', `
    DO $$ BEGIN
      ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `],
  ['Enable RLS: email_probe_bounces (if exists)', `
    DO $$ BEGIN
      ALTER TABLE public.email_probe_bounces ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `],
  ['Enable RLS: processed_reply_emails (if exists)', `
    DO $$ BEGIN
      ALTER TABLE public.processed_reply_emails ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `],

  // ── Profiles ──
  ['Policy: profiles - users can read own profile', `
    CREATE POLICY profiles_select ON public.profiles
      FOR SELECT USING (id = auth.uid() OR current_user_is_admin());
  `],
  ['Policy: profiles - users can update own profile', `
    CREATE POLICY profiles_update ON public.profiles
      FOR UPDATE USING (id = auth.uid());
  `],
  ['Policy: profiles - admins can insert', `
    CREATE POLICY profiles_insert ON public.profiles
      FOR INSERT WITH CHECK (current_user_is_admin());
  `],

  // ── Teams: users see own team, admins see all ──
  ['Policy: teams - select', `
    CREATE POLICY teams_select ON public.teams
      FOR SELECT USING (id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: teams - admin modify', `
    CREATE POLICY teams_modify ON public.teams
      FOR ALL USING (current_user_is_admin());
  `],

  // ── Outreach Accounts: team-scoped ──
  ['Policy: outreach_accounts - select', `
    CREATE POLICY oa_select ON public.outreach_accounts
      FOR SELECT USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: outreach_accounts - modify', `
    CREATE POLICY oa_modify ON public.outreach_accounts
      FOR ALL USING (current_user_is_admin());
  `],

  // ── Leads: team-scoped ──
  ['Policy: leads - select own team', `
    CREATE POLICY leads_select ON public.leads
      FOR SELECT USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: leads - insert own team', `
    CREATE POLICY leads_insert ON public.leads
      FOR INSERT WITH CHECK (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: leads - update own team', `
    CREATE POLICY leads_update ON public.leads
      FOR UPDATE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: leads - delete own team', `
    CREATE POLICY leads_delete ON public.leads
      FOR DELETE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  // ── Enrichment Log: via lead's team ──
  ['Policy: enrichment_log - select', `
    CREATE POLICY enrich_select ON public.enrichment_log
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.leads WHERE leads.id = enrichment_log.lead_id AND (leads.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],
  ['Policy: enrichment_log - insert', `
    CREATE POLICY enrich_insert ON public.enrichment_log
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.leads WHERE leads.id = enrichment_log.lead_id AND (leads.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],

  // ── Jednatels: via lead's team ──
  ['Policy: jednatels - select', `
    CREATE POLICY jed_select ON public.jednatels
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.leads WHERE leads.id = jednatels.lead_id AND (leads.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],
  ['Policy: jednatels - insert', `
    CREATE POLICY jed_insert ON public.jednatels
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.leads WHERE leads.id = jednatels.lead_id AND (leads.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],
  ['Policy: jednatels - update', `
    CREATE POLICY jed_update ON public.jednatels
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.leads WHERE leads.id = jednatels.lead_id AND (leads.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],

  // ── Email Candidates: via jednatel → lead's team ──
  ['Policy: email_candidates - select', `
    CREATE POLICY ec_select ON public.email_candidates
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.jednatels j
          JOIN public.leads l ON l.id = j.lead_id
          WHERE j.id = email_candidates.jednatel_id
            AND (l.team_id = current_user_team_id() OR current_user_is_admin())
        )
      );
  `],
  ['Policy: email_candidates - insert', `
    CREATE POLICY ec_insert ON public.email_candidates
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.jednatels j
          JOIN public.leads l ON l.id = j.lead_id
          WHERE j.id = email_candidates.jednatel_id
            AND (l.team_id = current_user_team_id() OR current_user_is_admin())
        )
      );
  `],
  ['Policy: email_candidates - update', `
    CREATE POLICY ec_update ON public.email_candidates
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.jednatels j
          JOIN public.leads l ON l.id = j.lead_id
          WHERE j.id = email_candidates.jednatel_id
            AND (l.team_id = current_user_team_id() OR current_user_is_admin())
        )
      );
  `],

  // ── Template Sets: team-scoped (template_sets has team_id) ──
  ['Policy: template_sets - select', `
    CREATE POLICY ts_select ON public.template_sets
      FOR SELECT USING (
        team_id = current_user_team_id() OR team_id IS NULL OR current_user_is_admin()
      );
  `],
  ['Policy: template_sets - modify', `
    CREATE POLICY ts_modify ON public.template_sets
      FOR ALL USING (
        team_id = current_user_team_id() OR current_user_is_admin()
      );
  `],

  // ── Email Templates: via template_set's team ──
  ['Policy: email_templates - select', `
    CREATE POLICY et_select ON public.email_templates
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.template_sets ts
          WHERE ts.id = email_templates.template_set_id
            AND (ts.team_id = current_user_team_id() OR ts.team_id IS NULL OR current_user_is_admin())
        )
      );
  `],
  ['Policy: email_templates - modify', `
    CREATE POLICY et_modify ON public.email_templates
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.template_sets ts
          WHERE ts.id = email_templates.template_set_id
            AND (ts.team_id = current_user_team_id() OR current_user_is_admin())
        )
      );
  `],

  // ── Waves: team-scoped ──
  ['Policy: waves - select', `
    CREATE POLICY waves_select ON public.waves
      FOR SELECT USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: waves - insert', `
    CREATE POLICY waves_insert ON public.waves
      FOR INSERT WITH CHECK (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: waves - update', `
    CREATE POLICY waves_update ON public.waves
      FOR UPDATE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: waves - delete', `
    CREATE POLICY waves_delete ON public.waves
      FOR DELETE USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],

  // ── Wave Leads: via wave's team ──
  ['Policy: wave_leads - select', `
    CREATE POLICY wl_select ON public.wave_leads
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.waves WHERE waves.id = wave_leads.wave_id AND (waves.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],
  ['Policy: wave_leads - insert', `
    CREATE POLICY wl_insert ON public.wave_leads
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.waves WHERE waves.id = wave_leads.wave_id AND (waves.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],
  ['Policy: wave_leads - update', `
    CREATE POLICY wl_update ON public.wave_leads
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.waves WHERE waves.id = wave_leads.wave_id AND (waves.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],
  ['Policy: wave_leads - delete', `
    CREATE POLICY wl_delete ON public.wave_leads
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.waves WHERE waves.id = wave_leads.wave_id AND (waves.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],

  // ── Email Queue: via wave_lead → wave's team ──
  ['Policy: email_queue - select', `
    CREATE POLICY eq_select ON public.email_queue
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.wave_leads wl
          JOIN public.waves w ON w.id = wl.wave_id
          WHERE wl.id = email_queue.wave_lead_id
            AND (w.team_id = current_user_team_id() OR current_user_is_admin())
        )
      );
  `],
  ['Policy: email_queue - modify', `
    CREATE POLICY eq_modify ON public.email_queue
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.wave_leads wl
          JOIN public.waves w ON w.id = wl.wave_id
          WHERE wl.id = email_queue.wave_lead_id
            AND (w.team_id = current_user_team_id() OR current_user_is_admin())
        )
      );
  `],

  // ── Sent Emails: via wave_lead → wave's team ──
  ['Policy: sent_emails - select', `
    CREATE POLICY se_select ON public.sent_emails
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.wave_leads wl
          JOIN public.waves w ON w.id = wl.wave_id
          WHERE wl.id = sent_emails.wave_lead_id
            AND (w.team_id = current_user_team_id() OR current_user_is_admin())
        )
      );
  `],

  // ── Lead Replies: via lead's team ──
  ['Policy: lead_replies - select', `
    CREATE POLICY lr_select ON public.lead_replies
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.leads WHERE leads.id = lead_replies.lead_id AND (leads.team_id = current_user_team_id() OR current_user_is_admin()))
      );
  `],

  // ── Config: admins only ──
  ['Policy: config - admin read', `
    CREATE POLICY config_select ON public.config
      FOR SELECT USING (current_user_is_admin());
  `],
  ['Policy: config - admin write', `
    CREATE POLICY config_modify ON public.config
      FOR ALL USING (current_user_is_admin());
  `],

  // ── Salesmen: team-scoped ──
  ['Policy: salesmen - select', `
    CREATE POLICY sm_select ON public.salesmen
      FOR SELECT USING (team_id = current_user_team_id() OR current_user_is_admin());
  `],
  ['Policy: salesmen - modify', `
    CREATE POLICY sm_modify ON public.salesmen
      FOR ALL USING (current_user_is_admin());
  `],

  // ── Drop password_plain column from profiles ──
  ['Drop password_plain from profiles', `
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS password_plain;
  `],

];

console.log('Running RLS migration...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);

if (fail > 0) {
  console.log('\nSome steps failed — review output above. Common causes:');
  console.log('- Table does not exist (safe to ignore for optional tables)');
  console.log('- Policy already exists (run DROP first or ignore)');
}
