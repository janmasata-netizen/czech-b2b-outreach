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
  ['Drop existing wave_analytics view', `
    DROP VIEW IF EXISTS public.wave_analytics;
  `],

  ['Recreate wave_analytics view with per-seq date/time columns', `
    CREATE VIEW public.wave_analytics AS
    SELECT
      w.id,
      w.name,
      w.team_id,
      w.status,
      w.template_set_id,
      ts.name AS template_set_name,
      w.send_date_seq1,
      w.send_date_seq2,
      w.send_date_seq3,
      w.send_time_seq1,
      w.send_time_seq2,
      w.send_time_seq3,
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
    GROUP BY w.id, w.name, w.team_id, w.status, w.template_set_id, ts.name,
             w.send_date_seq1, w.send_date_seq2, w.send_date_seq3,
             w.send_time_seq1, w.send_time_seq2, w.send_time_seq3,
             w.created_at;
  `],

  ['Grant select on wave_analytics', `
    GRANT SELECT ON public.wave_analytics TO anon, authenticated, service_role;
  `],
];

console.log('Updating wave_analytics view with per-seq date/time columns...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
