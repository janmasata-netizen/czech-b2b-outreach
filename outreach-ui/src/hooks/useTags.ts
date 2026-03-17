import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isSystemTag } from '@/lib/constants';
import type { Tag, LeadTag, CompanyTag } from '@/types/database';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_TAGS, DEMO_LEAD_TAGS, getDemoCompanyTags } from '@/lib/demo-data';

export function useTags(teamId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery<Tag[]>({
    queryKey: ['tags', teamId],
    queryFn: async () => {
      if (isDemoMode) return DEMO_TAGS;
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
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (tag: { name: string; color: string; team_id?: string | null }) => {
      if (isDemoMode) return {} as Tag;
      const { data, error } = await supabase.from('tags').insert(tag).select().single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Tag> }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('tags').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return;
      // Safety net: look up tag name and block system tag deletion
      const { data: tag } = await supabase.from('tags').select('name').eq('id', id).single();
      if (tag && isSystemTag(tag.name)) {
        throw new Error('Systemovy stitek nelze smazat');
      }
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['tags'] });
        qc.invalidateQueries({ queryKey: ['lead-tags'] });
        qc.invalidateQueries({ queryKey: ['master-leads'] });
      }
    },
  });
}

export function useLeadTags(leadId: string | undefined) {
  const { isDemoMode } = useDemoMode();
  const demoData = leadId ? DEMO_LEAD_TAGS.filter(lt => lt.lead_id === leadId) : [];
  return useQuery<LeadTag[]>({
    queryKey: ['lead-tags', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      if (isDemoMode) return demoData;
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
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ leadId, tagId, tagName }: { leadId: string; tagId: string; tagName: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('lead_tags').insert({ lead_id: leadId, tag_id: tagId });
      if (error) throw error;
      if (tagName.toLowerCase() === 'blacklist') {
        const { error: e2 } = await supabase.from('leads').update({ master_status: 'blacklisted' }).eq('id', leadId);
        if (e2) throw e2;
      }
    },
    onSuccess: (_d, { leadId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['lead-tags', leadId] });
        qc.invalidateQueries({ queryKey: ['leads', leadId] });
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['master-leads'] });
      }
    },
  });
}

export function useRemoveTagFromLead() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ leadId, tagId, tagName }: { leadId: string; tagId: string; tagName: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId);
      if (error) throw error;
      if (tagName.toLowerCase() === 'blacklist') {
        const { error: e2 } = await supabase.from('leads').update({ master_status: 'active' }).eq('id', leadId);
        if (e2) throw e2;
      }
    },
    onSuccess: (_d, { leadId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['lead-tags', leadId] });
        qc.invalidateQueries({ queryKey: ['leads', leadId] });
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['master-leads'] });
      }
    },
  });
}

// ============================================================
// Company-relevant tags (only tags actually used on companies + system tags)
// ============================================================

export function useCompanyRelevantTags(teamId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery<Tag[]>({
    queryKey: ['company-relevant-tags', teamId],
    queryFn: async () => {
      if (isDemoMode) return DEMO_TAGS.filter(t => isSystemTag(t.name) || t.name === 'VIP');
      // Get tag IDs actually used on companies
      const { data: usedRows } = await supabase
        .from('company_tags')
        .select('tag_id');
      const usedTagIds = new Set((usedRows ?? []).map(r => r.tag_id));

      // Get all tags (team-scoped)
      let q = supabase.from('tags').select('*').order('name');
      if (teamId) {
        q = q.or(`team_id.eq.${teamId},team_id.is.null`);
      }
      const { data, error } = await q;
      if (error) throw error;

      // Keep only tags used on companies OR system tags
      return (data ?? []).filter(t => usedTagIds.has(t.id) || isSystemTag(t.name));
    },
  });
}

// ============================================================
// Company Tags
// ============================================================

export function useCompanyTags(companyId: string | undefined) {
  const { isDemoMode } = useDemoMode();
  const demoData = companyId ? getDemoCompanyTags(companyId) : [];
  return useQuery<CompanyTag[]>({
    queryKey: ['company-tags', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (isDemoMode) return demoData;
      const { data, error } = await supabase
        .from('company_tags')
        .select('*, tag:tags(*)')
        .eq('company_id', companyId!);
      if (error) throw error;
      return (data ?? []) as CompanyTag[];
    },
  });
}

export function useAddTagToCompany() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ companyId, tagId, tagName }: { companyId: string; tagId: string; tagName: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('company_tags').insert({ company_id: companyId, tag_id: tagId });
      if (error) throw error;
      if (tagName.toLowerCase() === 'blacklist') {
        const { error: e2 } = await supabase.from('companies').update({ master_status: 'blacklisted' }).eq('id', companyId);
        if (e2) throw e2;
      }
    },
    onSuccess: (_d, { companyId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['company-tags', companyId] });
        qc.invalidateQueries({ queryKey: ['companies', companyId] });
        qc.invalidateQueries({ queryKey: ['companies'] });
      }
    },
  });
}

export function useRemoveTagFromCompany() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ companyId, tagId, tagName }: { companyId: string; tagId: string; tagName: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('company_tags').delete().eq('company_id', companyId).eq('tag_id', tagId);
      if (error) throw error;
      if (tagName.toLowerCase() === 'blacklist') {
        const { error: e2 } = await supabase.from('companies').update({ master_status: 'active' }).eq('id', companyId);
        if (e2) throw e2;
      }
    },
    onSuccess: (_d, { companyId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['company-tags', companyId] });
        qc.invalidateQueries({ queryKey: ['companies', companyId] });
        qc.invalidateQueries({ queryKey: ['companies'] });
      }
    },
  });
}
