import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useRealtime(teamId?: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    const teamFilter = teamId ? `team_id=eq.${teamId}` : undefined;

    const channel = supabase
      .channel(`realtime-${teamId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', ...(teamFilter && { filter: teamFilter }) }, () => {
        qc.invalidateQueries({ queryKey: ['leads'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wave_leads' }, () => {
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_queue' }, () => {
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sent_emails' }, () => {
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_replies' }, () => {
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waves', ...(teamFilter && { filter: teamFilter }) }, () => {
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc, teamId]);
}
