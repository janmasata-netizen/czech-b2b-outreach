import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Team, OutreachAccount, ConfigEntry, Salesman, TemplateVariable } from '@/types/database';

export function useTeamsSettings() {
  return useQuery<Team[]>({
    queryKey: ['settings', 'teams'],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (team: Partial<Team> & { id?: string }): Promise<string> => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'teams'] }),
  });
}

export function useOutreachAccounts(teamId?: string) {
  return useQuery<OutreachAccount[]>({
    queryKey: ['settings', 'outreach-accounts', teamId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('outreach_accounts').select('*, teams(name)').order('created_at');
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertOutreachAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (account: Partial<OutreachAccount> & { id?: string }) => {
      if (account.id) {
        const { id, ...updates } = account;
        const { error } = await supabase.from('outreach_accounts').update(updates).eq('id', id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('outreach_accounts').insert(account);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'outreach-accounts'] }),
  });
}

export function useConfigEntries() {
  return useQuery<ConfigEntry[]>({
    queryKey: ['settings', 'config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('config').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('config')
        .upsert({ key, value }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'config'] }),
  });
}

export function useSalesmen(teamId?: string) {
  return useQuery<Salesman[]>({
    queryKey: ['settings', 'salesmen', teamId ?? 'all'],
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
  return useMutation({
    mutationFn: async (salesman: Partial<Salesman> & { id?: string }) => {
      if (salesman.id) {
        const { id, ...updates } = salesman;
        const { error } = await supabase.from('salesmen').update(updates).eq('id', id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('salesmen').insert(salesman);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'salesmen'] }),
  });
}

export function useDeleteSalesman() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('salesmen').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'salesmen'] }),
  });
}

export function useTemplateSetsSettings(teamId?: string) {
  return useQuery({
    queryKey: ['settings', 'template-sets', teamId ?? 'all'],
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
  return useMutation({
    mutationFn: async (payload: { name: string; team_id: string; variables?: TemplateVariable[]; description?: string }) => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }),
  });
}

export function useUpdateTemplateSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; variables?: TemplateVariable[]; description?: string | null }) => {
      const { error } = await supabase.from('template_sets').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }),
  });
}

export function useDeleteTemplateSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('template_sets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }),
  });
}

export function useReorderSequences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ setId, order }: { setId: string; order: number[] }) => {
      const { error } = await supabase.rpc('reorder_template_sequences', {
        p_set_id: setId,
        p_order: order,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }),
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Record<string, unknown>) => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'template-sets'] }),
  });
}
