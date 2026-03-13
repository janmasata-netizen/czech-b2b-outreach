import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Lead, LeadFilters, Team, EmailCandidate, Contact } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';
import { extractDomain } from '@/lib/dedup';

export function useLeads(filters: LeadFilters = {}, page = 1) {
  return useQuery({
    queryKey: ['leads', filters, page],
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
  return useQuery({
    queryKey: ['leads', id],
    enabled: !!id,
    queryFn: async () => {
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
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      const { data, error } = await supabase.from('leads').insert(lead).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useCreateLeadWithEmail() {
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('leads').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('leads').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads', id] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Lead> }) => {
      const { error } = await supabase.from('leads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads', id] });
    },
  });
}

export function useLeadsNotInWave(teamId: string | undefined, search?: string, language?: string) {
  return useQuery({
    queryKey: ['leads-for-wave', teamId, search, language],
    enabled: !!teamId,
    queryFn: async () => {
      const { data: wlRows } = await supabase.from('wave_leads').select('lead_id').limit(10000);
      const usedIds = (wlRows ?? []).map((r: { lead_id: string }) => r.lead_id);

      let q = supabase
        .from('leads')
        .select('id, company_name, ico, website, language')
        .eq('team_id', teamId!)
        .neq('status', 'problematic')
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
  return useQuery<EmailCandidate[]>({
    queryKey: ['email-candidates', leadId],
    enabled: !!leadId,
    queryFn: async () => {
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
  return useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string }) => {
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
      qc.invalidateQueries({ queryKey: ['email-candidates', leadId] });
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUnverifyCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string }) => {
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
      qc.invalidateQueries({ queryKey: ['email-candidates', leadId] });
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useRemoveLeadFromWave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ waveLeadId, leadId }: { waveLeadId: string; leadId: string }) => {
      const { error: e1 } = await supabase.from('wave_leads').delete().eq('id', waveLeadId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('leads').update({ status: 'ready' }).eq('id', leadId);
      if (e2) throw e2;
    },
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
      qc.invalidateQueries({ queryKey: ['waves'] });
      qc.invalidateQueries({ queryKey: ['leads-for-wave'] });
    },
  });
}

export function useUpdateLeadCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, custom_fields }: { id: string; custom_fields: Record<string, string> }) => {
      const { error } = await supabase.from('leads').update({ custom_fields }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads', id] });
    },
  });
}

export function useMarkLeadProblematic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ waveLeadId, leadId }: { waveLeadId: string; leadId: string; waveId: string }) => {
      const { error: e1 } = await supabase.from('wave_leads').delete().eq('id', waveLeadId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('leads').update({ status: 'problematic' }).eq('id', leadId);
      if (e2) throw e2;
    },
    onSuccess: (_data, { waveId }) => {
      qc.invalidateQueries({ queryKey: ['waves', waveId] });
      qc.invalidateQueries({ queryKey: ['waves'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
