import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DashboardStats, WaveAnalytics } from '@/types/database';

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
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
