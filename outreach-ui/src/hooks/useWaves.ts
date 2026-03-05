import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Wave, WaveAnalytics } from '@/types/database';

export function useWaves() {
  return useQuery<WaveAnalytics[]>({
    queryKey: ['waves'],
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
  return useQuery({
    queryKey: ['waves', id],
    enabled: !!id,
    refetchInterval: 30_000,
    queryFn: async () => {
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
            leads(id, company_name, ico, website, domain, status, custom_fields, jednatels(id, full_name, first_name, last_name, salutation, email_candidates(id, email_address, is_verified, qev_status, seznam_status))),
            email_queue(id, sequence_number, email_address, subject_rendered, body_rendered, scheduled_at, status, jednatel_id),
            sent_emails(id, sequence_number, sent_at),
            lead_replies(id, received_at)
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

export function useTemplateSets(teamId?: string) {
  return useQuery({
    queryKey: ['template-sets', teamId ?? 'all'],
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
  return useMutation({
    mutationFn: async (wave: Partial<Wave>) => {
      const { data, error } = await supabase.from('waves').insert(wave).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waves'] }),
  });
}

export function useUpdateWave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Wave> }) => {
      const { error } = await supabase.from('waves').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['waves'] });
      qc.invalidateQueries({ queryKey: ['waves', id] });
    },
  });
}

export function useDeleteWave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('waves').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waves'] }),
  });
}

export function useAddLeadsToWave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ waveId, leadIds }: { waveId: string; leadIds: string[] }) => {
      const rows = leadIds.map((lead_id) => ({
        wave_id: waveId,
        lead_id,
        ab_variant: 'A',
        status: 'pending',
      }));
      const { error } = await supabase.from('wave_leads').insert(rows);
      if (error) throw error;
    },
    onSuccess: (_data, { waveId }) => {
      qc.invalidateQueries({ queryKey: ['waves', waveId] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    },
  });
}

export function useUpdateEmailQueue(waveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, subject_rendered, body_rendered }: { id: string; subject_rendered: string; body_rendered: string }) => {
      const { error } = await supabase
        .from('email_queue')
        .update({ subject_rendered, body_rendered })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waves', waveId] });
    },
  });
}
