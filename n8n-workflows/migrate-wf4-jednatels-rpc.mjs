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
        'Authorization':  `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.log(`  ✗ ${label}: ${JSON.stringify(parsed).slice(0, 300)}`);
            resolve(false);
          } else {
            console.log(`  ✓ ${label}`);
            resolve(true);
          }
        } catch (e) {
          console.log(`  ✗ ${label}: parse error — ${data.slice(0, 200)}`);
          resolve(false);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

console.log('\n=== Create get_jednatels_for_lead RPC function ===');

await runSQL('CREATE OR REPLACE FUNCTION get_jednatels_for_lead', `
  CREATE OR REPLACE FUNCTION public.get_jednatels_for_lead(p_lead_id uuid)
  RETURNS json
  LANGUAGE sql STABLE
  AS $$
    SELECT json_build_object(
      'jednatels', COALESCE(
        json_agg(
          json_build_object('id', j.id, 'first_name', j.first_name, 'last_name', j.last_name)
          ORDER BY j.created_at
        ),
        '[]'::json
      ),
      'count', COUNT(j.id)
    )
    FROM public.jednatels j
    WHERE j.lead_id = p_lead_id;
  $$;
`);

console.log('\nDone.');
