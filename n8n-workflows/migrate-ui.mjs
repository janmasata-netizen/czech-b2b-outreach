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

const steps = [

  // ── leads: add missing statuses ──────────────────────────────────────────────
  ['leads: drop old CHECK constraint', `
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
  `],
  ['leads: add updated status CHECK (with email_verified, bounced, completed)', `
    ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status IN (
      'new','enriching','enriched','email_discovery',
      'email_verified','ready','failed','replied','in_wave','bounced','completed'
    ));
  `],

  // ── jednatels: add role column ────────────────────────────────────────────────
  ['jednatels: add role column', `
    ALTER TABLE public.jednatels ADD COLUMN IF NOT EXISTS role text;
  `],

  // ── email_candidates: add is_primary + verification_status ──────────────────
  ['email_candidates: add is_primary column', `
    ALTER TABLE public.email_candidates ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;
  `],
  ['email_candidates: add verification_status column', `
    ALTER TABLE public.email_candidates ADD COLUMN IF NOT EXISTS verification_status text;
  `],

  // ── profiles table (for UI auth) ─────────────────────────────────────────────
  ['Create profiles table (if not exists)', `
    CREATE TABLE IF NOT EXISTS public.profiles (
      id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      team_id   uuid REFERENCES public.teams(id),
      full_name text,
      is_admin  boolean DEFAULT false,
      created_at timestamptz DEFAULT now()
    );
  `],

  // ── wave_analytics view ───────────────────────────────────────────────────────
  ['Create wave_analytics view', `
    CREATE OR REPLACE VIEW public.wave_analytics AS
    SELECT
      w.id,
      w.name,
      w.team_id,
      w.status,
      w.template_set_id,
      ts.name AS template_set_name,
      w.send_date_seq1,
      w.created_at,
      COALESCE(COUNT(DISTINCT wl.id), 0)::integer AS lead_count,
      COALESCE(COUNT(DISTINCT se.id), 0)::integer AS sent_count,
      COALESCE(COUNT(DISTINCT lr.id), 0)::integer AS reply_count,
      CASE WHEN COUNT(DISTINCT se.id) > 0
        THEN ROUND(COUNT(DISTINCT lr.id)::numeric / COUNT(DISTINCT se.id) * 100, 1)
        ELSE 0::numeric END AS reply_rate,
      COALESCE(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'A' THEN wl.id END), 0)::integer AS variant_a_leads,
      COALESCE(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'B' THEN wl.id END), 0)::integer AS variant_b_leads,
      COALESCE(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'A' THEN se.id END), 0)::integer AS variant_a_sent,
      COALESCE(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'B' THEN se.id END), 0)::integer AS variant_b_sent,
      COALESCE(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'A' THEN lr.id END), 0)::integer AS variant_a_replies,
      COALESCE(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'B' THEN lr.id END), 0)::integer AS variant_b_replies,
      CASE WHEN COUNT(DISTINCT CASE WHEN wl.ab_variant = 'A' THEN se.id END) > 0
        THEN ROUND(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'A' THEN lr.id END)::numeric / COUNT(DISTINCT CASE WHEN wl.ab_variant = 'A' THEN se.id END) * 100, 1)
        ELSE 0::numeric END AS variant_a_reply_rate,
      CASE WHEN COUNT(DISTINCT CASE WHEN wl.ab_variant = 'B' THEN se.id END) > 0
        THEN ROUND(COUNT(DISTINCT CASE WHEN wl.ab_variant = 'B' THEN lr.id END)::numeric / COUNT(DISTINCT CASE WHEN wl.ab_variant = 'B' THEN se.id END) * 100, 1)
        ELSE 0::numeric END AS variant_b_reply_rate
    FROM public.waves w
    LEFT JOIN public.template_sets ts ON ts.id = w.template_set_id
    LEFT JOIN public.wave_leads wl ON wl.wave_id = w.id
    LEFT JOIN public.sent_emails se ON se.wave_lead_id = wl.id
    LEFT JOIN public.lead_replies lr ON lr.wave_lead_id = wl.id
    GROUP BY w.id, w.name, w.team_id, w.status, w.template_set_id, ts.name, w.send_date_seq1, w.created_at;
  `],

  // ── Grant access ──────────────────────────────────────────────────────────────
  ['Grant select on wave_analytics', `
    GRANT SELECT ON public.wave_analytics TO anon, authenticated, service_role;
  `],

];

console.log('Running UI migration for cycapkswtucbucyegdsn...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
