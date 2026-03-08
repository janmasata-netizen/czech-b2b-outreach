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
export type WaveLeadStatus = 'pending' | 'seq1_sent' | 'seq2_sent' | 'seq3_sent' | 'completed' | 'replied' | 'failed';
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
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface OutreachAccount {
  id: string;
  team_id: string;
  email_address: string;
  display_name?: string | null;
  smtp_credential_name: string | null;
  daily_send_limit?: number | null;
  sends_today?: number;
  is_active?: boolean;
  created_at?: string;
  teams?: { name: string };
}

export interface Lead {
  id: string;
  company_name: string | null;
  website: string | null;
  domain?: string | null;
  ico: string | null;
  team_id: string | null;
  status: LeadStatus;
  lead_type?: 'company' | 'contact';
  contact_name?: string | null;
  enrichment_error?: string | null;
  master_status?: MasterStatus;
  custom_fields?: Record<string, string> | null;
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
  team?: Team;
  jednatels?: Jednatel[];
  email_candidates?: EmailCandidate[];
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
  template_set_id?: string | null;
  name: string | null;
  status: WaveStatus;
  is_dummy?: boolean;
  dummy_email?: string | null;
  send_date_seq1?: string | null;
  send_date_seq2?: string | null;
  send_date_seq3?: string | null;
  delay_seq1_to_seq2_days?: number;
  delay_seq2_to_seq3_days?: number;
  send_window_start?: string;
  send_window_end?: string;
  send_time_seq1?: string;
  send_time_seq2?: string;
  send_time_seq3?: string;
  source_wave_id?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
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
  send_date_seq1: string | null;
  send_date_seq2: string | null;
  send_date_seq3: string | null;
  send_time_seq1: string | null;
  send_time_seq2: string | null;
  send_time_seq3: string | null;
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
  jednatels: { id: string; full_name: string | null; salutation: string | null }[] | null;
}
