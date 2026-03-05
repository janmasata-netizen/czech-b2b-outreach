import { SUPABASE_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';
/**
 * Full setup script:
 * 1. DB migration: drop unique constraint on outreach_accounts.team_id, add outreach_account_id to waves
 * 2. Seed: Team V, Team M, outreach accounts, Jaromir Mašata salesman
 * 3. Config: seznam_from_email = vyhry-temu@seznam.cz
 */

const REST_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function ddl(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await r.json();
  console.log(`DDL [${r.status}]: ${query.substring(0, 70).trim()}`);
  if (!r.ok) console.error('  Error:', JSON.stringify(data).substring(0, 200));
  return data;
}

async function rest(method, path, body) {
  const r = await fetch(`${`${SUPABASE_URL}/rest/v1`}${path}`, {
    method,
    headers: REST_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.substring(0, 300)}`);
  return data;
}

async function upsert(table, data, conflict) {
  const r = await fetch(`${`${SUPABASE_URL}/rest/v1`}/${table}`, {
    method: 'POST',
    headers: { ...REST_HEADERS, Prefer: `resolution=merge-duplicates,return=representation` },
    body: JSON.stringify(data),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${text.substring(0, 200)}`);
  return JSON.parse(text);
}

// ─── 1. DB MIGRATION ─────────────────────────────────────────────────────────
async function migrate() {
  console.log('\n=== 1. DB Migration ===');
  await ddl('ALTER TABLE outreach_accounts DROP CONSTRAINT IF EXISTS outreach_accounts_team_id_key');
  await ddl('ALTER TABLE waves ADD COLUMN IF NOT EXISTS outreach_account_id uuid REFERENCES outreach_accounts(id) ON DELETE SET NULL');
  console.log('Migration done.');
}

// ─── 2. SEED DATA ─────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n=== 2. Seed Data ===');

  // Teams
  console.log('\nInserting teams...');
  let teams;
  try {
    teams = await upsert('teams', [
      { name: 'Team V' },
      { name: 'Team M' },
    ]);
    console.log('  Teams inserted:', teams.map(t => `${t.name} (${t.id})`).join(', '));
  } catch (e) {
    // If upsert fails due to no conflict column, insert individually
    console.log('  Trying individual inserts...');
    const existing = await rest('GET', '/teams?select=id,name');
    const existingNames = new Set(existing.map(t => t.name));
    teams = [...existing];
    for (const name of ['Team V', 'Team M']) {
      if (!existingNames.has(name)) {
        const [t] = await rest('POST', '/teams', [{ name }]);
        teams.push(t);
        console.log(`  Inserted: ${name} (${t.id})`);
      } else {
        console.log(`  Already exists: ${name}`);
      }
    }
    // Re-fetch to get all
    teams = await rest('GET', '/teams?select=id,name&name=in.(Team V,Team M)');
  }

  const teamV = teams.find(t => t.name === 'Team V');
  const teamM = teams.find(t => t.name === 'Team M');
  if (!teamV || !teamM) throw new Error('Could not find Team V or Team M after insert');
  console.log(`  Team V: ${teamV.id}`);
  console.log(`  Team M: ${teamM.id}`);

  // Outreach accounts
  console.log('\nInserting outreach accounts...');
  const existingOA = await rest('GET', `/outreach_accounts?select=id,email_address,team_id&team_id=in.(${teamV.id},${teamM.id})`);
  const oaEmails = new Set(existingOA.map(a => a.email_address));

  const oaToInsert = [];
  if (!oaEmails.has('vojta.mores@meisat.com')) {
    oaToInsert.push({ team_id: teamV.id, email_address: 'vojta.mores@meisat.com', display_name: 'Team V Outreach', smtp_credential_name: 'burner outreach email', daily_send_limit: 130, sends_today: 0, is_active: true });
  }
  if (!oaEmails.has('david.benes@meisat.com')) {
    oaToInsert.push({ team_id: teamM.id, email_address: 'david.benes@meisat.com', display_name: 'Team M Outreach', smtp_credential_name: 'burner outreach email', daily_send_limit: 130, sends_today: 0, is_active: true });
  }

  if (oaToInsert.length > 0) {
    const inserted = await rest('POST', '/outreach_accounts', oaToInsert);
    console.log('  Inserted outreach accounts:', inserted.map(a => `${a.email_address} (${a.id})`).join(', '));
  } else {
    console.log('  Outreach accounts already exist, skipping.');
  }

  // Salesman: Jaromir Mašata → Team M
  console.log('\nInserting salesman...');
  const existingSalesmen = await rest('GET', `/salesmen?select=id,email&team_id=eq.${teamM.id}`);
  const salesmanEmails = new Set(existingSalesmen.map(s => s.email));

  if (!salesmanEmails.has('jaromir.masata@meisat.com')) {
    const [s] = await rest('POST', '/salesmen', [{
      team_id: teamM.id,
      name: 'Jaromir Mašata',
      email: 'jaromir.masata@meisat.com',
      imap_credential_name: 'salesman (jaromir.masata@meisat.com)',
      is_active: true,
    }]);
    console.log(`  Inserted salesman: Jaromir Mašata (${s.id})`);
  } else {
    console.log('  Salesman Jaromir Mašata already exists, skipping.');
  }

  console.log('\nSeed done.');
}

// ─── 3. CONFIG ────────────────────────────────────────────────────────────────
async function updateConfig() {
  console.log('\n=== 3. Config Table ===');
  await rest('POST', '/config', [{ key: 'seznam_from_email', value: 'vyhry-temu@seznam.cz' }]);
  // Use upsert via PATCH with filter as fallback
  console.log('  seznam_from_email set (may show conflict if already exists, that is OK)');
}

// Main
async function main() {
  try {
    await migrate();
  } catch (e) { console.error('Migration error:', e.message); }

  try {
    await seed();
  } catch (e) { console.error('Seed error:', e.message); }

  try {
    await updateConfig();
  } catch (e) {
    // Try upsert approach
    try {
      await rest('PATCH', '/config?key=eq.seznam_from_email', { value: 'vyhry-temu@seznam.cz' });
      console.log('  seznam_from_email updated via PATCH');
    } catch (e2) { console.error('Config error:', e2.message); }
  }

  console.log('\n✅ Setup complete.');
}

main();
