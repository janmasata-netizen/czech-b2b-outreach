import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RetargetPoolLead } from '@/types/database';

export function useRetargetPool(search?: string, teamId?: string, page = 0, pageSize = 50) {
  return useQuery<RetargetPoolLead[]>({
    queryKey: ['retarget-pool', search ?? '', teamId ?? '', page],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p_limit: pageSize,
        p_offset: page * pageSize,
      };
      if (search) params.p_search = search;
      if (teamId) params.p_team_id = teamId;

      const { data, error } = await supabase.rpc('get_retarget_pool', params);
      if (error) throw error;
      return (data ?? []) as RetargetPoolLead[];
    },
  });
}

export function useRetargetPoolCount() {
  return useQuery<number>({
    queryKey: ['retarget-pool-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retarget_pool')
        .select('lead_id', { count: 'exact', head: true });
      if (error) throw error;
      return data as unknown as number;
    },
    select: (_data) => _data,
  });
}

export function useRetargetLeadHistory(leadId: string | undefined) {
  return useQuery({
    queryKey: ['retarget-history', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wave_leads')
        .select(`
          id, wave_id, status, retarget_round, ab_variant, created_at, updated_at,
          waves(id, name, status, completed_at, created_at),
          sent_emails(id, sequence_number, sent_at, subject)
        `)
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
