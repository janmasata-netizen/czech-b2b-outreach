import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RetargetPoolLead } from '@/types/database';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_RETARGET_POOL, DEMO_RETARGET_READY_COUNT } from '@/lib/demo-data';

export function useRetargetPool(search?: string, teamId?: string, page = 0, pageSize = 50) {
  const { isDemoMode } = useDemoMode();
  return useQuery<RetargetPoolLead[]>({
    queryKey: ['retarget-pool', search ?? '', teamId ?? '', page],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_RETARGET_POOL }),
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
  const { isDemoMode } = useDemoMode();
  return useQuery<number>({
    queryKey: ['retarget-pool-count'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_RETARGET_READY_COUNT }),
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
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['retarget-history', leadId],
    enabled: isDemoMode ? !!leadId : !!leadId,
    ...(isDemoMode && { initialData: [] }),
    queryFn: async () => {
      if (isDemoMode) return [];
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
