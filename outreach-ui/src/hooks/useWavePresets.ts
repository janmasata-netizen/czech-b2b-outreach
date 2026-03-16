import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { WavePreset } from '@/types/database';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_WAVE_PRESETS } from '@/lib/demo-data';

export function useWavePresets(teamId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery<WavePreset[]>({
    queryKey: ['wave-presets', teamId ?? 'all'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_WAVE_PRESETS }),
    queryFn: async () => {
      let q = supabase
        .from('wave_presets')
        .select('*, template_set:template_sets(id, name), salesman:salesmen(id, name, email)')
        .order('name');
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as WavePreset[];
    },
  });
}

export function useCreateWavePreset() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (preset: { name: string; team_id: string; template_set_id?: string | null; from_email?: string | null; salesman_id?: string | null }) => {
      if (isDemoMode) return {} as Record<string, unknown>;
      const { data, error } = await supabase
        .from('wave_presets')
        .insert({
          name: preset.name,
          team_id: preset.team_id,
          template_set_id: preset.template_set_id || null,
          from_email: preset.from_email || null,
          salesman_id: preset.salesman_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['wave-presets'] }); },
  });
}

export function useDeleteWavePreset() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('wave_presets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['wave-presets'] }); },
  });
}
