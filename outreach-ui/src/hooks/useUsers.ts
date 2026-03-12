import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseAuth } from '@/lib/supabase';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import type { Profile, Team } from '@/types/database';

export interface AppUser {
  id: string;
  email: string;
  created_at: string;
  profile: Profile & { team?: Team };
}

async function adminApi(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabaseAuth.auth.getSession();
  const res = await fetch(n8nWebhookUrl('admin-users'), {
    method: 'POST',
    headers: n8nHeaders(
      session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}
    ),
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Admin API failed (${res.status})`);
  return data;
}

export function useUsers() {
  return useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const data = await adminApi('list');

      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('*, team:teams(name, daily_send_limit, sends_today, is_active)');
      if (profError) throw profError;

      const profileMap = new Map((profiles ?? []).map((p: Profile & { team?: Team }) => [p.id, p]));

      return (data.users ?? []).map((u: { id: string; email?: string; created_at: string }) => ({
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at,
        profile: profileMap.get(u.id) ?? { id: u.id, team_id: null, full_name: null, is_admin: false },
      }));
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      email, password, full_name, team_id, is_admin,
    }: {
      email: string;
      password: string;
      full_name: string;
      team_id: string;
      is_admin: boolean;
    }) => {
      const data = await adminApi('create', { email, password });

      const { error: profError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name,
        team_id,
        is_admin,
      });
      if (profError) throw profError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await adminApi('delete', { userId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      await adminApi('updatePassword', { userId, password });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, full_name, team_id, is_admin }: {
      id: string; full_name: string; team_id: string | null; is_admin: boolean;
    }) => {
      const { error } = await supabase.from('profiles').update({ full_name, team_id, is_admin }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateOwnPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ password }: { userId: string; password: string }) => {
      const { error } = await supabaseAuth.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
