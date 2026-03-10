import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Lead, MasterLeadFilters } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';

export function useMasterLeads(filters: MasterLeadFilters = {}, page = 1) {
  return useQuery({
    queryKey: ['master-leads', filters, page],
    queryFn: async () => {
      // If filtering by tags, first get matching lead IDs
      let tagLeadIds: string[] | null = null;
      if (filters.tag_ids && filters.tag_ids.length > 0) {
        const { data: tagRows, error: te } = await supabase
          .from('lead_tags')
          .select('lead_id')
          .in('tag_id', filters.tag_ids);
        if (te) throw te;
        tagLeadIds = [...new Set((tagRows ?? []).map(r => r.lead_id))];
        if (tagLeadIds.length === 0) return { data: [], count: 0 };
      }

      let q = supabase
        .from('leads')
        .select(`
          *,
          jednatels(id, full_name, phone, linkedin, other_contact, email_candidates(email_address, is_verified, seznam_status, qev_status)),
          lead_tags(id, tag_id, tags(id, name, color))
        `, { count: 'exact' });

      if (filters.master_status) q = q.eq('master_status', filters.master_status);
      if (filters.team_id) q = q.eq('team_id', filters.team_id);
      if (filters.search) {
        q = q.or(`company_name.ilike.%${filters.search}%,ico.ilike.%${filters.search}%`);
      }
      if (tagLeadIds) {
        q = q.in('id', tagLeadIds);
      }

      q = q.order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const mapped = (data ?? []).map((lead: any) => {
        const jednatels = lead.jednatels ?? [];
        const email_candidates = jednatels.flatMap((j: any) => j.email_candidates ?? []);
        const tags = (lead.lead_tags ?? []).map((lt: any) => lt.tags).filter(Boolean);
      /* eslint-enable @typescript-eslint/no-explicit-any */
        return { ...lead, jednatels, email_candidates, tags };
      });

      return { data: mapped as (Lead & { tags: Array<{ id: string; name: string; color: string }> })[], count: count ?? 0 };
    },
  });
}

export function useUpdateMasterStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, master_status }: { ids: string[]; master_status: string }) => {
      const { error } = await supabase.from('leads').update({ master_status }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUpdateJednatelContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { phone?: string | null; linkedin?: string | null; other_contact?: string | null } }) => {
      const { error } = await supabase.from('jednatels').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
