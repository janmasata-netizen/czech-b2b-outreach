/**
 * migrate-auto-complete-waves.mjs
 * Creates the auto_complete_waves() RPC in Supabase.
 * Scans all scheduled/sending waves — if all wave_leads are finished
 * (completed/replied/failed), marks the wave as completed.
 */

import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

const SUPABASE_REF = 'cycapkswtucbucyegdsn';
const SQL = `
CREATE OR REPLACE FUNCTION public.auto_complete_waves()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_completed_ids uuid[];
  v_count integer;
BEGIN
  WITH wave_stats AS (
    SELECT w.id AS wave_id,
           COUNT(wl.id) AS total_leads,
           COUNT(wl.id) FILTER (
             WHERE wl.status IN ('completed','replied','failed')
           ) AS finished_leads
    FROM public.waves w
    INNER JOIN public.wave_leads wl ON wl.wave_id = w.id
    WHERE w.status IN ('scheduled','sending')
    GROUP BY w.id
  )
  SELECT ARRAY_AGG(wave_id) INTO v_completed_ids
  FROM wave_stats
  WHERE total_leads > 0 AND total_leads = finished_leads;

  IF v_completed_ids IS NOT NULL AND array_length(v_completed_ids, 1) > 0 THEN
    UPDATE public.waves SET status = 'completed', updated_at = now()
    WHERE id = ANY(v_completed_ids);
    v_count := array_length(v_completed_ids, 1);
  ELSE
    v_count := 0;
  END IF;

  RETURN json_build_object(
    'waves_completed', v_count,
    'wave_ids', COALESCE(v_completed_ids, ARRAY[]::uuid[])
  );
END;
$$;
`;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`${res.statusCode}: ${data}`));
        } else {
          resolve(data ? JSON.parse(data) : {});
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Creating auto_complete_waves() RPC ===');
  const result = await request(
    'POST',
    `/v1/projects/${SUPABASE_REF}/database/query`,
    { query: SQL }
  );
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('Done!');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
