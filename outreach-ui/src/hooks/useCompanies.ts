import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Company, CompanyFilters, Contact, EmailCandidate } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_COMPANIES, getDemoCompanyDetail } from '@/lib/demo-data';

function escapePostgrest(val: string): string {
  return val.replace(/[%_\\(),."']/g, c => '\\' + c);
}

export function useCompanies(filters: CompanyFilters = {}, page = 1) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['companies', filters, page],
    queryFn: async () => {
      if (isDemoMode) return { data: DEMO_COMPANIES, count: DEMO_COMPANIES.length };
      // If filtering by tags, first get matching company IDs
      let tagCompanyIds: string[] | null = null;
      if (filters.tag_ids && filters.tag_ids.length > 0) {
        const { data: tagRows, error: te } = await supabase
          .from('company_tags')
          .select('company_id')
          .in('tag_id', filters.tag_ids);
        if (te) throw te;
        tagCompanyIds = [...new Set((tagRows ?? []).map(r => r.company_id))];
        if (tagCompanyIds.length === 0) return { data: [], count: 0 };
      }

      let q = supabase
        .from('companies')
        .select(`
          *,
          contacts(id, full_name, phone, linkedin, other_contact, email_candidates(email_address, is_verified, seznam_status, qev_status)),
          company_tags(id, tag_id, tag:tags(id, name, color))
        `, { count: 'exact' });

      if (filters.master_status) q = q.eq('master_status', filters.master_status);
      if (filters.team_id) q = q.eq('team_id', filters.team_id);
      if (filters.search) {
        const safe = escapePostgrest(filters.search);
        q = q.or(`company_name.ilike.%${safe}%,ico.ilike.%${safe}%`);
      }
      if (tagCompanyIds) {
        q = q.in('id', tagCompanyIds);
      }

      q = q.order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      const mapped = (data ?? []).map((company: {
        contacts?: (Contact & { email_candidates?: EmailCandidate[] })[];
        company_tags?: { tag: { id: string; name: string; color: string } | null }[];
        [key: string]: unknown;
      }) => {
        const contacts = company.contacts ?? [];
        const email_candidates = contacts.flatMap((c: Contact & { email_candidates?: EmailCandidate[] }) => c.email_candidates ?? []);
        const tags = (company.company_tags ?? []).map((ct: { tag: { id: string; name: string; color: string } | null }) => ct.tag).filter(Boolean);
        return { ...company, contacts, email_candidates, tags };
      });

      return { data: mapped as unknown as (Company & { tags: Array<{ id: string; name: string; color: string }> })[], count: count ?? 0 };
    },
  });
}

export function useCompany(id: string | undefined) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['companies', id],
    enabled: !!id,
    queryFn: async () => {
      if (isDemoMode) return getDemoCompanyDetail(id!);
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          contacts(*, email_candidates(id,email_address,contact_id,jednatel_id,seznam_status,qev_status,qev_checked_at,is_verified,is_catch_all,catch_all_confidence,created_at)),
          company_tags(id, tag_id, tag:tags(id, name, color)),
          leads(id, company_name, status, domain, created_at, wave_leads(id, wave_id, status, waves(name, status)))
        `)
        .eq('id', id!)
        .single();
      if (error) throw error;

      const contacts = ((data as unknown as { contacts?: (Contact & { email_candidates?: EmailCandidate[] })[] }).contacts ?? []);
      const email_candidates = contacts.flatMap((c: Contact & { email_candidates?: EmailCandidate[] }) => c.email_candidates ?? []);
      const tags = ((data as unknown as { company_tags?: { tag: { id: string; name: string; color: string } | null }[] }).company_tags ?? [])
        .map((ct: { tag: { id: string; name: string; color: string } | null }) => ct.tag)
        .filter(Boolean);

      return {
        ...data,
        contacts,
        email_candidates,
        tags,
      } as Company & {
        contacts: (Contact & { email_candidates: EmailCandidate[] })[];
        email_candidates: EmailCandidate[];
        tags: Array<{ id: string; name: string; color: string }>;
        leads: Array<{ id: string; company_name: string | null; status: string; domain: string | null; created_at: string; wave_leads: Array<{ id: string; wave_id: string; status: string; waves: { name: string; status: string } }> }>;
      };
    },
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (company: Partial<Company>) => {
      if (isDemoMode) return {} as Company;
      const { data, error } = await supabase.from('companies').insert(company).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['companies'] }); },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Company> }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('companies').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['companies'] });
        qc.invalidateQueries({ queryKey: ['companies', id] });
      }
    },
  });
}

export function useUpdateCompanyMasterStatus() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ ids, master_status }: { ids: string[]; master_status: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('companies').update({ master_status }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!isDemoMode) qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
