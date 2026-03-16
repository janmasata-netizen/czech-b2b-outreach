import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Wave, WaveAnalytics } from '@/types/database';
import { useDemoMode } from '@/contexts/DemoModeContext';
import {
  DEMO_WAVES,
  DEMO_TEMPLATE_SETS,
  DEMO_FROM_EMAILS,
  DEMO_FAILED_EMAILS,
  getDemoWaveDetail,
} from '@/lib/demo-data';

export function useWaves() {
  const { isDemoMode } = useDemoMode();
  return useQuery<WaveAnalytics[]>({
    queryKey: ['waves'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_WAVES }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wave_analytics')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWave(id: string | undefined) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['waves', id],
    enabled: isDemoMode ? !!id : !!id,
    refetchInterval: isDemoMode ? false : 10_000,
    ...(isDemoMode && id && { initialData: getDemoWaveDetail(id) }),
    queryFn: async () => {
      if (isDemoMode) return getDemoWaveDetail(id!);
      const [waveRes, leadsRes, waveRowRes] = await Promise.all([
        supabase
          .from('wave_analytics')
          .select('*')
          .eq('id', id!)
          .single(),
        supabase
          .from('wave_leads')
          .select(`
            *,
            leads(id, company_name, ico, website, domain, status, custom_fields, company_id, companies:companies!company_id(contacts(id, full_name, first_name, last_name, salutation, email_candidates:email_candidates!contact_id(id, email_address, is_verified, qev_status, seznam_status)))),
            email_queue(id, sequence_number, email_address, subject_rendered, body_rendered, scheduled_at, status),
            sent_emails(id, sequence_number, sent_at),
            lead_replies(id, received_at, created_at)
          `)
          .eq('wave_id', id!),
        supabase
          .from('waves')
          .select('*')
          .eq('id', id!)
          .single(),
      ]);
      if (waveRes.error) throw waveRes.error;
      return {
        wave: { ...waveRes.data, ...waveRowRes.data } as WaveAnalytics,
        waveLeads: leadsRes.data ?? [],
      };
    },
  });
}

export function useFromEmailSuggestions() {
  const { isDemoMode } = useDemoMode();
  return useQuery<string[]>({
    queryKey: ['from-email-suggestions'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_FROM_EMAILS }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('waves')
        .select('from_email')
        .not('from_email', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const unique = [...new Set((data ?? []).map(d => d.from_email).filter(Boolean))] as string[];
      return unique;
    },
  });
}

export function useTemplateSets(teamId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['template-sets', teamId ?? 'all'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_TEMPLATE_SETS }),
    queryFn: async () => {
      let q = supabase
        .from('template_sets')
        .select('*, email_templates(*)')
        .order('name');
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateWave() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (wave: Partial<Wave>) => {
      if (isDemoMode) return {} as Wave;
      const { data, error } = await supabase.from('waves').insert(wave).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['waves'] }); },
  });
}

export function useUpdateWave() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Wave> }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('waves').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['waves', id] });
      }
    },
  });
}

export function useDeleteWave() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('waves').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['waves'] }); },
  });
}

export function useAddLeadsToWave() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ waveId, leadIds, retargetMode }: { waveId: string; leadIds: string[]; retargetMode?: boolean }) => {
      if (isDemoMode) return;
      const retargetRounds: Record<string, number> = {};

      if (retargetMode) {
        // Fetch the most recent retarget_round for each lead
        const { data: existing } = await supabase
          .from('wave_leads')
          .select('lead_id, retarget_round')
          .in('lead_id', leadIds)
          .order('updated_at', { ascending: false });
        if (existing) {
          for (const row of existing) {
            if (!(row.lead_id in retargetRounds)) {
              retargetRounds[row.lead_id] = (row.retarget_round ?? 0) + 1;
            }
          }
        }
      }

      const rows = leadIds.map((lead_id) => ({
        wave_id: waveId,
        lead_id,
        ab_variant: 'A',
        status: 'pending',
        ...(retargetMode ? { retarget_round: retargetRounds[lead_id] ?? 1 } : {}),
      }));
      const { error } = await supabase.from('wave_leads').insert(rows);
      if (error) throw error;
    },
    onSuccess: (_data, { waveId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['waves', waveId] });
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['retarget-pool'] });
        qc.invalidateQueries({ queryKey: ['retarget-pool-count'] });
      }
    },
  });
}

export function useUpdateEmailQueue(waveId: string) {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, subject_rendered, body_rendered }: { id: string; subject_rendered: string; body_rendered: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase
        .from('email_queue')
        .update({ subject_rendered, body_rendered })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!isDemoMode) qc.invalidateQueries({ queryKey: ['waves', waveId] });
    },
  });
}

export function useFailedEmails(waveId: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['failed-emails', waveId],
    enabled: isDemoMode ? !!waveId : !!waveId,
    ...(isDemoMode && { initialData: DEMO_FAILED_EMAILS }),
    queryFn: async () => {
      if (isDemoMode) return DEMO_FAILED_EMAILS;
      // Get all wave_lead IDs for this wave
      const { data: waveLeads } = await supabase
        .from('wave_leads')
        .select('id')
        .eq('wave_id', waveId);
      if (!waveLeads?.length) return [];

      const wlIds = waveLeads.map(wl => wl.id);
      const { data, error } = await supabase
        .from('email_queue')
        .select('id, wave_lead_id, email_address, sequence_number, error_message, retry_count, status, scheduled_at')
        .in('wave_lead_id', wlIds)
        .eq('status', 'failed')
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRetryFailedEmail() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (emailQueueId: string) => {
      if (isDemoMode) return;
      const { error } = await supabase
        .from('email_queue')
        .update({ status: 'queued', retry_count: 0, error_message: null })
        .eq('id', emailQueueId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['failed-emails'] });
        qc.invalidateQueries({ queryKey: ['waves'] });
      }
    },
  });
}
