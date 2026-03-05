import https from 'https';
import { SUPABASE_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_MANAGEMENT_TOKEN } from './env.mjs';

function request(opts, body) {
  return new Promise((resolve) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

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
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.log(`✗ ${label}:`, JSON.stringify(parsed).slice(0, 300));
            resolve(null);
          } else {
            resolve(parsed);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', e => { console.log(`✗ ${label}: ${e.message}`); resolve(null); });
    req.write(body);
    req.end();
  });
}

// Step 1: Create auth user
const body = JSON.stringify({
  email: 'admin@meisat.com',
  password: 'Meisat123',
  email_confirm: true,
});
const res = await request({
  hostname: SUPABASE_URL,
  path: '/auth/v1/admin/users',
  method: 'POST',
  headers: {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, body);

let userId;
if (res.status === 200 || res.status === 201) {
  userId = res.body.id;
  console.log(`✓ Created auth user: admin@meisat.com (id: ${userId})`);
} else if (res.status === 422 && JSON.stringify(res.body).includes('already')) {
  console.log('User already exists — fetching existing user ID...');
  // Fetch existing user
  const list = await request({
    hostname: SUPABASE_URL,
    path: '/auth/v1/admin/users?email=admin%40meisat.com',
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }, null);
  const users = list.body?.users ?? list.body;
  const existing = Array.isArray(users) ? users.find(u => u.email === 'admin@meisat.com') : null;
  if (existing) {
    userId = existing.id;
    console.log(`✓ Found existing user (id: ${userId})`);
    // Update password
    const upd = JSON.stringify({ password: 'Meisat123' });
    const updRes = await request({
      hostname: SUPABASE_URL,
      path: `/auth/v1/admin/users/${userId}`,
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(upd),
      },
    }, upd);
    if (updRes.status < 300) console.log('✓ Password updated to Meisat123');
    else console.log('✗ Password update failed:', updRes.body);
  } else {
    console.log('✗ Could not find existing user:', JSON.stringify(list.body).slice(0, 200));
    process.exit(1);
  }
} else {
  console.log('✗ Failed to create user:', res.status, JSON.stringify(res.body).slice(0, 300));
  process.exit(1);
}

// Step 2: Upsert profiles row
const sql = `
  INSERT INTO public.profiles (id, team_id, full_name, is_admin)
  VALUES (
    '${userId}',
    'aaaaaaaa-0001-0000-0000-000000000001',
    'Admin',
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET team_id = 'aaaaaaaa-0001-0000-0000-000000000001',
        full_name = 'Admin',
        is_admin = true;
`;

const sqlRes = await runSQL('Upsert profiles row', sql.trim());
if (sqlRes !== null) {
  console.log('✓ profiles row upserted');
} else {
  console.log('✗ profiles upsert failed');
}

console.log('\nDone. Login: admin@meisat.com / Meisat123');
