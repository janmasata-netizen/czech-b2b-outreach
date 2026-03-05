import type { LeadStatus, WaveStatus, WaveLeadStatus, EmailQueueStatus } from '@/types/database';

// ================================================================
// STATUS MAPS — Czech labels + colors
// ================================================================

export const LEAD_STATUS_MAP: Record<LeadStatus, { label: string; color: string }> = {
  new:             { label: 'nový',           color: 'accent'  },
  enriching:       { label: 'obohacuje se',   color: 'orange'  },
  enriched:        { label: 'obohacen',       color: 'orange'  },
  email_discovery: { label: 'hledání emailu', color: 'yellow'  },
  email_verified:  { label: 'email ověřen',   color: 'green'   },
  ready:           { label: 'připraven',      color: 'green'   },
  in_wave:         { label: 've vlně',        color: 'purple'  },
  completed:       { label: 'dokončeno',      color: 'green'   },
  replied:         { label: 'odpovězeno',     color: 'cyan'    },
  bounced:         { label: 'bounce',         color: 'red'     },
  failed:          { label: 'selhalo',        color: 'red'     },
  needs_review:    { label: 'čeká na kontrolu', color: 'orange' },
  problematic:     { label: 'problémový',     color: 'red'     },
  info_email:      { label: 'info email',     color: 'cyan'    },
  staff_email:     { label: 'staff email',    color: 'purple'  },
};

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_MAP) as LeadStatus[];

export const WAVE_STATUS_MAP: Record<WaveStatus, { label: string; color: string }> = {
  draft:     { label: 'koncept',     color: 'muted'   },
  verifying: { label: 'ověřování',   color: 'yellow'  },
  verified:  { label: 'ověřeno',     color: 'cyan'    },
  scheduled: { label: 'naplánováno', color: 'accent'  },
  sending:   { label: 'odesílá se',  color: 'orange'  },
  done:      { label: 'hotovo',      color: 'green'   },
  completed: { label: 'dokončeno',   color: 'green'   },
  paused:    { label: 'pozastaveno', color: 'yellow'  },
};

export const WAVE_LEAD_STATUS_MAP: Record<WaveLeadStatus, { label: string; color: string }> = {
  pending:   { label: 'čeká',         color: 'muted'  },
  seq1_sent: { label: 'seq. 1 odesláno', color: 'accent' },
  seq2_sent: { label: 'seq. 2 odesláno', color: 'accent' },
  seq3_sent: { label: 'seq. 3 odesláno', color: 'purple' },
  completed: { label: 'dokončeno',    color: 'green'  },
  replied:   { label: 'odpovězeno',   color: 'cyan'   },
  failed:    { label: 'selhalo',      color: 'red'    },
};

export const QUEUE_STATUS_MAP: Record<EmailQueueStatus, { label: string; color: string }> = {
  queued:    { label: 've frontě',   color: 'accent'  },
  sending:   { label: 'odesílá se', color: 'orange'  },
  sent:      { label: 'odesláno',   color: 'green'   },
  failed:    { label: 'selhalo',    color: 'red'     },
  cancelled:    { label: 'zrušeno',      color: 'muted'   },
  pending_prev: { label: 'čeká na předchozí', color: 'muted' },
};

// ================================================================
// STATUS COLOR → CSS vars
// ================================================================
export const STATUS_COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  accent: { bg: 'rgba(62,207,142,0.1)',  border: 'rgba(62,207,142,0.25)',  text: '#3ECF8E' },
  green:  { bg: 'rgba(62,207,142,0.1)',  border: 'rgba(62,207,142,0.25)',  text: '#3ECF8E' },
  orange: { bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.25)',  text: '#fb923c' },
  red:    { bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', text: '#f87171' },
  purple: { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)', text: '#a78bfa' },
  cyan:   { bg: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.25)',  text: '#22d3ee' },
  yellow: { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)',  text: '#fbbf24' },
  muted:  { bg: 'rgba(82,82,91,0.15)',   border: 'rgba(82,82,91,0.3)',     text: '#71717a' },
};

// ================================================================
// ENRICHMENT STEP LABELS (Czech)
// ================================================================
export const ENRICHMENT_STEP_LABELS: Record<string, string> = {
  ares_lookup:      'Vyhledání v ARES',
  ares:             'Vyhledání v ARES',
  kurzy_scrape:     'Načtení jednatele (kurzy.cz)',
  kurzy:            'Načtení jednatele (kurzy.cz)',
  email_generation: 'Generování e-mailů',
  email_gen:        'Generování e-mailů',
  seznam_verify:    'Ověření přes Seznam.cz',
  seznam:           'Ověření přes Seznam.cz',
  qev_verify:       'QuickEmailVerification',
  qev:              'QuickEmailVerification',
  website_fallback: 'Záchranný web scraping',
};

// ================================================================
// NAV ITEMS
// ================================================================
export const NAV_ITEMS = [
  { to: '/prehled',   label: 'Přehled',   icon: 'BarChart3' },
  { to: '/leady',     label: 'Leady',     icon: 'Users'     },
  { to: '/vlny',      label: 'Vlny',      icon: 'Send'      },
  { to: '/nastaveni', label: 'Nastavení', icon: 'Settings'  },
];

// ================================================================
// PIPELINE FUNNEL STEPS
// ================================================================
export const PIPELINE_STEPS = [
  { key: 'new',             label: 'Nové leady',        color: '#6c8cff' },
  { key: 'enriched',        label: 'IČO nalezeno',       color: '#6c8cff' },
  { key: 'has_jednatel',    label: 'Jednatel nalezen',   color: '#a78bfa' },
  { key: 'ready',           label: 'Email ověřen',       color: '#4ade80' },
  { key: 'replied',         label: 'Odpovědi',           color: '#22d3ee' },
];

// ================================================================
// PAGE SIZE
// ================================================================
export const PAGE_SIZE = 20;
