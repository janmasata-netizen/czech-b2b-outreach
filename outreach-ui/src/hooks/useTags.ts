import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tag, LeadTag } from '@/types/database';

export function useTags(teamId?: string) {
  return useQuery<Tag[]>({
    queryKey: ['tags', teamId],
    queryFn: async () => {
      let q = supabase.from('tags').select('*').order('name');
      if (teamId) {
        q = q.or(`team_id.eq.${teamId},team_id.is.null`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tag: { name: string; color: string; team_id?: string | null }) => {
      const { data, error } = await supabase.from('tags').insert(tag).select().single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Tag> }) => {
      const { error } = await supabase.from('tags').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
      qc.invalidateQueries({ queryKey: ['master-leads'] });
    },
  });
}

export function useLeadTags(leadId: string | undefined) {
  return useQuery<LeadTag[]>({
    queryKey: ['lead-tags', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_tags')
        .select('*, tag:tags(*)')
        .eq('lead_id', leadId!);
      if (error) throw error;
      return (data ?? []) as LeadTag[];
    },
  });
}

export function useAddTagToLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, tagId, tagName }: { leadId: string; tagId: string; tagName: string }) => {
      const { error } = await supabase.from('lead_tags').insert({ lead_id: leadId, tag_id: tagId });
      if (error) throw error;
      // If Blacklist tag, also set master_status
      if (tagName.toLowerCase() === 'blacklist') {
        const { error: e2 } = await supabase.from('leads').update({ master_status: 'blacklisted' }).eq('id', leadId);
        if (e2) throw e2;
      }
    },
    onSuccess: (_d, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['lead-tags', leadId] });
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['master-leads'] });
    },
  });
}

export function useRemoveTagFromLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, tagId, tagName }: { leadId: string; tagId: string; tagName: string }) => {
      const { error } = await supabase.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId);
      if (error) throw error;
      // If removing Blacklist tag, reset master_status
      if (tagName.toLowerCase() === 'blacklist') {
        const { error: e2 } = await supabase.from('leads').update({ master_status: 'active' }).eq('id', leadId);
        if (e2) throw e2;
      }
    },
    onSuccess: (_d, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['lead-tags', leadId] });
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['master-leads'] });
    },
  });
}
