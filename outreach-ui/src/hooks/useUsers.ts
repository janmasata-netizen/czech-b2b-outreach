import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseAuth } from '@/lib/supabase';
import type { Profile, Team } from '@/types/database';

export interface AppUser {
  id: string;
  email: string;
  created_at: string;
  profile: Profile & { team?: Team };
}

export function useUsers() {
  return useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 200 });
      if (authError) throw authError;

      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('*, team:teams(name)');
      if (profError) throw profError;

      const profileMap = new Map((profiles ?? []).map((p: Profile & { team?: Team }) => [p.id, p]));

      return (authData.users ?? []).map(u => ({
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
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;

      const { error: profError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name,
        team_id,
        is_admin,
        password_plain: password,
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
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await supabase.from('profiles').update({ password_plain: password }).eq('id', userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateOwnPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { error } = await supabaseAuth.auth.updateUser({ password });
      if (error) throw error;
      await supabase.from('profiles').update({ password_plain: password }).eq('id', userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
