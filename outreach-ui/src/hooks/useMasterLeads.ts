/**
 * @deprecated Use useCompanies from '@/hooks/useCompanies' instead.
 * This file is kept for backward compatibility during the migration.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Lead, MasterLeadFilters, EmailCandidate } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_LEADS } from '@/lib/demo-data';

/** @deprecated Use useCompanies instead */
export function useMasterLeads(filters: MasterLeadFilters = {}, page = 1) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['master-leads', filters, page],
    enabled: !isDemoMode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(isDemoMode && { initialData: { data: DEMO_LEADS as any, count: DEMO_LEADS.length } }),
    queryFn: async () => {
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
          company_id, companies:companies!company_id(contacts(id, full_name, phone, linkedin, other_contact, email_candidates:email_candidates!contact_id(email_address, is_verified, seznam_status, qev_status))),
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

      const mapped = (data ?? []).map((lead: { companies?: { contacts?: { email_candidates?: EmailCandidate[] }[] } | null; lead_tags?: { tags: { id: string; name: string; color: string } | null }[]; [key: string]: unknown }) => {
        const contacts = lead.companies?.contacts ?? [];
        const email_candidates = contacts.flatMap((c: { email_candidates?: EmailCandidate[] }) => c.email_candidates ?? []);
        const tags = (lead.lead_tags ?? []).map((lt: { tags: { id: string; name: string; color: string } | null }) => lt.tags).filter(Boolean);
        return { ...lead, contacts, email_candidates, tags };
      });

      return { data: mapped as (Lead & { tags: Array<{ id: string; name: string; color: string }> })[], count: count ?? 0 };
    },
  });
}

/** @deprecated Use useUpdateCompanyMasterStatus instead */
export function useUpdateMasterStatus() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ ids, master_status }: { ids: string[]; master_status: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('leads').update({ master_status }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['master-leads'] });
        qc.invalidateQueries({ queryKey: ['leads'] });
      }
    },
  });
}

/** @deprecated Use useUpdateContact instead */
export { useUpdateContact as useUpdateJednatelContact } from './useContacts';
