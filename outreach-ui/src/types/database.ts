export type LeadLanguage = 'cs' | 'en' | 'de';

export type MasterStatus = 'active' | 'blacklisted' | 'archived';

export type LeadStatus =
  | 'new'
  | 'enriching'
  | 'enriched'
  | 'email_discovery'
  | 'email_verified'
  | 'ready'
  | 'failed'
  | 'needs_review'
  | 'replied'
  | 'in_wave'
  | 'bounced'
  | 'completed'
  | 'problematic'
  | 'info_email'
  | 'staff_email';

export type WaveStatus = 'draft' | 'verifying' | 'verified' | 'scheduled' | 'sending' | 'done' | 'completed' | 'paused';
export type WaveLeadStatus = 'pending' | 'seq1_sent' | 'seq2_sent' | 'seq3_sent' | 'completed' | 'replied' | 'failed' | `seq${number}_sent`;

export interface SequenceScheduleEntry {
  seq: number;
  send_date: string | null;
  send_date_end?: string | null;
  send_time: string | null;
}
export type EmailQueueStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'pending_prev';
export type EnrichmentStepStatus = 'started' | 'success' | 'failed';
export type SeznamStatus = 'pending' | 'sent' | 'bounced' | 'likely_valid';
export type QevStatus = 'valid' | 'invalid' | 'unknown' | 'catch_all' | 'manually_verified';
export type ABVariant = 'A' | 'B';

export interface Team {
  id: string;
  name: string;
  salesman_email: string | null;
  salesman_email_app_password?: string | null;
  daily_send_limit?: number;
  sends_today?: number;
  is_active?: boolean;
  retarget_lockout_days?: number;
  created_at: string;
  updated_at?: string;
}

export interface Company {
  id: string;
  company_name: string | null;
  ico: string | null;
  website: string | null;
  domain: string | null;
  master_status: MasterStatus;
  team_id: string | null;
  created_at: string;
  updated_at: string;
  contacts?: Contact[];
  company_tags?: CompanyTag[];
  tags?: Array<{ id: string; name: string; color: string }>;
  leads?: Lead[];
}

export interface Contact {
  id: string;
  company_id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  salutation?: string | null;
  role?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  other_contact?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  email_candidates?: EmailCandidate[];
}

export interface CompanyTag {
  id: string;
  company_id: string;
  tag_id: string;
  created_at: string;
  tag?: Tag;
}

export interface CompanyFilters {
  search?: string;
  master_status?: MasterStatus;
  tag_ids?: string[];
  team_id?: string;
}

export interface ImportGroup {
  id: string;
  name: string;
  source: 'csv' | 'gsheet';
  enrichment_level: 'import_only' | 'find_emails' | 'full_pipeline';
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportGroupStats extends ImportGroup {
  total_leads: number;
  ready_count: number;
  backup_count: number;
  failed_count: number;
  in_progress_count: number;
}

export interface Lead {
  id: string;
  company_name: string | null;
  website: string | null;
  domain?: string | null;
  ico: string | null;
  team_id: string | null;
  company_id?: string | null;
  import_group_id?: string | null;
  status: LeadStatus;
  lead_type?: 'company' | 'contact';
  contact_name?: string | null;
  enrichment_error?: string | null;
  master_status?: MasterStatus;
  language?: LeadLanguage;
  custom_fields?: Record<string, string> | null;
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
  team?: Team;
  company?: Company;
  contacts?: Contact[];
  jednatels?: Jednatel[];
  email_candidates?: EmailCandidate[];
  wave_leads?: WaveLead[];
  lead_replies?: LeadReply[];
  enrichment_log?: EnrichmentLog[];
}

export interface EnrichmentLog {
  id: string;
  lead_id: string;
  step: string;
  status: string;
  error_message: string | null;
  details?: Record<string, unknown> | null;
  completed_at?: string | null;
  created_at: string;
}

/** @deprecated Use Contact instead */
export interface Jednatel {
  id: string;
  lead_id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  salutation?: string | null;
  role?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  other_contact?: string | null;
  created_at?: string;
  email_candidates?: EmailCandidate[];
}

export interface EmailCandidate {
  id: string;
  jednatel_id?: string;
  contact_id?: string;
  lead_id?: string;
  email_address: string;
  is_primary?: boolean;
  seznam_status?: SeznamStatus;
  seznam_checked_at?: string | null;
  qev_status?: QevStatus | null;
  qev_checked_at?: string | null;
  is_verified?: boolean;
  is_catch_all?: boolean;
  catch_all_confidence?: string | null;
  verification_status?: string | null;
  type?: 'jednatel' | 'staff' | 'staff_decision_maker' | 'generic' | null;
  confidence?: 'direct_hit' | 'name_match' | 'pattern_match' | 'combo' | 'unknown_person' | null;
  source?: 'website_scrape' | 'combo_generation' | 'smtp_verify' | null;
  created_at?: string;
}

export interface TemplateVariable {
  name: string;   // variable key, used as {{name}} in templates
  label: string;  // Czech display label for UI
  description?: string; // Czech explanation of what the variable resolves to
}

export interface TemplateSet {
  id: string;
  name: string;
  description?: string | null;
  team_id?: string | null;
  variables?: TemplateVariable[];
  created_at?: string;
  email_templates?: EmailTemplate[];
}

export interface EmailTemplate {
  id: string;
  template_set_id: string;
  sequence_number: number;
  variant: ABVariant;       // actual DB column name
  ab_variant?: ABVariant;   // alias, may not be returned by DB
  subject: string | null;
  body_html: string | null;
  created_at?: string;
}

export interface Salesman {
  id: string;
  team_id: string;
  name: string;
  email: string;
  imap_credential_name: string;
  is_active?: boolean;
  created_at?: string;
  team?: { name: string };
}

export interface Wave {
  id: string;
  team_id?: string | null;
  salesman_id?: string | null;
  outreach_account_id?: string | null;
  from_email?: string | null;
  template_set_id?: string | null;
  name: string | null;
  status: WaveStatus;
  is_dummy?: boolean;
  dummy_email?: string | null;
  send_date_seq1?: string | null;
  send_date_seq2?: string | null;
  send_date_seq3?: string | null;
  daily_lead_count?: number | null;
  delay_seq1_to_seq2_days?: number;
  delay_seq2_to_seq3_days?: number;
  send_window_start?: string;
  send_window_end?: string;
  send_time_seq1?: string;
  send_time_seq2?: string;
  send_time_seq3?: string;
  sequence_schedule?: SequenceScheduleEntry[] | null;
  source_wave_id?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  scheduling_report?: {
    queued: number;
    skipped: number;
    skipped_leads: Array<{ lead_id: string; company_name: string; reason: string }>;
  } | null;
  team?: Team;
  salesman?: Salesman;
  template_set?: TemplateSet;
}

export interface WaveLead {
  id: string;
  wave_id: string;
  lead_id: string;
  jednatel_id?: string | null;
  status: WaveLeadStatus;
  ab_variant: ABVariant | null;
  retarget_round?: number;
  outreach_account_id?: string | null;
  created_at?: string;
  updated_at?: string;
  lead?: Lead;
  jednatel?: Jednatel;
}

export interface EmailQueue {
  id: string;
  wave_lead_id: string;
  jednatel_id?: string | null;
  email_address: string;
  sequence_number: number;
  outreach_account_id?: string | null;
  smtp_message_id_ref?: string | null;
  subject_rendered?: string | null;
  body_rendered?: string | null;
  scheduled_at: string;
  status: EmailQueueStatus;
  retry_count?: number;
  error_message?: string | null;
  sent_at?: string | null;
  created_at?: string;
}

export interface SentEmail {
  id: string;
  queue_id?: string | null;
  wave_lead_id?: string | null;
  jednatel_id?: string | null;
  email_address: string;
  sequence_number: number;
  outreach_account_id?: string | null;
  smtp_message_id?: string | null;
  subject?: string | null;
  sent_at: string;
  created_at?: string;
}

export interface LeadReply {
  id: string;
  lead_id?: string | null;
  wave_lead_id?: string | null;
  salesman_id?: string | null;
  from_email?: string | null;
  subject?: string | null;
  body_preview?: string | null;
  received_at?: string | null;
  replied_at?: string;
  created_at?: string;
}

export interface WaveAnalytics {
  id: string;
  name: string;
  team_id: string | null;
  status: WaveStatus;
  template_set_id: string | null;
  template_set_name: string | null;
  salesman_id?: string | null;
  outreach_account_id?: string | null;
  from_email?: string | null;
  is_dummy?: boolean;
  dummy_email?: string | null;
  source_wave_id?: string | null;
  completed_at?: string | null;
  send_date_seq1: string | null;
  send_date_seq2: string | null;
  send_date_seq3: string | null;
  send_time_seq1: string | null;
  send_time_seq2: string | null;
  send_time_seq3: string | null;
  daily_lead_count?: number | null;
  delay_seq1_to_seq2_days?: number;
  delay_seq2_to_seq3_days?: number;
  send_window_start?: string;
  send_window_end?: string;
  sequence_schedule?: SequenceScheduleEntry[] | null;
  created_at: string;
  updated_at?: string;
  lead_count: number;
  sent_count: number;
  reply_count: number;
  reply_rate: number;
  variant_a_leads: number;
  variant_b_leads: number;
  variant_a_sent: number;
  variant_b_sent: number;
  variant_a_replies: number;
  variant_b_replies: number;
  variant_a_reply_rate: number;
  variant_b_reply_rate: number;
  scheduling_report?: {
    queued: number;
    skipped: number;
    skipped_leads: Array<{ lead_id: string; company_name: string; reason: string }>;
  } | null;
}

export interface Profile {
  id: string;
  team_id: string | null;
  full_name: string | null;
  is_admin: boolean;
  created_at?: string;
  team?: Team;
}

export interface ConfigEntry {
  key: string;
  value: string;
}

export interface LeadFilters {
  search?: string;
  status?: LeadStatus;
  statuses?: LeadStatus[];
  team_id?: string;
  lead_type?: 'company' | 'contact';
  language?: LeadLanguage;
}

export interface DashboardStats {
  totalLeads: number;
  enrichedLeads: number;
  verifiedLeads: number;
  repliedLeads: number;
  bouncedLeads: number;
  sentEmails: number;
  pendingQueue: number;
  replyRate: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  team_id: string | null;
  created_at: string;
}

export interface LeadTag {
  id: string;
  lead_id: string;
  tag_id: string;
  created_at: string;
  tag?: Tag;
}

export interface MasterLeadFilters {
  search?: string;
  master_status?: MasterStatus;
  tag_ids?: string[];
  team_id?: string;
}

export interface WaveLeadRow extends WaveLead {
  leads?: Lead & { companies?: { contacts: (Contact & { email_candidates?: EmailCandidate[] })[] } | null; jednatels?: (Jednatel & { email_candidates?: EmailCandidate[] })[] };
  sent_emails?: SentEmail[];
  lead_replies?: LeadReply[];
  email_queue?: EmailQueue[];
  waves?: { name: string; status: string };
}

export interface RetargetHistoryEntry {
  id: string;
  wave_id: string;
  status: WaveLeadStatus;
  retarget_round?: number;
  ab_variant: ABVariant | null;
  created_at?: string;
  updated_at?: string;
  waves?: { id: string; name: string; status: string; completed_at: string | null; created_at: string } | null;
  sent_emails?: { id: string; sequence_number: number; sent_at: string; subject?: string | null }[];
}

export interface WavePreset {
  id: string;
  team_id: string;
  name: string;
  template_set_id: string | null;
  from_email: string | null;
  salesman_id: string | null;
  created_at?: string;
  updated_at?: string;
  template_set?: TemplateSet;
  salesman?: Salesman;
}

// ── Bug Reports ──
export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugReportCategory = 'ui' | 'emails' | 'enrichment' | 'waves' | 'system' | 'other';
export type BugReportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface BugReportNote {
  id: string;
  bug_report_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null };
}

export interface BugReportTag {
  id: string;
  bug_report_id: string;
  tag_id: string;
  created_at: string;
  tags?: { id: string; name: string; color: string };
}

export interface BugReport {
  id: string;
  title: string;
  description: string;
  severity: BugReportSeverity;
  category: BugReportCategory;
  screenshot_url: string | null;
  reporter_id: string;
  status: BugReportStatus;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null };
  bug_report_notes?: BugReportNote[];
  bug_report_tags?: BugReportTag[];
}

// ── System Events ──
export interface SystemEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  description: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles?: { full_name: string | null };
}

export interface RetargetPoolLead {
  lead_id: string;
  company_name: string | null;
  ico: string | null;
  domain: string | null;
  team_id: string | null;
  last_wave_name: string | null;
  last_contacted_at: string;
  retarget_round: number;
  unlocks_at: string;
  total_waves_count: number;
  contacts?: { id: string; full_name: string | null; salutation: string | null }[] | null;
  jednatels?: { id: string; full_name: string | null; salutation: string | null }[] | null;
}
