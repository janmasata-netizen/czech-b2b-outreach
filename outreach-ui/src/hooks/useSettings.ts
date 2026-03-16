import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Team, ConfigEntry, Salesman, TemplateVariable } from '@/types/database';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_TEAMS, DEMO_SALESMEN, DEMO_TEMPLATE_SETS } from '@/lib/demo-data';

export function useTeamsSettings() {
  const { isDemoMode } = useDemoMode();
  return useQuery<Team[]>({
    queryKey: ['settings', 'teams'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_TEAMS }),
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertTeam() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (team: Partial<Team> & { id?: string }): Promise<string> => {
      if (isDemoMode) return team.id ?? 'demo';
      if (team.id) {
        const { error } = await supabase.from('teams').update(team).eq('id', team.id);
        if (error) throw error;
        return team.id;
      } else {
        const { data, error } = await supabase.from('teams').insert(team).select('id').single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'teams'] }); },
  });
}

export function useConfigEntries() {
  const { isDemoMode } = useDemoMode();
  return useQuery<ConfigEntry[]>({
    queryKey: ['settings', 'config'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: [] as ConfigEntry[] }),
    queryFn: async () => {
      const { data, error } = await supabase.from('config').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertConfig() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase
        .from('config')
        .upsert({ key, value }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'config'] }); },
  });
}

export function useSalesmen(teamId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery<Salesman[]>({
    queryKey: ['settings', 'salesmen', teamId ?? 'all'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_SALESMEN }),
    queryFn: async () => {
      let q = supabase.from('salesmen').select('*, team:teams(name)').order('name');
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertSalesman() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (salesman: Partial<Salesman> & { id?: string }) => {
      if (isDemoMode) return;
      if (salesman.id) {
        const { id, ...updates } = salesman;
        const { error } = await supabase.from('salesmen').update(updates).eq('id', id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('salesmen').insert(salesman);
        if (error) throw error;
      }
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'salesmen'] }); },
  });
}

export function useDeleteSalesman() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('salesmen').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'salesmen'] }); },
  });
}

export function useTemplateSetsSettings(teamId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['settings', 'template-sets', teamId ?? 'all'],
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

export function useCreateTemplateSet() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (payload: { name: string; team_id: string; variables?: TemplateVariable[]; description?: string }) => {
      if (isDemoMode) return {} as Record<string, unknown>;
      const { data, error } = await supabase
        .from('template_sets')
        .insert({
          name: payload.name,
          team_id: payload.team_id,
          variables: payload.variables ?? [],
          description: payload.description ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }); },
  });
}

export function useUpdateTemplateSet() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; variables?: TemplateVariable[]; description?: string | null }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('template_sets').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }); },
  });
}

export function useDeleteTemplateSet() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('template_sets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }); },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('email_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }); },
  });
}

export function useReorderSequences() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ setId, order }: { setId: string; order: number[] }) => {
      if (isDemoMode) return;
      const { error } = await supabase.rpc('reorder_template_sequences', {
        p_set_id: setId,
        p_order: order,
      });
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }); },
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (template: Record<string, unknown>) => {
      if (isDemoMode) return;
      // Ensure DB column `variant` is set (UI may send `ab_variant` alias)
      const data: Record<string, unknown> = {
        ...template,
        variant: template.variant ?? template.ab_variant,
      };
      delete data.ab_variant; // not a real DB column
      if (data.id) {
        const { id, ...updates } = data;
        const { error } = await supabase.from('email_templates').update(updates).eq('id', id as string);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('email_templates').insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }); },
  });
}
