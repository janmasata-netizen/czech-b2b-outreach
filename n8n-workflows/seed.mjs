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
            console.log(`✗ ${label} (HTTP ${res.statusCode}):`, JSON.stringify(parsed).slice(0, 400));
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

  // ── Team ─────────────────────────────────────────────────────────────────────
  ['Insert team: Netizen', `
    INSERT INTO public.teams (id, name, salesman_email, is_active)
    VALUES (
      'aaaaaaaa-0001-0000-0000-000000000001',
      'Netizen',
      'jan.masata@meisat.com',
      true
    )
    ON CONFLICT (id) DO NOTHING;
  `],

  // ── Outreach account placeholder (fill in real SMTP credential name later) ──
  ['Insert outreach account placeholder', `
    INSERT INTO public.outreach_accounts (
      id, team_id, email_address, display_name, smtp_credential_name, daily_send_limit, is_active
    )
    VALUES (
      'bbbbbbbb-0001-0000-0000-000000000001',
      'aaaaaaaa-0001-0000-0000-000000000001',
      'outreach@placeholder.cz',
      'Netizen Outreach',
      'Burner SMTP',
      130,
      false
    )
    ON CONFLICT (team_id) DO NOTHING;
  `],

  // ── Template set ─────────────────────────────────────────────────────────────
  ['Insert template set: Základní sada', `
    INSERT INTO public.template_sets (id, name, description)
    VALUES (
      'cccccccc-0001-0000-0000-000000000001',
      'Základní sada',
      'Výchozí šablony pro cold outreach'
    )
    ON CONFLICT (id) DO NOTHING;
  `],

  // ── Templates: Seq 1, Variant A ──────────────────────────────────────────────
  ['Insert template: Seq 1 / Var A', `
    INSERT INTO public.email_templates (id, template_set_id, sequence_number, variant, subject, body_html)
    VALUES (
      'dddddddd-0001-0000-0000-000000000001',
      'cccccccc-0001-0000-0000-000000000001',
      1, 'A',
      '{{salutation}}, rychlá otázka k {{company_name}}',
      '<p>Dobrý den {{salutation}},</p>
<p>narazil jsem na {{company_name}} a zaujal mě váš přístup. Pomáháme firmám ve vašem oboru získávat více zákazníků přes digitální kanály — aniž by musely navyšovat tým.</p>
<p>Měl byste zájem o krátký 15minutový hovor tento týden?</p>
<p>S pozdravem,<br>Jan</p>'
    )
    ON CONFLICT (template_set_id, sequence_number, variant) DO NOTHING;
  `],

  // ── Templates: Seq 1, Variant B ──────────────────────────────────────────────
  ['Insert template: Seq 1 / Var B', `
    INSERT INTO public.email_templates (id, template_set_id, sequence_number, variant, subject, body_html)
    VALUES (
      'dddddddd-0001-0000-0000-000000000002',
      'cccccccc-0001-0000-0000-000000000001',
      1, 'B',
      '{{company_name}} — spolupráce?',
      '<p>Dobrý den {{salutation}},</p>
<p>pracujeme s několika firmami ve vašem segmentu a pomáháme jim systematicky budovat klientskou základnu. U {{company_name}} vidím konkrétní příležitost.</p>
<p>Hodí se vám krátký hovor tento nebo příští týden?</p>
<p>Díky,<br>Jan</p>'
    )
    ON CONFLICT (template_set_id, sequence_number, variant) DO NOTHING;
  `],

  // ── Templates: Seq 2, Variant A ──────────────────────────────────────────────
  ['Insert template: Seq 2 / Var A', `
    INSERT INTO public.email_templates (id, template_set_id, sequence_number, variant, subject, body_html)
    VALUES (
      'dddddddd-0002-0000-0000-000000000001',
      'cccccccc-0001-0000-0000-000000000001',
      2, 'A',
      'Re: {{company_name}} — jen se ujišťuji',
      '<p>Dobrý den {{salutation}},</p>
<p>jen se ujišťuji, zda vám můj předchozí e-mail dorazil. Chápu, že jste zaneprázdněni — proto nabízím jen 15 minut bez závazků.</p>
<p>Dáte mi vědět, zda to téma pro vás dává smysl?</p>
<p>S pozdravem,<br>Jan</p>'
    )
    ON CONFLICT (template_set_id, sequence_number, variant) DO NOTHING;
  `],

  // ── Templates: Seq 2, Variant B ──────────────────────────────────────────────
  ['Insert template: Seq 2 / Var B', `
    INSERT INTO public.email_templates (id, template_set_id, sequence_number, variant, subject, body_html)
    VALUES (
      'dddddddd-0002-0000-0000-000000000002',
      'cccccccc-0001-0000-0000-000000000001',
      2, 'B',
      'Follow-up: {{company_name}}',
      '<p>Ahoj {{salutation}},</p>
<p>posílám krátký follow-up. Pokud moje nabídka není relevantní, klidně napište — nechci obtěžovat.</p>
<p>Pokud ale máte zájem se pobavit o tom, jak jsme podobným firmám pomohli, rád se ozvu.</p>
<p>Jan</p>'
    )
    ON CONFLICT (template_set_id, sequence_number, variant) DO NOTHING;
  `],

  // ── Templates: Seq 3, Variant A ──────────────────────────────────────────────
  ['Insert template: Seq 3 / Var A', `
    INSERT INTO public.email_templates (id, template_set_id, sequence_number, variant, subject, body_html)
    VALUES (
      'dddddddd-0003-0000-0000-000000000001',
      'cccccccc-0001-0000-0000-000000000001',
      3, 'A',
      'Poslední zpráva — {{company_name}}',
      '<p>Dobrý den {{salutation}},</p>
<p>chápu, že jste velmi vytíženi. Tímto e-mailem zakončím svou snahu — pokud by se však situace v {{company_name}} v budoucnu změnila, rád se ozvu.</p>
<p>Přeji hodně úspěchů,<br>Jan</p>'
    )
    ON CONFLICT (template_set_id, sequence_number, variant) DO NOTHING;
  `],

  // ── Templates: Seq 3, Variant B ──────────────────────────────────────────────
  ['Insert template: Seq 3 / Var B', `
    INSERT INTO public.email_templates (id, template_set_id, sequence_number, variant, subject, body_html)
    VALUES (
      'dddddddd-0003-0000-0000-000000000002',
      'cccccccc-0001-0000-0000-000000000001',
      3, 'B',
      'Závěr — zůstávám k dispozici',
      '<p>Ahoj {{salutation}},</p>
<p>tohle bude moje poslední zpráva. Pokud se v {{company_name}} situace změní a budete hledat způsob, jak efektivněji oslovovat nové zákazníky, klidně se ozvěte — jsem k dispozici.</p>
<p>Hodně štěstí,<br>Jan</p>'
    )
    ON CONFLICT (template_set_id, sequence_number, variant) DO NOTHING;
  `],

  // ── Associate admin profile with team ─────────────────────────────────────────
  ['Link admin profile to Netizen team', `
    UPDATE public.profiles
    SET team_id = 'aaaaaaaa-0001-0000-0000-000000000001'
    WHERE id = 'e43820c3-b9ab-40bf-9f37-58c372d8667f';
  `],

];

console.log('Seeding database for cycapkswtucbucyegdsn...\n');
let ok = 0, fail = 0;
for (const [label, sql] of steps) {
  const success = await runSQL(label, sql.trim());
  if (success) ok++; else fail++;
}
console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
