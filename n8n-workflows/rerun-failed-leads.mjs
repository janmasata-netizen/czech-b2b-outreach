/**
 * One-time script: Re-trigger WF4 for failed leads that have domain + contacts
 * These leads failed ARES lookup (no IČO) but can still generate emails from domain.
 *
 * Run: node rerun-failed-leads.mjs
 */
import http from 'http';
import https from 'https';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.mjs';

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + path);
    const req = https.request({
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

function supabasePatch(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + path);
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function triggerWF4(leadId) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({ lead_id: leadId });
    const req = http.request({
      hostname: '72.62.53.244', port: 32770,
      path: '/webhook/wf4-email-gen', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': 'reWDUmcjSRPTv3k-0CKdoASO_KY7Z3ux',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function main() {
  // 1. Find failed leads that have a domain
  console.log('Querying failed leads with domain...');
  const leads = await supabaseGet('leads?status=eq.failed&domain=not.is.null&select=id,company_name,domain,company_id');
  console.log(`Found ${leads.length} failed leads with domain`);

  if (leads.length === 0) {
    console.log('No leads to re-run. Done.');
    return;
  }

  for (const lead of leads) {
    // 2. Check if lead has contacts (via company_id)
    if (lead.company_id) {
      const contacts = await supabaseGet(`contacts?company_id=eq.${lead.company_id}&select=id&limit=1`);
      if (contacts.length === 0) {
        console.log(`  [${lead.company_name}] No contacts found — skipping`);
        continue;
      }
    }

    console.log(`  [${lead.company_name}] domain=${lead.domain} — resetting to enriched...`);

    // 3. Update status from failed to enriched, clear error
    const patchRes = await supabasePatch(
      `leads?id=eq.${lead.id}`,
      { status: 'enriched', enrichment_error: null }
    );
    if (patchRes.status >= 400) {
      console.error(`    PATCH FAILED (${patchRes.status}): ${patchRes.data}`);
      continue;
    }

    // 4. Trigger WF4
    console.log(`    Triggering WF4...`);
    const trigRes = await triggerWF4(lead.id);
    if (trigRes.status >= 400) {
      console.error(`    WF4 trigger FAILED (${trigRes.status}): ${trigRes.data}`);
    } else {
      console.log(`    WF4 triggered OK`);
    }

    // Small delay between triggers
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('Done!');
}

main();
