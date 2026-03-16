import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ImportGroupStats, Lead, Contact, EmailCandidate } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_IMPORT_GROUPS, DEMO_LEADS } from '@/lib/demo-data';

export function useImportGroups() {
  const { isDemoMode } = useDemoMode();
  return useQuery<ImportGroupStats[]>({
    queryKey: ['import-groups'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_IMPORT_GROUPS }),
    refetchInterval: isDemoMode ? false : 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_import_group_stats');
      if (error) throw error;
      return (data ?? []) as ImportGroupStats[];
    },
  });
}

export function useImportGroupLeads(groupId: string | null, page = 1) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['import-group-leads', groupId, page],
    enabled: isDemoMode ? !!groupId : !!groupId,
    refetchInterval: isDemoMode ? false : 15_000,
    ...(isDemoMode && { initialData: { data: DEMO_LEADS.slice(0, 5), count: 5 } }),
    queryFn: async () => {
      if (isDemoMode) return { data: DEMO_LEADS.slice(0, 5), count: 5 };
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

export function useImportGroup(id: string | undefined) {
  const { isDemoMode } = useDemoMode();
  return useQuery<ImportGroupStats | null>({
    queryKey: ['import-group', id],
    enabled: isDemoMode ? !!id : !!id,
    refetchInterval: isDemoMode ? false : 15_000,
    ...(isDemoMode && { initialData: DEMO_IMPORT_GROUPS.find(g => g.id === id) ?? DEMO_IMPORT_GROUPS[0] }),
    queryFn: async () => {
      if (isDemoMode) return DEMO_IMPORT_GROUPS.find(g => g.id === id) ?? DEMO_IMPORT_GROUPS[0];
      const { data, error } = await supabase.rpc('get_import_group_stats');
      if (error) throw error;
      const all = (data ?? []) as ImportGroupStats[];
      return all.find(g => g.id === id) ?? null;
    },
  });
}

export function useDeleteImportGroup() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (groupId: string) => {
      if (isDemoMode) return;
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
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['import-groups'] });
        qc.invalidateQueries({ queryKey: ['import-group-leads'] });
        qc.invalidateQueries({ queryKey: ['leads'] });
      }
    },
  });
}
