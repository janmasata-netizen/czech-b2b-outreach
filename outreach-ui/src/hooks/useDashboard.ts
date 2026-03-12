import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DashboardStats, WaveAnalytics } from '@/types/database';

export function useDashboardStats(days = 0) {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', days],
    queryFn: async () => {
      if (days === 0) {
        // All-time stats via RPC
        const { data, error } = await supabase.rpc('get_dashboard_stats');
        if (error) throw error;
        const s = data as Record<string, number>;
        return {
          totalLeads: s.totalLeads ?? 0,
          enrichedLeads: s.enrichedLeads ?? 0,
          verifiedLeads: s.verifiedLeads ?? 0,
          repliedLeads: s.repliedLeads ?? 0,
          bouncedLeads: s.bouncedLeads ?? 0,
          sentEmails: s.sentEmails ?? 0,
          pendingQueue: s.pendingQueue ?? 0,
          replyRate: s.sentEmails > 0 ? (s.replyCount / s.sentEmails) * 100 : 0,
        };
      }

      // Time-filtered stats via direct queries
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const [leadsRes, sentRes, repliesRes, bouncedRes, queueRes] = await Promise.all([
        supabase.from('leads').select('id, status', { count: 'exact', head: false }).gte('created_at', since),
        supabase.from('sent_emails').select('id', { count: 'exact', head: true }).gte('sent_at', since),
        supabase.from('lead_replies').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'bounced').gte('updated_at', since),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).in('status', ['queued', 'sending']),
      ]);

      const leads = leadsRes.data ?? [];
      const totalLeads = leads.length;
      const enrichedLeads = leads.filter(l => !['new', 'enriching'].includes(l.status)).length;
      const verifiedLeads = leads.filter(l => ['ready', 'in_wave', 'completed', 'replied'].includes(l.status)).length;
      const sentEmails = sentRes.count ?? 0;
      const repliedLeads = repliesRes.count ?? 0;

      return {
        totalLeads,
        enrichedLeads,
        verifiedLeads,
        repliedLeads,
        bouncedLeads: bouncedRes.count ?? 0,
        sentEmails,
        pendingQueue: queueRes.count ?? 0,
        replyRate: sentEmails > 0 ? (repliedLeads / sentEmails) * 100 : 0,
      };
    },
  });
}

export function useEmailVolumeChart(days = 14) {
  return useQuery({
    queryKey: ['dashboard', 'volume', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      let query = supabase
        .from('sent_emails')
        .select('sent_at, sequence_number')
        .order('sent_at');
      if (days > 0) {
        query = query.gte('sent_at', since);
      }
      const { data } = await query;

      const buckets: Record<string, { seq1: number; seq2: number; seq3: number }> = {};
      (data ?? []).forEach(row => {
        const d = row.sent_at?.slice(0, 10) ?? '';
        if (!buckets[d]) buckets[d] = { seq1: 0, seq2: 0, seq3: 0 };
        const k = `seq${row.sequence_number ?? 1}` as 'seq1' | 'seq2' | 'seq3';
        buckets[d][k] = (buckets[d][k] ?? 0) + 1;
      });

      return Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts }));
    },
  });
}

export function useWaveReplies() {
  return useQuery<WaveAnalytics[]>({
    queryKey: ['dashboard', 'wave-replies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wave_analytics')
        .select('*')
        .gt('sent_count', 0)
        .order('reply_rate', { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActiveWaves() {
  return useQuery<WaveAnalytics[]>({
    queryKey: ['dashboard', 'active-waves'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wave_analytics')
        .select('*')
        .in('status', ['scheduled', 'sending'])
        .order('send_date_seq1', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
}
