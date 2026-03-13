import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DashboardStats, WaveAnalytics } from '@/types/database';

export function useDashboardStats(days = 0, teamId?: string) {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', days, teamId ?? 'all'],
    queryFn: async () => {
      // Always use direct queries when teamId is set (RPC doesn't support team filtering)
      // Also use direct queries for days>0 path
      if (days === 0 && !teamId) {
        // All-time stats via RPC (no team filter)
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

      const since = days > 0
        ? new Date(Date.now() - days * 86_400_000).toISOString()
        : undefined;

      // Build leads queries (direct team_id column)
      let leadsQ = supabase.from('leads').select('id, status', { count: 'exact', head: false });
      let bouncedQ = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'bounced');
      if (since) {
        leadsQ = leadsQ.gte('created_at', since);
        bouncedQ = bouncedQ.gte('updated_at', since);
      }
      if (teamId) {
        leadsQ = leadsQ.eq('team_id', teamId);
        bouncedQ = bouncedQ.eq('team_id', teamId);
      }

      // Build sent_emails query (team filter via inner join)
      const buildSentQ = () => {
        if (teamId) {
          let q = supabase
            .from('sent_emails')
            .select('id, wave_leads!inner(leads!inner(team_id))', { count: 'exact', head: true })
            .eq('wave_leads.leads.team_id', teamId);
          if (since) q = q.gte('sent_at', since);
          return q;
        }
        let q = supabase.from('sent_emails').select('id', { count: 'exact', head: true });
        if (since) q = q.gte('sent_at', since);
        return q;
      };

      // Build replies query (team filter via inner join on leads)
      const buildRepliesQ = () => {
        if (teamId) {
          let q = supabase
            .from('lead_replies')
            .select('id, leads!inner(team_id)', { count: 'exact', head: true })
            .eq('leads.team_id', teamId);
          if (since) q = q.gte('created_at', since);
          return q;
        }
        let q = supabase.from('lead_replies').select('id', { count: 'exact', head: true });
        if (since) q = q.gte('created_at', since);
        return q;
      };

      // Build queue query (team filter via inner join)
      const buildQueueQ = () => {
        if (teamId) {
          return supabase
            .from('email_queue')
            .select('id, wave_leads!inner(leads!inner(team_id))', { count: 'exact', head: true })
            .eq('wave_leads.leads.team_id', teamId)
            .in('status', ['queued', 'sending']);
        }
        return supabase.from('email_queue').select('id', { count: 'exact', head: true }).in('status', ['queued', 'sending']);
      };

      const [leadsRes, sentRes, repliesRes, bouncedRes, queueRes] = await Promise.all([
        leadsQ, buildSentQ(), buildRepliesQ(), bouncedQ, buildQueueQ(),
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

export function useEmailVolumeChart(days = 14, teamId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'volume', days, teamId ?? 'all'],
    queryFn: async () => {
      const since = days > 0
        ? new Date(Date.now() - days * 86_400_000).toISOString()
        : undefined;

      let data: { sent_at: string | null; sequence_number: number | null }[];

      if (teamId) {
        let q = supabase
          .from('sent_emails')
          .select('sent_at, sequence_number, wave_leads!inner(leads!inner(team_id))')
          .eq('wave_leads.leads.team_id', teamId)
          .order('sent_at');
        if (since) q = q.gte('sent_at', since);
        const res = await q;
        data = (res.data ?? []) as unknown as typeof data;
      } else {
        let q = supabase
          .from('sent_emails')
          .select('sent_at, sequence_number')
          .order('sent_at');
        if (since) q = q.gte('sent_at', since);
        const res = await q;
        data = res.data ?? [];
      }

      const buckets: Record<string, { seq1: number; seq2: number; seq3: number }> = {};
      data.forEach(row => {
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

export function useWaveReplies(teamId?: string) {
  return useQuery<WaveAnalytics[]>({
    queryKey: ['dashboard', 'wave-replies', teamId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('wave_analytics')
        .select('*')
        .gt('sent_count', 0)
        .order('reply_rate', { ascending: false })
        .limit(8);
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActiveWaves(teamId?: string) {
  return useQuery<WaveAnalytics[]>({
    queryKey: ['dashboard', 'active-waves', teamId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('wave_analytics')
        .select('*')
        .in('status', ['scheduled', 'sending'])
        .order('send_date_seq1', { ascending: true })
        .limit(5);
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// --- New stat hooks ---

export function useReadyLeadsCount(teamId?: string) {
  return useQuery<number>({
    queryKey: ['dashboard', 'ready-leads', teamId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('leads').select('id', { count: 'exact', head: false }).eq('status', 'ready');
      if (teamId) q = q.eq('team_id', teamId);
      const { data: readyLeads, count } = await q;

      if (!readyLeads?.length) return 0;

      // Exclude those already in an active wave (scheduled/sending)
      const readyIds = readyLeads.map(l => l.id);
      const { data: inWave } = await supabase
        .from('wave_leads')
        .select('lead_id, waves!inner(status)')
        .in('lead_id', readyIds)
        .in('waves.status', ['scheduled', 'sending']);

      const inWaveIds = new Set((inWave ?? []).map(wl => wl.lead_id));
      return (count ?? readyLeads.length) - inWaveIds.size;
    },
  });
}

export function useActiveWavesCount(teamId?: string) {
  return useQuery<number>({
    queryKey: ['dashboard', 'active-waves-count', teamId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('wave_analytics')
        .select('id', { count: 'exact', head: true })
        .in('status', ['scheduled', 'sending']);
      if (teamId) q = q.eq('team_id', teamId);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useRetargetReadyCount(teamId?: string) {
  return useQuery<number>({
    queryKey: ['dashboard', 'retarget-ready', teamId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('retarget_pool')
        .select('lead_id', { count: 'exact', head: true });
      if (teamId) q = q.eq('team_id', teamId);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useReplyCount(days: number, teamId?: string) {
  return useQuery<number>({
    queryKey: ['dashboard', 'reply-count', days, teamId ?? 'all'],
    queryFn: async () => {
      const since = days > 0
        ? new Date(Date.now() - days * 86_400_000).toISOString()
        : undefined;

      const buildQ = () => {
        if (teamId) {
          let q = supabase
            .from('lead_replies')
            .select('id, leads!inner(team_id)', { count: 'exact', head: true })
            .eq('leads.team_id', teamId);
          if (since) q = q.gte('created_at', since);
          return q;
        }
        let q = supabase.from('lead_replies').select('id', { count: 'exact', head: true });
        if (since) q = q.gte('created_at', since);
        return q;
      };

      const { count, error } = await buildQ();
      if (error) throw error;
      return count ?? 0;
    },
  });
}
