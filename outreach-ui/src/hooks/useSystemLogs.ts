import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EnrichmentLog, SystemEvent } from '@/types/database';
import { useDemoMode } from '@/contexts/DemoModeContext';
import {
  DEMO_ENRICHMENT_LOGS,
  DEMO_SENT_EMAIL_LOGS,
  DEMO_REPLY_LOGS,
  DEMO_SYSTEM_EVENTS,
} from '@/lib/demo-data';

const PAGE_SIZE = 50;

// ── Enrichment Log Row (with joined leads) ──
export interface EnrichmentLogRow extends EnrichmentLog {
  leads?: { company_name: string | null } | null;
}

// ── Enrichment Logs ──
export function useEnrichmentLogs(page = 0, statusFilter?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery<EnrichmentLogRow[]>({
    queryKey: ['system-logs', 'enrichment', page, statusFilter],
    queryFn: async () => {
      if (isDemoMode) return DEMO_ENRICHMENT_LOGS as unknown as EnrichmentLogRow[];
      let q = supabase
        .from('enrichment_log')
        .select('*, leads(company_name)')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as EnrichmentLogRow[];
    },
  });
}

// ── Email Send History ──
export interface SentEmailLog {
  id: string;
  email_address: string;
  subject: string | null;
  sequence_number: number;
  sent_at: string;
  wave_leads?: { waves?: { name: string } } | null;
}

export function useEmailSendLogs(page = 0) {
  const { isDemoMode } = useDemoMode();
  return useQuery<SentEmailLog[]>({
    queryKey: ['system-logs', 'emails', page],
    queryFn: async () => {
      if (isDemoMode) return DEMO_SENT_EMAIL_LOGS as SentEmailLog[];
      const { data, error } = await supabase
        .from('sent_emails')
        .select('id, email_address, subject, sequence_number, sent_at, wave_leads(waves(name))')
        .order('sent_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as SentEmailLog[];
    },
  });
}

// ── Reply Detection Log ──
export interface ReplyLog {
  id: string;
  from_email: string | null;
  subject: string | null;
  lead_id: string | null;
  created_at: string;
  source: 'matched' | 'processed' | 'unmatched';
  leads?: { company_name: string | null } | null;
}

export function useReplyLogs(page = 0) {
  const { isDemoMode } = useDemoMode();
  return useQuery<ReplyLog[]>({
    queryKey: ['system-logs', 'replies', page],
    queryFn: async () => {
      if (isDemoMode) return DEMO_REPLY_LOGS as ReplyLog[];
      // Fetch from lead_replies (matched), processed_reply_emails, and unmatched_replies
      const [matchedRes, unmatchedRes] = await Promise.all([
        supabase
          .from('lead_replies')
          .select('id, from_email, subject, lead_id, created_at, leads(company_name)')
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
        supabase
          .from('unmatched_replies')
          .select('id, from_email, subject, created_at')
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE),
      ]);

      const matched: ReplyLog[] = (matchedRes.data ?? []).map(r => ({
        ...(r as unknown as Omit<ReplyLog, 'source'>),
        source: 'matched' as const,
      }));

      const unmatched: ReplyLog[] = (unmatchedRes.data ?? []).map(r => ({
        ...(r as unknown as Omit<ReplyLog, 'source' | 'lead_id'>),
        lead_id: null,
        source: 'unmatched' as const,
      }));

      // Merge and sort by date
      return [...matched, ...unmatched]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, PAGE_SIZE);
    },
  });
}

// ── System Events ──
export function useSystemEvents(page = 0, typeFilter?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery<SystemEvent[]>({
    queryKey: ['system-logs', 'events', page, typeFilter],
    queryFn: async () => {
      if (isDemoMode) return DEMO_SYSTEM_EVENTS as unknown as SystemEvent[];
      let q = supabase
        .from('system_events')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (typeFilter) q = q.eq('event_type', typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SystemEvent[];
    },
  });
}
