/**
 * Demo mode fake data — single source of truth for all demo entities.
 * All dates are relative to Date.now() for freshness.
 * Deterministic UUIDs like 'd0000000-...-000001' for cross-entity references.
 */

import type {
  DashboardStats,
  WaveAnalytics,
  Company,
  Contact,
  EmailCandidate,
  Lead,
  Tag,
  LeadTag,
  CompanyTag,
  Team,
  Salesman,
  TemplateSet,
  EmailTemplate,
  RetargetPoolLead,
  WavePreset,
  ImportGroupStats,
} from '@/types/database';

// ── Helpers ──

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

function did(n: number): string {
  return `d0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

// ── Team ──

export const DEMO_TEAM: Team = {
  id: did(1),
  name: 'Meisat Outreach',
  salesman_email: 'jan.novak@meisat.cz',
  daily_send_limit: 200,
  sends_today: 47,
  is_active: true,
  retarget_lockout_days: 30,
  created_at: daysAgo(90),
};

// ── Salesmen ──

export const DEMO_SALESMEN: Salesman[] = [
  {
    id: did(10),
    team_id: did(1),
    name: 'Jan Novak',
    email: 'jan.novak@meisat.cz',
    imap_credential_name: 'Salesman IMAP 1',
    is_active: true,
    created_at: daysAgo(90),
    team: { name: 'Meisat Outreach' },
  },
  {
    id: did(11),
    team_id: did(1),
    name: 'Petr Horak',
    email: 'petr.horak@meisat.cz',
    imap_credential_name: 'Salesman IMAP 2',
    is_active: true,
    created_at: daysAgo(60),
    team: { name: 'Meisat Outreach' },
  },
];

// ── Tags ──

export const DEMO_TAGS: Tag[] = [
  { id: did(20), name: 'VIP', color: '#f59e0b', team_id: null, created_at: daysAgo(60) },
  { id: did(21), name: 'Email outreach', color: '#3ecf8e', team_id: null, created_at: daysAgo(60) },
  { id: did(22), name: 'Priority', color: '#8b5cf6', team_id: did(1), created_at: daysAgo(30) },
  { id: did(23), name: 'Blacklist', color: '#ef4444', team_id: null, created_at: daysAgo(60) },
];

// ── Companies + Contacts + Email Candidates ──

interface DemoCompanyDef {
  name: string;
  ico: string;
  website: string;
  domain: string;
  contacts: { full_name: string; salutation: string; email: string; verified: boolean; seznam_status: string }[];
  tags?: string[];
}

const COMPANY_DEFS: DemoCompanyDef[] = [
  { name: 'Marido s.r.o.', ico: '12345678', website: 'https://marido.cz', domain: 'marido.cz', contacts: [{ full_name: 'Karel Mares', salutation: 'Vazeny pane Maresi', email: 'karel.mares@marido.cz', verified: true, seznam_status: 'verified' }], tags: ['VIP'] },
  { name: 'TechnoServis Praha a.s.', ico: '23456789', website: 'https://technoservis.cz', domain: 'technoservis.cz', contacts: [{ full_name: 'Pavel Cerny', salutation: 'Vazeny pane Cerny', email: 'pavel.cerny@technoservis.cz', verified: true, seznam_status: 'verified' }, { full_name: 'Eva Kralova', salutation: 'Vazena pani Kralova', email: 'eva.kralova@technoservis.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'Stavba Plus s.r.o.', ico: '34567890', website: 'https://stavbaplus.cz', domain: 'stavbaplus.cz', contacts: [{ full_name: 'Martin Dvorak', salutation: 'Vazeny pane Dvoraku', email: 'martin.dvorak@stavbaplus.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'Zeleny Svet s.r.o.', ico: '45678901', website: 'https://zelenysvet.cz', domain: 'zelenysvet.cz', contacts: [{ full_name: 'Jana Novotna', salutation: 'Vazena pani Novotna', email: 'jana.novotna@zelenysvet.cz', verified: true, seznam_status: 'likely_valid' }] },
  { name: 'DataSoft Solutions s.r.o.', ico: '56789012', website: 'https://datasoft.cz', domain: 'datasoft.cz', contacts: [{ full_name: 'Tomas Kucera', salutation: 'Vazeny pane Kucero', email: 'tomas.kucera@datasoft.cz', verified: true, seznam_status: 'verified' }, { full_name: 'Lucie Svobodova', salutation: 'Vazena pani Svobodova', email: 'lucie.svobodova@datasoft.cz', verified: false, seznam_status: 'pending' }] },
  { name: 'Bohemia Transport a.s.', ico: '67890123', website: 'https://bohemiatransport.cz', domain: 'bohemiatransport.cz', contacts: [{ full_name: 'Jiri Pokorny', salutation: 'Vazeny pane Pokorny', email: 'jiri.pokorny@bohemiatransport.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'Pekarna U Mlynare s.r.o.', ico: '78901234', website: 'https://pekarnamlynare.cz', domain: 'pekarnamlynare.cz', contacts: [{ full_name: 'Vladimira Hajkova', salutation: 'Vazena pani Hajkova', email: 'vladimira.hajkova@pekarnamlynare.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'CityMed s.r.o.', ico: '89012345', website: 'https://citymed.cz', domain: 'citymed.cz', contacts: [{ full_name: 'Ondrej Fiala', salutation: 'Vazeny pane Fialo', email: 'ondrej.fiala@citymed.cz', verified: true, seznam_status: 'likely_valid' }] },
  { name: 'Prumyslove Systemy a.s.', ico: '90123456', website: 'https://prumyslovesystemy.cz', domain: 'prumyslovesystemy.cz', contacts: [{ full_name: 'Radek Prochazka', salutation: 'Vazeny pane Prochazko', email: 'radek.prochazka@prumyslovesystemy.cz', verified: true, seznam_status: 'verified' }, { full_name: 'Monika Vesela', salutation: 'Vazena pani Vesela', email: 'monika.vesela@prumyslovesystemy.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'Kreativni Studio K2 s.r.o.', ico: '01234567', website: 'https://studiok2.cz', domain: 'studiok2.cz', contacts: [{ full_name: 'Petra Kralickova', salutation: 'Vazena pani Kralickova', email: 'petra.kralickova@studiok2.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'Moravska Logistika s.r.o.', ico: '11223344', website: 'https://moravskalogistika.cz', domain: 'moravskalogistika.cz', contacts: [{ full_name: 'Ales Komarek', salutation: 'Vazeny pane Komarku', email: 'ales.komarek@moravskalogistika.cz', verified: false, seznam_status: 'bounced' }] },
  { name: 'EuroTech CZ s.r.o.', ico: '22334455', website: 'https://eurotech.cz', domain: 'eurotech.cz', contacts: [{ full_name: 'David Nemec', salutation: 'Vazeny pane Nemci', email: 'david.nemec@eurotech.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'Gastro Primo s.r.o.', ico: '33445566', website: 'https://gastroprimo.cz', domain: 'gastroprimo.cz', contacts: [{ full_name: 'Miroslava Sedlackova', salutation: 'Vazena pani Sedlackova', email: 'info@gastroprimo.cz', verified: true, seznam_status: 'likely_valid' }] },
  { name: 'Kvalitest a.s.', ico: '44556677', website: 'https://kvalitest.cz', domain: 'kvalitest.cz', contacts: [{ full_name: 'Michal Bartos', salutation: 'Vazeny pane Bartosi', email: 'michal.bartos@kvalitest.cz', verified: true, seznam_status: 'verified' }] },
  { name: 'HydroStar s.r.o.', ico: '55667788', website: 'https://hydrostar.cz', domain: 'hydrostar.cz', contacts: [{ full_name: 'Zdenek Kral', salutation: 'Vazeny pane Krali', email: 'zdenek.kral@hydrostar.cz', verified: false, seznam_status: 'pending' }] },
];

// Lead statuses matching plan: ready(4), in_wave(3), completed(2), replied(2), enriching(1), failed(1), info_email(1), staff_email(1)
const LEAD_STATUSES: string[] = [
  'ready', 'ready', 'ready', 'ready',
  'in_wave', 'in_wave', 'in_wave',
  'completed', 'completed',
  'replied', 'replied',
  'enriching',
  'failed',
  'info_email',
  'staff_email',
];

// Build companies, contacts, email_candidates, leads
export const DEMO_COMPANIES: (Company & { contacts: (Contact & { email_candidates: EmailCandidate[] })[]; email_candidates: EmailCandidate[]; tags: { id: string; name: string; color: string }[] })[] = [];
export const DEMO_CONTACTS: (Contact & { email_candidates: EmailCandidate[] })[] = [];
export const DEMO_EMAIL_CANDIDATES: EmailCandidate[] = [];
export const DEMO_LEADS: (Lead & { contacts: Contact[]; email_candidates: EmailCandidate[] })[] = [];
export const DEMO_COMPANY_TAGS: CompanyTag[] = [];

let contactIdx = 100;
let ecIdx = 200;

COMPANY_DEFS.forEach((def, i) => {
  const companyId = did(50 + i);
  const leadId = did(300 + i);

  const contacts: (Contact & { email_candidates: EmailCandidate[] })[] = def.contacts.map(c => {
    const cId = did(contactIdx++);
    const ec: EmailCandidate = {
      id: did(ecIdx++),
      contact_id: cId,
      email_address: c.email,
      is_verified: c.verified,
      seznam_status: c.seznam_status as EmailCandidate['seznam_status'],
      qev_status: c.verified ? 'manually_verified' : null,
      created_at: daysAgo(30),
    };
    DEMO_EMAIL_CANDIDATES.push(ec);
    const contact: Contact & { email_candidates: EmailCandidate[] } = {
      id: cId,
      company_id: companyId,
      full_name: c.full_name,
      first_name: c.full_name.split(' ')[0],
      last_name: c.full_name.split(' ').slice(1).join(' '),
      salutation: c.salutation,
      role: 'jednatel',
      created_at: daysAgo(30),
      email_candidates: [ec],
    };
    DEMO_CONTACTS.push(contact);
    return contact;
  });

  const email_candidates = contacts.flatMap(c => c.email_candidates);

  const tags: { id: string; name: string; color: string }[] = [];
  if (def.tags) {
    def.tags.forEach(tagName => {
      const tag = DEMO_TAGS.find(t => t.name === tagName);
      if (tag) {
        tags.push({ id: tag.id, name: tag.name, color: tag.color });
        DEMO_COMPANY_TAGS.push({
          id: did(400 + DEMO_COMPANY_TAGS.length),
          company_id: companyId,
          tag_id: tag.id,
          created_at: daysAgo(20),
          tag,
        });
      }
    });
  }

  const company: typeof DEMO_COMPANIES[number] = {
    id: companyId,
    company_name: def.name,
    ico: def.ico,
    website: def.website,
    domain: def.domain,
    master_status: 'active',
    team_id: did(1),
    created_at: daysAgo(45 - i),
    updated_at: daysAgo(10 - Math.min(i, 9)),
    contacts,
    email_candidates,
    tags,
  };
  DEMO_COMPANIES.push(company);

  const lead: typeof DEMO_LEADS[number] = {
    id: leadId,
    company_name: def.name,
    website: def.website,
    domain: def.domain,
    ico: def.ico,
    team_id: did(1),
    company_id: companyId,
    status: LEAD_STATUSES[i] as Lead['status'],
    lead_type: 'company',
    language: 'cs',
    master_status: 'active',
    created_at: daysAgo(40 - i),
    updated_at: daysAgo(5 - Math.min(i, 4)),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    contacts: contacts.map(({ email_candidates: _ec, ...rest }) => rest),
    email_candidates,
  };
  DEMO_LEADS.push(lead);
});

// ── Lookup maps for detail pages ──

export const DEMO_COMPANY_BY_ID = Object.fromEntries(DEMO_COMPANIES.map(c => [c.id, c]));
export const DEMO_LEAD_BY_ID = Object.fromEntries(DEMO_LEADS.map(l => [l.id, l]));

// ── Template Sets ──

const DEMO_TEMPLATES_HLAVNI: EmailTemplate[] = [
  { id: did(500), template_set_id: did(490), sequence_number: 1, variant: 'A', subject: 'Spoluprace s {{company_name}}', body_html: '<p>{{salutation}},</p><p>chteli bychom Vam nabidnout spolupraci...</p>' },
  { id: did(501), template_set_id: did(490), sequence_number: 2, variant: 'A', subject: 'Re: Spoluprace s {{company_name}}', body_html: '<p>{{salutation}},</p><p>chtel bych navazat na svuj predchozi email...</p>' },
  { id: did(502), template_set_id: did(490), sequence_number: 3, variant: 'A', subject: 'Re: Spoluprace s {{company_name}}', body_html: '<p>{{salutation}},</p><p>poslednich par informaci k nasi nabidce...</p>' },
  { id: did(503), template_set_id: did(490), sequence_number: 1, variant: 'B', subject: 'Nabidka pro {{company_name}}', body_html: '<p>{{salutation}},</p><p>mame pro Vas zajimavou nabidku...</p>' },
];

const DEMO_TEMPLATES_FOLLOWUP: EmailTemplate[] = [
  { id: did(510), template_set_id: did(491), sequence_number: 1, variant: 'A', subject: 'Follow up — {{company_name}}', body_html: '<p>Dear {{salutation}},</p><p>Following up on our previous conversation...</p>' },
];

export const DEMO_TEMPLATE_SETS: (TemplateSet & { email_templates: EmailTemplate[] })[] = [
  {
    id: did(490),
    name: 'Hlavni sablona - CZ',
    description: 'Hlavni ceska sablona pro B2B outreach',
    team_id: did(1),
    variables: [
      { name: 'company_name', label: 'Nazev firmy', description: 'Nazev firmy leadu' },
      { name: 'salutation', label: 'Osloveni', description: 'Formalni osloveni jednatele' },
    ],
    created_at: daysAgo(60),
    email_templates: DEMO_TEMPLATES_HLAVNI,
  },
  {
    id: did(491),
    name: 'Follow-up EN',
    description: 'English follow-up template',
    team_id: did(1),
    variables: [
      { name: 'company_name', label: 'Company name' },
      { name: 'salutation', label: 'Salutation' },
    ],
    created_at: daysAgo(30),
    email_templates: DEMO_TEMPLATES_FOLLOWUP,
  },
];

export const DEMO_TEMPLATE_SET_BY_ID = Object.fromEntries(DEMO_TEMPLATE_SETS.map(t => [t.id, t]));

// ── Waves ──

export const DEMO_WAVES: WaveAnalytics[] = [
  {
    id: did(600),
    name: 'Leden 2026 — hlavni',
    team_id: did(1),
    status: 'completed',
    template_set_id: did(490),
    template_set_name: 'Hlavni sablona - CZ',
    salesman_id: did(10),
    from_email: 'jan.novak@meisat.cz',
    send_date_seq1: daysAgo(30),
    send_date_seq2: daysAgo(25),
    send_date_seq3: daysAgo(20),
    send_time_seq1: '09:00',
    send_time_seq2: '09:00',
    send_time_seq3: '09:00',
    completed_at: daysAgo(15),
    created_at: daysAgo(35),
    lead_count: 25,
    sent_count: 72,
    reply_count: 12,
    reply_rate: 16.7,
    variant_a_leads: 13,
    variant_b_leads: 12,
    variant_a_sent: 38,
    variant_b_sent: 34,
    variant_a_replies: 7,
    variant_b_replies: 5,
    variant_a_reply_rate: 18.4,
    variant_b_reply_rate: 14.7,
  },
  {
    id: did(601),
    name: 'Unor 2026 — tech firmy',
    team_id: did(1),
    status: 'sending',
    template_set_id: did(490),
    template_set_name: 'Hlavni sablona - CZ',
    salesman_id: did(10),
    from_email: 'jan.novak@meisat.cz',
    send_date_seq1: daysAgo(5),
    send_date_seq2: daysFromNow(2),
    send_date_seq3: daysFromNow(9),
    send_time_seq1: '10:00',
    send_time_seq2: '10:00',
    send_time_seq3: '10:00',
    created_at: daysAgo(10),
    lead_count: 18,
    sent_count: 18,
    reply_count: 2,
    reply_rate: 11.1,
    variant_a_leads: 9,
    variant_b_leads: 9,
    variant_a_sent: 9,
    variant_b_sent: 9,
    variant_a_replies: 1,
    variant_b_replies: 1,
    variant_a_reply_rate: 11.1,
    variant_b_reply_rate: 11.1,
  },
  {
    id: did(602),
    name: 'Brezen 2026 — stavebnictvi',
    team_id: did(1),
    status: 'scheduled',
    template_set_id: did(490),
    template_set_name: 'Hlavni sablona - CZ',
    salesman_id: did(11),
    from_email: 'petr.horak@meisat.cz',
    send_date_seq1: daysFromNow(3),
    send_date_seq2: daysFromNow(10),
    send_date_seq3: daysFromNow(17),
    send_time_seq1: '09:30',
    send_time_seq2: '09:30',
    send_time_seq3: '09:30',
    created_at: daysAgo(3),
    lead_count: 15,
    sent_count: 0,
    reply_count: 0,
    reply_rate: 0,
    variant_a_leads: 8,
    variant_b_leads: 7,
    variant_a_sent: 0,
    variant_b_sent: 0,
    variant_a_replies: 0,
    variant_b_replies: 0,
    variant_a_reply_rate: 0,
    variant_b_reply_rate: 0,
  },
  {
    id: did(603),
    name: 'Brezen 2026 — draft',
    team_id: did(1),
    status: 'draft',
    template_set_id: null,
    template_set_name: null,
    from_email: null,
    send_date_seq1: null,
    send_date_seq2: null,
    send_date_seq3: null,
    send_time_seq1: null,
    send_time_seq2: null,
    send_time_seq3: null,
    created_at: daysAgo(1),
    lead_count: 5,
    sent_count: 0,
    reply_count: 0,
    reply_rate: 0,
    variant_a_leads: 3,
    variant_b_leads: 2,
    variant_a_sent: 0,
    variant_b_sent: 0,
    variant_a_replies: 0,
    variant_b_replies: 0,
    variant_a_reply_rate: 0,
    variant_b_reply_rate: 0,
  },
];

export const DEMO_WAVE_BY_ID = Object.fromEntries(DEMO_WAVES.map(w => [w.id, w]));

// ── Wave detail (for the completed wave) ──

function buildWaveLeads(waveId: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const leadIdx = i % DEMO_LEADS.length;
    const lead = DEMO_LEADS[leadIdx];
    const wlId = did(700 + i);
    const statuses = ['completed', 'replied', 'seq1_sent', 'seq2_sent', 'seq3_sent', 'pending'];
    const status = statuses[i % statuses.length];
    const company = DEMO_COMPANIES[leadIdx];
    const contacts = company.contacts.map(c => ({
      id: c.id,
      full_name: c.full_name,
      first_name: c.first_name,
      last_name: c.last_name,
      salutation: c.salutation,
      email_candidates: (c.email_candidates ?? []).map(ec => ({
        id: ec.id,
        email_address: ec.email_address,
        is_verified: ec.is_verified,
        qev_status: ec.qev_status,
        seznam_status: ec.seznam_status,
      })),
    }));
    return {
      id: wlId,
      wave_id: waveId,
      lead_id: lead.id,
      ab_variant: i % 2 === 0 ? 'A' : 'B',
      status,
      created_at: daysAgo(30),
      leads: {
        id: lead.id,
        company_name: lead.company_name,
        ico: lead.ico,
        website: lead.website,
        domain: lead.domain,
        status: lead.status,
        custom_fields: null,
        company_id: lead.company_id,
        companies: { contacts },
      },
      sent_emails: status !== 'pending' ? [
        { id: did(800 + i * 3), sequence_number: 1, sent_at: daysAgo(28) },
        ...(status !== 'seq1_sent' ? [{ id: did(800 + i * 3 + 1), sequence_number: 2, sent_at: daysAgo(23) }] : []),
        ...(['completed', 'replied', 'seq3_sent'].includes(status) ? [{ id: did(800 + i * 3 + 2), sequence_number: 3, sent_at: daysAgo(18) }] : []),
      ] : [],
      email_queue: status === 'pending' ? [
        { id: did(900 + i), sequence_number: 1, email_address: company.contacts[0]?.email_candidates[0]?.email_address ?? 'test@example.cz', scheduled_at: daysFromNow(3), status: 'queued' },
      ] : [],
      lead_replies: status === 'replied' ? [
        { id: did(950 + i), received_at: daysAgo(16), created_at: daysAgo(16) },
      ] : [],
    };
  });
}

export function getDemoWaveDetail(waveId: string) {
  const wave = DEMO_WAVE_BY_ID[waveId] ?? DEMO_WAVES[0];
  return {
    wave,
    waveLeads: buildWaveLeads(waveId, wave.lead_count),
  };
}

// ── Lead detail ──

export function getDemoLeadDetail(leadId: string) {
  const lead = DEMO_LEAD_BY_ID[leadId] ?? DEMO_LEADS[0];
  const company = DEMO_COMPANIES.find(c => c.id === lead.company_id) ?? DEMO_COMPANIES[0];
  return {
    ...lead,
    team: { id: did(1), name: 'Meisat Outreach', salesman_email: 'jan.novak@meisat.cz', created_at: daysAgo(90) } as const,
    contacts: company.contacts,
    email_candidates: company.email_candidates,
    enrichment_log: [
      { id: did(1001), step: 'ares_lookup', status: 'success', error_message: null, created_at: daysAgo(38) },
      { id: did(1002), step: 'kurzy_scrape', status: 'success', error_message: null, created_at: daysAgo(38) },
      { id: did(1003), step: 'email_generation', status: 'success', error_message: null, created_at: daysAgo(37) },
      { id: did(1004), step: 'seznam_verify', status: 'success', error_message: null, created_at: daysAgo(37) },
    ],
    wave_leads: lead.status === 'in_wave' || lead.status === 'completed' || lead.status === 'replied' ? [{
      id: did(710),
      wave_id: did(601),
      ab_variant: 'A',
      status: lead.status === 'replied' ? 'replied' : lead.status === 'completed' ? 'completed' : 'seq1_sent',
      created_at: daysAgo(10),
      waves: { name: 'Unor 2026 — tech firmy', status: 'sending', is_dummy: false, dummy_email: null },
      sent_emails: [{ id: did(810), sequence_number: 1, email_address: company.contacts[0]?.email_candidates[0]?.email_address ?? '', sent_at: daysAgo(5) }],
      email_queue: [],
    }] : [],
    lead_replies: lead.status === 'replied' ? [{
      id: did(960),
      from_email: company.contacts[0]?.email_candidates[0]?.email_address ?? '',
      subject: 'Re: Spoluprace',
      body_preview: 'Dekuji za nabidku, mame zajem o dalsi informace...',
      received_at: daysAgo(3),
      created_at: daysAgo(3),
    }] : [],
  };
}

// ── Company detail ──

export function getDemoCompanyDetail(companyId: string) {
  const company = DEMO_COMPANY_BY_ID[companyId] ?? DEMO_COMPANIES[0];
  const matchingLeads = DEMO_LEADS.filter(l => l.company_id === company.id);
  return {
    ...company,
    leads: matchingLeads.map(l => ({
      id: l.id,
      company_name: l.company_name,
      status: l.status,
      domain: l.domain,
      created_at: l.created_at,
      wave_leads: [],
    })),
  };
}

// ── Dashboard Stats ──

export const DEMO_DASHBOARD_STATS: DashboardStats = {
  totalLeads: 147,
  enrichedLeads: 132,
  verifiedLeads: 98,
  repliedLeads: 19,
  bouncedLeads: 5,
  sentEmails: 89,
  pendingQueue: 12,
  replyRate: 13.5,
};

// ── Email Volume Chart (14 days) ──

export const DEMO_EMAIL_VOLUME: Record<string, unknown>[] = Array.from({ length: 14 }, (_, i) => {
  const d = daysAgo(13 - i);
  const base = Math.floor(Math.random() * 4) + 2;
  return {
    date: dateOnly(d),
    seq1: i < 5 ? base + 3 : i < 10 ? base + 1 : base,
    seq2: i >= 3 && i < 12 ? Math.max(0, base - 1) : 0,
    seq3: i >= 8 ? Math.max(0, base - 2) : 0,
  };
});
// Make deterministic by overriding random values
DEMO_EMAIL_VOLUME.forEach((row, i) => {
  row.seq1 = [8, 6, 7, 5, 9, 4, 5, 6, 3, 4, 5, 3, 4, 6][i];
  row.seq2 = [0, 0, 0, 6, 5, 4, 3, 5, 4, 3, 4, 2, 0, 0][i];
  row.seq3 = [0, 0, 0, 0, 0, 0, 0, 0, 3, 2, 3, 2, 1, 2][i];
});

// ── Wave Replies (for dashboard chart) ──

export const DEMO_WAVE_REPLIES: WaveAnalytics[] = [DEMO_WAVES[0], DEMO_WAVES[1]];

// ── Active Waves (for dashboard) ──

export const DEMO_ACTIVE_WAVES: WaveAnalytics[] = DEMO_WAVES.filter(w => w.status === 'sending' || w.status === 'scheduled');

// ── Dashboard counts ──

export const DEMO_READY_LEADS_COUNT = 4;
export const DEMO_ACTIVE_WAVES_COUNT = 2;
export const DEMO_RETARGET_READY_COUNT = 4;
export const DEMO_REPLY_COUNT = 19;

// ── Retarget Pool ──

export const DEMO_RETARGET_POOL: RetargetPoolLead[] = DEMO_LEADS
  .filter(l => l.status === 'ready')
  .slice(0, 4)
  .map((l, i) => ({
    lead_id: l.id,
    company_name: l.company_name,
    ico: l.ico,
    domain: l.domain ?? null,
    team_id: did(1),
    last_wave_name: 'Leden 2026 — hlavni',
    last_contacted_at: daysAgo(40 + i),
    retarget_round: 1,
    unlocks_at: daysAgo(10 + i),
    total_waves_count: 1,
  }));

// ── Wave Presets ──

export const DEMO_WAVE_PRESETS: WavePreset[] = [
  {
    id: did(650),
    team_id: did(1),
    name: 'Default CZ Preset',
    template_set_id: did(490),
    from_email: 'jan.novak@meisat.cz',
    salesman_id: did(10),
    created_at: daysAgo(30),
    template_set: { id: did(490), name: 'Hlavni sablona - CZ' },
    salesman: { id: did(10), team_id: did(1), name: 'Jan Novak', email: 'jan.novak@meisat.cz', imap_credential_name: 'Salesman IMAP 1' },
  },
];

// ── Import Groups ──

export const DEMO_IMPORT_GROUPS: ImportGroupStats[] = [
  {
    id: did(670),
    name: 'CSV Import — leden 2026',
    source: 'csv',
    enrichment_level: 'full_pipeline',
    team_id: did(1),
    created_at: daysAgo(45),
    updated_at: daysAgo(40),
    total_leads: 25,
    ready_count: 18,
    backup_count: 3,
    failed_count: 2,
    in_progress_count: 2,
  },
  {
    id: did(671),
    name: 'Google Sheets — unor 2026',
    source: 'gsheet',
    enrichment_level: 'find_emails',
    team_id: did(1),
    created_at: daysAgo(20),
    updated_at: daysAgo(15),
    total_leads: 15,
    ready_count: 10,
    backup_count: 2,
    failed_count: 1,
    in_progress_count: 2,
  },
];

// ── From email suggestions ──

export const DEMO_FROM_EMAILS: string[] = ['jan.novak@meisat.cz', 'petr.horak@meisat.cz'];

// ── Lead Tags (for useLeadTags) ──

export const DEMO_LEAD_TAGS: LeadTag[] = [
  { id: did(420), lead_id: did(300), tag_id: did(21), created_at: daysAgo(20), tag: DEMO_TAGS[1] },
];

// ── Company Tags lookup ──

export function getDemoCompanyTags(companyId: string): CompanyTag[] {
  return DEMO_COMPANY_TAGS.filter(ct => ct.company_id === companyId);
}

// ── Ready leads (for AddLeadsToWavePage) ──

export const DEMO_LEADS_NOT_IN_WAVE = DEMO_LEADS
  .filter(l => ['ready', 'info_email', 'staff_email'].includes(l.status))
  .map(l => ({ id: l.id, company_name: l.company_name, ico: l.ico, website: l.website, language: l.language ?? 'cs', status: l.status }));

// ── Email candidates for a lead ──

export function getDemoEmailCandidates(leadId: string): EmailCandidate[] {
  const lead = DEMO_LEAD_BY_ID[leadId];
  if (!lead) return DEMO_EMAIL_CANDIDATES.slice(0, 2);
  const company = DEMO_COMPANIES.find(c => c.id === lead.company_id);
  return company?.email_candidates ?? [];
}

// ── Ready leads by group ──

export const DEMO_READY_LEADS_BY_GROUP = [
  {
    groupId: did(670),
    groupName: 'CSV Import — leden 2026',
    source: 'csv',
    createdAt: daysAgo(45),
    leads: DEMO_LEADS.filter(l => l.status === 'ready').slice(0, 2),
  },
  {
    groupId: null,
    groupName: 'Bez skupiny',
    source: null,
    createdAt: null,
    leads: DEMO_LEADS.filter(l => l.status === 'ready').slice(2),
  },
];

// ── Onboarding: all complete ──

export const DEMO_ONBOARDING_STATUS = {
  hasTeam: true,
  hasTemplateSet: true,
  hasLeads: true,
  hasWave: true,
};

// ── Teams settings (same as DEMO_TEAM but as array) ──

export const DEMO_TEAMS: Team[] = [DEMO_TEAM];

// ── Failed emails (empty for demo) ──

export const DEMO_FAILED_EMAILS: Array<{
  id: string;
  wave_lead_id: string;
  email_address: string;
  sequence_number: number;
  error_message: string | null;
  retry_count: number;
  status: string;
  scheduled_at: string;
}> = [];

// ── System Health ──

export const DEMO_SYSTEM_HEALTH = {
  queuedEmails: 12,
  sendingEmails: 3,
  failedEmails24h: 1,
  lastSentAt: new Date(Date.now() - 180_000).toISOString(),
  teamSends: [{ name: 'Meisat Outreach', sends_today: 47, daily_send_limit: 200 }],
};

// ── Enrichment Logs ──

export const DEMO_ENRICHMENT_LOGS = [
  { id: did(2001), lead_id: did(300), step: 'ares_lookup', status: 'success', error_message: null, created_at: daysAgo(1), leads: { company_name: 'Marido s.r.o.' } },
  { id: did(2002), lead_id: did(301), step: 'kurzy_scrape', status: 'success', error_message: null, created_at: daysAgo(1), leads: { company_name: 'TechnoServis Praha a.s.' } },
  { id: did(2003), lead_id: did(302), step: 'email_generation', status: 'success', error_message: null, created_at: daysAgo(1), leads: { company_name: 'Stavba Plus s.r.o.' } },
  { id: did(2004), lead_id: did(303), step: 'seznam_verify', status: 'success', error_message: null, created_at: daysAgo(2), leads: { company_name: 'Zeleny Svet s.r.o.' } },
  { id: did(2005), lead_id: did(304), step: 'ares_lookup', status: 'success', error_message: null, created_at: daysAgo(2), leads: { company_name: 'DataSoft Solutions s.r.o.' } },
  { id: did(2006), lead_id: did(305), step: 'kurzy_scrape', status: 'failed', error_message: 'Timeout fetching kurzy.cz page', created_at: daysAgo(3), leads: { company_name: 'Bohemia Transport a.s.' } },
  { id: did(2007), lead_id: did(306), step: 'email_generation', status: 'success', error_message: null, created_at: daysAgo(3), leads: { company_name: 'Pekarna U Mlynare s.r.o.' } },
  { id: did(2008), lead_id: did(307), step: 'seznam_verify', status: 'success', error_message: null, created_at: daysAgo(4), leads: { company_name: 'CityMed s.r.o.' } },
  { id: did(2009), lead_id: did(310), step: 'ares_lookup', status: 'failed', error_message: 'ICO not found in ARES', created_at: daysAgo(5), leads: { company_name: 'Moravska Logistika s.r.o.' } },
  { id: did(2010), lead_id: did(311), step: 'seznam_verify', status: 'success', error_message: null, created_at: daysAgo(5), leads: { company_name: 'EuroTech CZ s.r.o.' } },
];

// ── Sent Email Logs ──

export const DEMO_SENT_EMAIL_LOGS = [
  { id: did(2101), email_address: 'karel.mares@marido.cz', subject: 'Spoluprace s Marido s.r.o.', sequence_number: 1, sent_at: daysAgo(1), wave_leads: { waves: { name: 'Unor 2026 — tech firmy' } } },
  { id: did(2102), email_address: 'pavel.cerny@technoservis.cz', subject: 'Spoluprace s TechnoServis Praha a.s.', sequence_number: 1, sent_at: daysAgo(1), wave_leads: { waves: { name: 'Unor 2026 — tech firmy' } } },
  { id: did(2103), email_address: 'eva.kralova@technoservis.cz', subject: 'Nabidka pro TechnoServis Praha a.s.', sequence_number: 1, sent_at: daysAgo(2), wave_leads: { waves: { name: 'Unor 2026 — tech firmy' } } },
  { id: did(2104), email_address: 'martin.dvorak@stavbaplus.cz', subject: 'Spoluprace s Stavba Plus s.r.o.', sequence_number: 2, sent_at: daysAgo(3), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2105), email_address: 'jana.novotna@zelenysvet.cz', subject: 'Re: Spoluprace s Zeleny Svet s.r.o.', sequence_number: 2, sent_at: daysAgo(4), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2106), email_address: 'tomas.kucera@datasoft.cz', subject: 'Re: Spoluprace s DataSoft Solutions', sequence_number: 3, sent_at: daysAgo(5), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2107), email_address: 'jiri.pokorny@bohemiatransport.cz', subject: 'Spoluprace s Bohemia Transport', sequence_number: 1, sent_at: daysAgo(6), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2108), email_address: 'ondrej.fiala@citymed.cz', subject: 'Nabidka pro CityMed s.r.o.', sequence_number: 2, sent_at: daysAgo(7), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2109), email_address: 'radek.prochazka@prumyslovesystemy.cz', subject: 'Re: Spoluprace', sequence_number: 3, sent_at: daysAgo(8), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2110), email_address: 'petra.kralickova@studiok2.cz', subject: 'Spoluprace s Kreativni Studio K2', sequence_number: 1, sent_at: daysAgo(10), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2111), email_address: 'david.nemec@eurotech.cz', subject: 'Nabidka pro EuroTech CZ', sequence_number: 1, sent_at: daysAgo(12), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
  { id: did(2112), email_address: 'michal.bartos@kvalitest.cz', subject: 'Spoluprace s Kvalitest a.s.', sequence_number: 2, sent_at: daysAgo(13), wave_leads: { waves: { name: 'Leden 2026 — hlavni' } } },
];

// ── Reply Logs ──

export const DEMO_REPLY_LOGS = [
  { id: did(2201), from_email: 'karel.mares@marido.cz', subject: 'Re: Spoluprace s Marido s.r.o.', lead_id: did(300), created_at: daysAgo(1), source: 'matched' as const, leads: { company_name: 'Marido s.r.o.' } },
  { id: did(2202), from_email: 'tomas.kucera@datasoft.cz', subject: 'Re: Spoluprace s DataSoft Solutions', lead_id: did(304), created_at: daysAgo(3), source: 'matched' as const, leads: { company_name: 'DataSoft Solutions s.r.o.' } },
  { id: did(2203), from_email: 'ondrej.fiala@citymed.cz', subject: 'Re: Nabidka pro CityMed', lead_id: did(307), created_at: daysAgo(5), source: 'matched' as const, leads: { company_name: 'CityMed s.r.o.' } },
  { id: did(2204), from_email: 'radek.prochazka@prumyslovesystemy.cz', subject: 'Re: Spoluprace', lead_id: did(308), created_at: daysAgo(7), source: 'matched' as const, leads: { company_name: 'Prumyslove Systemy a.s.' } },
  { id: did(2205), from_email: 'david.nemec@eurotech.cz', subject: 'Re: Nabidka pro EuroTech CZ', lead_id: did(311), created_at: daysAgo(9), source: 'matched' as const, leads: { company_name: 'EuroTech CZ s.r.o.' } },
  { id: did(2206), from_email: 'michal.bartos@kvalitest.cz', subject: 'Dotaz k nabidce', lead_id: did(313), created_at: daysAgo(11), source: 'matched' as const, leads: { company_name: 'Kvalitest a.s.' } },
  { id: did(2207), from_email: 'unknown@firma.cz', subject: 'Out of office', lead_id: null, created_at: daysAgo(2), source: 'unmatched' as const, leads: null },
  { id: did(2208), from_email: 'noreply@mailer.cz', subject: 'Delivery notification', lead_id: null, created_at: daysAgo(6), source: 'unmatched' as const, leads: null },
];

// ── System Events ──

export const DEMO_SYSTEM_EVENTS = [
  { id: did(2301), event_type: 'wave_created', actor_id: did(10), description: 'Vlna "Brezen 2026 — stavebnictvi" vytvorena', details: null, created_at: daysAgo(3), profiles: { full_name: 'Jan Novak' } },
  { id: did(2302), event_type: 'wave_scheduled', actor_id: did(10), description: 'Vlna "Unor 2026 — tech firmy" naplanovana', details: null, created_at: daysAgo(5), profiles: { full_name: 'Jan Novak' } },
  { id: did(2303), event_type: 'lead_imported', actor_id: did(11), description: 'Import 15 leadu z CSV', details: { count: 15, source: 'csv' }, created_at: daysAgo(7), profiles: { full_name: 'Petr Horak' } },
  { id: did(2304), event_type: 'wave_completed', actor_id: null, description: 'Vlna "Leden 2026 — hlavni" dokoncena (25 leadu, 16.7% reply rate)', details: null, created_at: daysAgo(15), profiles: null },
  { id: did(2305), event_type: 'user_login', actor_id: did(10), description: 'Prihlaseni uzivatele', details: null, created_at: daysAgo(0), profiles: { full_name: 'Jan Novak' } },
  { id: did(2306), event_type: 'lead_imported', actor_id: did(10), description: 'Import 10 leadu z Google Sheets', details: { count: 10, source: 'gsheet' }, created_at: daysAgo(20), profiles: { full_name: 'Jan Novak' } },
];

// ── Workflow Stats ──

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

export const DEMO_WORKFLOW_STATS = {
  timeSeries: Array.from({ length: 24 }, (_, i) => ({
    bucket: hoursAgo(23 - i),
    success: [12, 10, 8, 9, 11, 13, 10, 8, 14, 15, 12, 11, 9, 10, 13, 14, 11, 10, 12, 8, 9, 11, 13, 10][i],
    failure: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][i],
  })),
  workflows: [
    { name: 'WF1 — Lead Ingest', totalRuns: 45, successCount: 45, failureCount: 0, successRate: 100, avgDurationMs: 2100, lastFailure: null },
    { name: 'WF2 — ARES Lookup', totalRuns: 42, successCount: 41, failureCount: 1, successRate: 97.6, avgDurationMs: 3400, lastFailure: daysAgo(3) },
    { name: 'WF3 — Kurzy Scrape', totalRuns: 38, successCount: 37, failureCount: 1, successRate: 97.4, avgDurationMs: 5200, lastFailure: daysAgo(3) },
    { name: 'WF4 — Email Gen', totalRuns: 35, successCount: 35, failureCount: 0, successRate: 100, avgDurationMs: 1800, lastFailure: null },
    { name: 'WF5 — Seznam Verify', totalRuns: 32, successCount: 31, failureCount: 1, successRate: 96.9, avgDurationMs: 8200, lastFailure: daysAgo(1) },
    { name: 'WF8 — Send Cron', totalRuns: 1440, successCount: 1438, failureCount: 2, successRate: 99.9, avgDurationMs: 1200, lastFailure: daysAgo(5) },
    { name: 'WF9 — Reply Detection', totalRuns: 1440, successCount: 1440, failureCount: 0, successRate: 100, avgDurationMs: 900, lastFailure: null },
    { name: 'WF11 — Website Scraper', totalRuns: 28, successCount: 27, failureCount: 1, successRate: 96.4, avgDurationMs: 6500, lastFailure: daysAgo(4) },
  ],
  recentFailures: [
    { workflowName: 'WF5 — Seznam Verify', error: 'SMTP connection timeout after 30s', timestamp: daysAgo(1) },
  ],
};
