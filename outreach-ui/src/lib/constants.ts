import type { LeadStatus, WaveStatus, WaveLeadStatus, EmailQueueStatus } from '@/types/database';

// ================================================================
// STATUS MAPS — Czech labels + colors
// ================================================================

export const LEAD_STATUS_MAP: Record<LeadStatus, { label: string; color: string }> = {
  new:             { label: 'status.lead.new',           color: 'accent'  },
  enriching:       { label: 'status.lead.enriching',     color: 'orange'  },
  enriched:        { label: 'status.lead.enriched',      color: 'orange'  },
  email_discovery: { label: 'status.lead.email_discovery', color: 'yellow'  },
  email_verified:  { label: 'status.lead.email_verified', color: 'green'   },
  ready:           { label: 'status.lead.ready',         color: 'green'   },
  in_wave:         { label: 'status.lead.in_wave',       color: 'purple'  },
  completed:       { label: 'status.lead.completed',     color: 'green'   },
  replied:         { label: 'status.lead.replied',       color: 'cyan'    },
  bounced:         { label: 'status.lead.bounced',       color: 'red'     },
  failed:          { label: 'status.lead.failed',        color: 'red'     },
  needs_review:    { label: 'status.lead.needs_review',  color: 'orange'  },
  problematic:     { label: 'status.lead.problematic',   color: 'red'     },
  info_email:      { label: 'status.lead.info_email',    color: 'cyan'    },
  staff_email:     { label: 'status.lead.staff_email',   color: 'purple'  },
};

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_MAP) as LeadStatus[];

export const WAVE_STATUS_MAP: Record<WaveStatus, { label: string; color: string }> = {
  draft:     { label: 'status.wave.draft',     color: 'muted'   },
  verifying: { label: 'status.wave.verifying', color: 'yellow'  },
  verified:  { label: 'status.wave.verified',  color: 'cyan'    },
  scheduled: { label: 'status.wave.scheduled', color: 'accent'  },
  sending:   { label: 'status.wave.sending',   color: 'orange'  },
  done:      { label: 'status.wave.done',      color: 'green'   },
  completed: { label: 'status.wave.completed', color: 'green'   },
  paused:    { label: 'status.wave.paused',    color: 'yellow'  },
};

export const WAVE_LEAD_STATUS_MAP: Record<WaveLeadStatus, { label: string; color: string }> = {
  pending:   { label: 'status.waveLead.pending',   color: 'muted'  },
  seq1_sent: { label: 'status.waveLead.seq1_sent', color: 'accent' },
  seq2_sent: { label: 'status.waveLead.seq2_sent', color: 'accent' },
  seq3_sent: { label: 'status.waveLead.seq3_sent', color: 'purple' },
  completed: { label: 'status.waveLead.completed', color: 'green'  },
  replied:   { label: 'status.waveLead.replied',   color: 'cyan'   },
  failed:    { label: 'status.waveLead.failed',    color: 'red'    },
};

export const QUEUE_STATUS_MAP: Record<EmailQueueStatus, { label: string; color: string }> = {
  queued:       { label: 'status.queue.queued',       color: 'accent'  },
  sending:      { label: 'status.queue.sending',      color: 'orange'  },
  sent:         { label: 'status.queue.sent',         color: 'green'   },
  failed:       { label: 'status.queue.failed',       color: 'red'     },
  cancelled:    { label: 'status.queue.cancelled',    color: 'muted'   },
  pending_prev: { label: 'status.queue.pending_prev', color: 'muted'   },
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
  ares_lookup:      'enrichment.ares_lookup',
  ares:             'enrichment.ares',
  kurzy_scrape:     'enrichment.kurzy_scrape',
  kurzy:            'enrichment.kurzy',
  email_generation: 'enrichment.email_generation',
  email_gen:        'enrichment.email_gen',
  seznam_verify:    'enrichment.seznam_verify',
  seznam:           'enrichment.seznam',
  qev_verify:       'enrichment.qev_verify',
  qev:              'enrichment.qev',
  website_fallback: 'enrichment.website_fallback',
};

// ================================================================
// NAV ITEMS
// ================================================================
export const NAV_ITEMS = [
  { to: '/prehled',   label: 'nav.dashboard', icon: 'BarChart3' },
  { to: '/leady',     label: 'nav.leads',     icon: 'Users'     },
  { to: '/vlny',      label: 'nav.waves',     icon: 'Send'      },
  { to: '/nastaveni', label: 'nav.settings',  icon: 'Settings'  },
];

// ================================================================
// PIPELINE FUNNEL STEPS
// ================================================================
export const PIPELINE_STEPS = [
  { key: 'new',             label: 'pipeline.newLeads',      color: '#6c8cff' },
  { key: 'enriched',        label: 'pipeline.icoFound',      color: '#6c8cff' },
  { key: 'has_jednatel',    label: 'pipeline.jednatelFound',  color: '#a78bfa' },
  { key: 'ready',           label: 'pipeline.emailVerified',  color: '#4ade80' },
  { key: 'replied',         label: 'pipeline.replies',        color: '#22d3ee' },
];

// ================================================================
// EMAIL STATUS STYLES
// ================================================================
export const EMAIL_STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  valid:             { color: '#3ecf8e', bg: 'rgba(62,207,142,0.12)', label: 'valid' },
  manually_verified: { color: '#3ecf8e', bg: 'rgba(62,207,142,0.12)', label: 'verified' },
  likely_valid:      { color: '#f0b429', bg: 'rgba(240,180,41,0.12)',  label: 'likely valid' },
  bounced:           { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'bounced' },
  invalid:           { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'invalid' },
  pending:           { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: 'pending' },
  unknown:           { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: 'unknown' },
  info_email:        { color: '#22d3ee', bg: 'rgba(34,211,238,0.12)',  label: 'info email' },
};

// ================================================================
// LEAD LANGUAGE MAP
// ================================================================
export const LEAD_LANGUAGE_MAP: Record<string, string> = {
  cs: 'Čeština',
  en: 'English',
  de: 'Deutsch',
};

// ================================================================
// PAGE SIZE
// ================================================================
export const PAGE_SIZE = 20;

// ================================================================
// SYSTEM TAGS — protected from deletion
// ================================================================
export const SYSTEM_TAG_NAMES = ['blacklist', 'email outreach', 'dopis', 'legacy', 'vip'];

export function isSystemTag(tagName: string): boolean {
  return SYSTEM_TAG_NAMES.includes(tagName.toLowerCase());
}
