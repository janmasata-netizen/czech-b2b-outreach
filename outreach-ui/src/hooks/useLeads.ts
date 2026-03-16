import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Lead, LeadFilters, Team, EmailCandidate, Contact } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';
import { extractDomain } from '@/lib/dedup';
import { useDemoMode } from '@/contexts/DemoModeContext';
import {
  DEMO_LEADS,
  DEMO_TEAMS,
  DEMO_LEADS_NOT_IN_WAVE,
  DEMO_READY_LEADS_BY_GROUP,
  getDemoLeadDetail,
  getDemoEmailCandidates,
} from '@/lib/demo-data';

export function useLeads(filters: LeadFilters = {}, page = 1) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['leads', filters, page],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: { data: DEMO_LEADS, count: DEMO_LEADS.length } }),
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select(`
          *,
          company_id,
          companies:companies!company_id(contacts(full_name, email_candidates:email_candidates!contact_id(email_address, is_verified, seznam_status, qev_status))),
          wave_leads(id, wave_id, waves(id, name, status))
        `, { count: 'exact' });

      if (filters.statuses && filters.statuses.length > 0) q = q.in('status', filters.statuses);
      else if (filters.status) q = q.eq('status', filters.status);
      if (filters.team_id) q = q.eq('team_id', filters.team_id);
      if (filters.language) q = q.eq('language', filters.language);
      if (filters.search) {
        q = q.or(`company_name.ilike.%${filters.search}%,ico.ilike.%${filters.search}%`);
      }

      q = q.order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data, count, error } = await q;
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

export function useLead(id: string | undefined) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['leads', id],
    enabled: !!id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (isDemoMode) return getDemoLeadDetail(id!) as any;
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          team:teams(id, name),
          company_id,
          companies:companies!company_id(contacts(*, email_candidates:email_candidates!contact_id(id,email_address,contact_id,seznam_status,qev_status,qev_checked_at,is_verified,is_catch_all,catch_all_confidence,created_at))),
          enrichment_log(*),
          wave_leads(*, waves(name, status, is_dummy, dummy_email), sent_emails(id, sequence_number, email_address, sent_at), email_queue(id, sequence_number, scheduled_at, status)),
          lead_replies(id, from_email, subject, body_preview, received_at, created_at)
        `)
        .eq('id', id!)
        .single();
      if (error) throw error;
      const companies = (data as unknown as { companies?: { contacts: (Contact & { email_candidates?: EmailCandidate[] })[] } | null }).companies;
      const contacts = companies?.contacts ?? [];
      const email_candidates = contacts.flatMap((c: Contact & { email_candidates?: EmailCandidate[] }) => c.email_candidates ?? []);
      return {
        ...data,
        contacts,
        email_candidates,
      } as Lead & {
        team: { id: string; name: string } | null;
        contacts: Contact[];
        email_candidates: Array<{ id: string; email_address: string; is_verified: boolean; seznam_status: string | null; qev_status: string | null }>;
        enrichment_log: Array<{ id: string; step: string; status: string; error_message: string | null; created_at: string }>;
        wave_leads: Array<{ id: string; wave_id: string; ab_variant: string; status: string; created_at: string; waves: { name: string; status: string; is_dummy: boolean; dummy_email: string | null }; sent_emails: Array<{ id: string; sequence_number: number; email_address: string; sent_at: string }>; email_queue: Array<{ id: string; sequence_number: number; scheduled_at: string; status: string }> }>;
        lead_replies: Array<{ id: string; from_email: string | null; subject: string | null; body_preview: string | null; received_at: string | null; created_at: string }>;
      };
    },
  });
}

export function useTeams() {
  const { isDemoMode } = useDemoMode();
  return useQuery<Team[]>({
    queryKey: ['teams'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_TEAMS }),
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      if (isDemoMode) return {} as Lead;
      const { data, error } = await supabase.from('leads').insert(lead).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['leads'] }); },
  });
}

export function useCreateLeadWithEmail() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (payload: {
      company_name: string;
      ico: string;
      website: string;
      contact_name: string;
      email: string;
      team_id: string;
      custom_fields?: Record<string, string>;
    }) => {
      if (isDemoMode) return { id: 'demo' };
      const domain = extractDomain(payload.website) || null;
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('ingest_lead', {
        p_company_name: payload.company_name,
        p_ico: payload.ico || null,
        p_website: payload.website || null,
        p_domain: domain,
        p_team_id: payload.team_id,
        p_status: 'ready',
        p_lead_type: 'company',
      });
      if (rpcErr) throw rpcErr;

      const leadId = rpcResult?.lead_id;
      if (!leadId) throw new Error('ingest_lead did not return a lead_id');

      const cf = payload.custom_fields && Object.keys(payload.custom_fields).length > 0
        ? payload.custom_fields : {};
      const { error: ue } = await supabase
        .from('leads')
        .update({ status: 'ready', custom_fields: cf })
        .eq('id', leadId);
      if (ue) throw ue;

      // Insert contact with company_id from RPC result
      const companyId = rpcResult?.company_id;
      if (!companyId) throw new Error('ingest_lead did not return a company_id');

      const { data: contact, error: ce } = await supabase
        .from('contacts')
        .insert({ company_id: companyId, full_name: payload.contact_name })
        .select()
        .single();
      if (ce) throw ce;

      const { error: ee } = await supabase
        .from('email_candidates')
        .insert({
          contact_id: contact.id,
          email_address: payload.email,
          is_verified: true,
          qev_status: 'manually_verified',
          seznam_status: 'likely_valid',
        });
      if (ee) throw ee;

      return { id: leadId };
    },
    onSuccess: () => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['companies'] });
      }
    },
  });
}

export function useDeleteLeads() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('leads').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => { if (!isDemoMode) qc.invalidateQueries({ queryKey: ['leads'] }); },
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('leads').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['leads', id] });
      }
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Lead> }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('leads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['leads', id] });
      }
    },
  });
}

export interface ReadyLeadGroup {
  groupId: string | null;
  groupName: string;
  source: string | null;
  createdAt: string | null;
  leads: Lead[];
}

export function useReadyLeadsByGroup() {
  const { isDemoMode } = useDemoMode();
  return useQuery<ReadyLeadGroup[]>({
    queryKey: ['ready-leads-by-group'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_READY_LEADS_BY_GROUP }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          import_groups:import_group_id(id, name, source, created_at),
          company_id,
          companies:companies!company_id(contacts(full_name, email_candidates:email_candidates!contact_id(email_address, is_verified)))
        `)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const grouped = new Map<string | null, ReadyLeadGroup>();
      for (const row of data ?? []) {
        const ig = (row as unknown as { import_groups: { id: string; name: string; source: string; created_at: string } | null }).import_groups;
        const gid = ig?.id ?? null;
        if (!grouped.has(gid)) {
          grouped.set(gid, {
            groupId: gid,
            groupName: ig?.name ?? 'Bez skupiny',
            source: ig?.source ?? null,
            createdAt: ig?.created_at ?? null,
            leads: [],
          });
        }
        grouped.get(gid)!.leads.push(row as Lead);
      }

      const result = Array.from(grouped.values());
      // "Bez skupiny" last
      result.sort((a, b) => {
        if (a.groupId === null) return 1;
        if (b.groupId === null) return -1;
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      });
      return result;
    },
    refetchInterval: 15000,
  });
}

export function useReadyLeads() {
  const { isDemoMode } = useDemoMode();
  const readyLeads = DEMO_LEADS.filter(l => ['ready', 'info_email', 'staff_email'].includes(l.status));
  return useQuery<Lead[]>({
    queryKey: ['ready-leads'],
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: readyLeads }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .in('status', ['ready', 'info_email', 'staff_email'])
        .order('company_name');
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    refetchInterval: 15000,
  });
}

export function useLeadsNotInWave(teamId: string | undefined, search?: string, language?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['leads-for-wave', teamId, search, language],
    enabled: isDemoMode ? !!teamId : !!teamId,
    ...(isDemoMode && { initialData: DEMO_LEADS_NOT_IN_WAVE }),
    queryFn: async () => {
      if (isDemoMode) return DEMO_LEADS_NOT_IN_WAVE;
      const { data: wlRows } = await supabase.from('wave_leads').select('lead_id').limit(10000);
      const usedIds = (wlRows ?? []).map((r: { lead_id: string }) => r.lead_id);

      let q = supabase
        .from('leads')
        .select('id, company_name, ico, website, language, status')
        .eq('team_id', teamId!)
        .in('status', ['ready', 'info_email', 'staff_email'])
        .neq('master_status', 'blacklisted')
        .order('company_name');

      if (search) q = q.or(`company_name.ilike.%${search}%,ico.ilike.%${search}%`);
      if (language) q = q.eq('language', language);
      if (usedIds.length > 0) q = q.not('id', 'in', `(${usedIds.join(',')})`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; company_name: string | null; ico: string | null; website: string | null; language: string }>;
    },
  });
}

export function useEmailCandidates(leadId: string | undefined) {
  const { isDemoMode } = useDemoMode();
  return useQuery<EmailCandidate[]>({
    queryKey: ['email-candidates', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      if (isDemoMode) return getDemoEmailCandidates(leadId!);
      const { data: lead } = await supabase.from('leads').select('company_id').eq('id', leadId!).single();
      if (!lead?.company_id) return [];
      const { data, error } = await supabase
        .from('email_candidates')
        .select('id,email_address,contact_id,seznam_status,qev_status,qev_checked_at,is_verified,is_catch_all,catch_all_confidence,created_at,contacts!contact_id!inner(company_id)')
        .eq('contacts.company_id', lead.company_id);
      if (error) throw error;
      return (data ?? []) as EmailCandidate[];
    },
  });
}

export function useVerifyCandidate() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase
        .from('email_candidates')
        .update({ is_verified: true, qev_status: 'manually_verified' })
        .eq('id', id);
      if (error) throw error;
      const { error: le } = await supabase
        .from('leads')
        .update({ status: 'ready', enrichment_error: null })
        .eq('id', leadId);
      if (le) throw le;
    },
    onSuccess: (_d, { leadId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['email-candidates', leadId] });
        qc.invalidateQueries({ queryKey: ['leads', leadId] });
        qc.invalidateQueries({ queryKey: ['leads'] });
      }
    },
  });
}

export function useUnverifyCandidate() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase
        .from('email_candidates')
        .update({ is_verified: false })
        .eq('id', id);
      if (error) throw error;
      const { data: leadRow } = await supabase.from('leads').select('company_id').eq('id', leadId).single();
      const { data: remaining } = leadRow?.company_id
        ? await supabase
          .from('email_candidates')
          .select('is_verified,is_catch_all,contacts!contact_id!inner(company_id)')
          .eq('contacts.company_id', leadRow.company_id)
        : { data: [] };
      const mine = (remaining ?? []) as { is_verified?: boolean; is_catch_all?: boolean }[];
      const hasVerified = mine.some((c: { is_verified?: boolean }) => c.is_verified === true);
      const hasCatchAll = mine.some((c: { is_catch_all?: boolean }) => c.is_catch_all === true);
      const newStatus = hasVerified ? 'ready' : hasCatchAll ? 'needs_review' : 'failed';
      const { error: le } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId);
      if (le) throw le;
    },
    onSuccess: (_d, { leadId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['email-candidates', leadId] });
        qc.invalidateQueries({ queryKey: ['leads', leadId] });
        qc.invalidateQueries({ queryKey: ['leads'] });
      }
    },
  });
}

export function useRemoveLeadFromWave() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ waveLeadId, leadId }: { waveLeadId: string; leadId: string }) => {
      if (isDemoMode) return;
      const { error: e1 } = await supabase.from('wave_leads').delete().eq('id', waveLeadId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('leads').update({ status: 'ready' }).eq('id', leadId);
      if (e2) throw e2;
    },
    onSuccess: (_data, { leadId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['leads', leadId] });
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['leads-for-wave'] });
      }
    },
  });
}

export function useUpdateLeadCustomFields() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, custom_fields }: { id: string; custom_fields: Record<string, string> }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('leads').update({ custom_fields }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['leads', id] });
      }
    },
  });
}

export function useMarkLeadProblematic() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ waveLeadId, leadId }: { waveLeadId: string; leadId: string; waveId: string }) => {
      if (isDemoMode) return;
      const { error: e1 } = await supabase.from('wave_leads').delete().eq('id', waveLeadId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('leads').update({ status: 'problematic' }).eq('id', leadId);
      if (e2) throw e2;
    },
    onSuccess: (_data, { waveId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['waves', waveId] });
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['leads'] });
      }
    },
  });
}
