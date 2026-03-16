import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Contact } from '@/types/database';
import { useDemoMode } from '@/contexts/DemoModeContext';

export function useCreateContact() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async (contact: Partial<Contact> & { company_id: string }) => {
      if (isDemoMode) return {} as Contact;
      const { data, error } = await supabase.from('contacts').insert(contact).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['companies', vars.company_id] });
        qc.invalidateQueries({ queryKey: ['companies'] });
      }
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; companyId: string; updates: Partial<Contact> }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('contacts').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { companyId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['companies', companyId] });
        qc.invalidateQueries({ queryKey: ['companies'] });
        qc.invalidateQueries({ queryKey: ['master-leads'] });
        qc.invalidateQueries({ queryKey: ['leads'] });
      }
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({ id }: { id: string; companyId: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { companyId }) => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['companies', companyId] });
        qc.invalidateQueries({ queryKey: ['companies'] });
      }
    },
  });
}
