import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ImportGroupStats, Lead, Contact, EmailCandidate } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';

export function useImportGroups() {
  return useQuery<ImportGroupStats[]>({
    queryKey: ['import-groups'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_import_group_stats');
      if (error) throw error;
      return (data ?? []) as ImportGroupStats[];
    },
  });
}

export function useImportGroupLeads(groupId: string | null, page = 1) {
  return useQuery({
    queryKey: ['import-group-leads', groupId, page],
    enabled: !!groupId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('leads')
        .select(`
          *,
          companies:companies!company_id(contacts(full_name, email_candidates:email_candidates!contact_id(email_address, is_verified, qev_status, seznam_status)))
        `, { count: 'exact' })
        .eq('import_group_id', groupId!)
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (error) throw error;
      const mapped = (data ?? []).map((lead: Lead & { companies?: { contacts: (Contact & { email_candidates?: EmailCandidate[] })[] } | null }) => {
        const contacts = lead.companies?.contacts ?? [];
        const email_candidates = contacts.flatMap((c: Contact & { email_candidates?: EmailCandidate[] }) => c.email_candidates ?? []);
        return { ...lead, contacts, email_candidates };
      });
      return { data: mapped, count: count ?? 0 };
    },
  });
}

export function useDeleteImportGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      // Null out import_group_id on leads
      const { error: e1 } = await supabase
        .from('leads')
        .update({ import_group_id: null })
        .eq('import_group_id', groupId);
      if (e1) throw e1;
      // Delete the group
      const { error: e2 } = await supabase
        .from('import_groups')
        .delete()
        .eq('id', groupId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-groups'] });
      qc.invalidateQueries({ queryKey: ['import-group-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
