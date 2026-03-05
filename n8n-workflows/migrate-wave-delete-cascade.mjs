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
      res.on('data', d => data += d);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (res.statusCode >= 400) {
          console.log(`  ✗ ${label}: ${JSON.stringify(parsed).slice(0, 200)}`);
          resolve(false);
        } else {
          console.log(`  ✓ ${label}`);
          resolve(true);
        }
      });
    });
    req.on('error', e => { console.log(`  ✗ ${label}: ${e.message}`); resolve(false); });
    req.write(body);
    req.end();
  });
}

console.log('\n=== Fix missing ON DELETE CASCADE FK constraints ===\n');

// 1. wave_leads.lead_id → leads
await runSQL(
  'Drop wave_leads_lead_id_fkey',
  `ALTER TABLE public.wave_leads DROP CONSTRAINT wave_leads_lead_id_fkey;`
);
await runSQL(
  'Re-add wave_leads_lead_id_fkey with CASCADE',
  `ALTER TABLE public.wave_leads ADD CONSTRAINT wave_leads_lead_id_fkey
   FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;`
);

// 2. lead_replies.lead_id → leads
await runSQL(
  'Drop lead_replies_lead_id_fkey',
  `ALTER TABLE public.lead_replies DROP CONSTRAINT lead_replies_lead_id_fkey;`
);
await runSQL(
  'Re-add lead_replies_lead_id_fkey with CASCADE',
  `ALTER TABLE public.lead_replies ADD CONSTRAINT lead_replies_lead_id_fkey
   FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;`
);

// 3. sent_emails.wave_lead_id → wave_leads
await runSQL(
  'Drop sent_emails_wave_lead_id_fkey',
  `ALTER TABLE public.sent_emails DROP CONSTRAINT sent_emails_wave_lead_id_fkey;`
);
await runSQL(
  'Re-add sent_emails_wave_lead_id_fkey with CASCADE',
  `ALTER TABLE public.sent_emails ADD CONSTRAINT sent_emails_wave_lead_id_fkey
   FOREIGN KEY (wave_lead_id) REFERENCES public.wave_leads(id) ON DELETE CASCADE;`
);

// 4. lead_replies.wave_lead_id → wave_leads
await runSQL(
  'Drop lead_replies_wave_lead_id_fkey',
  `ALTER TABLE public.lead_replies DROP CONSTRAINT lead_replies_wave_lead_id_fkey;`
);
await runSQL(
  'Re-add lead_replies_wave_lead_id_fkey with CASCADE',
  `ALTER TABLE public.lead_replies ADD CONSTRAINT lead_replies_wave_lead_id_fkey
   FOREIGN KEY (wave_lead_id) REFERENCES public.wave_leads(id) ON DELETE CASCADE;`
);

console.log('\nDone.');
