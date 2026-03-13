import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BugReport, BugReportSeverity, BugReportCategory, BugReportStatus } from '@/types/database';

interface SubmitBugReport {
  title: string;
  description: string;
  severity: BugReportSeverity;
  category: BugReportCategory;
  screenshotFile?: File | null;
  reporterId: string;
}

export function useSubmitBugReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, description, severity, category, screenshotFile, reporterId }: SubmitBugReport) => {
      let screenshot_url: string | null = null;

      if (screenshotFile) {
        const ext = screenshotFile.name.split('.').pop() || 'png';
        const path = `${reporterId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('bug-screenshots')
          .upload(path, screenshotFile, { contentType: screenshotFile.type });
        if (uploadErr) throw uploadErr;
        screenshot_url = path;
      }

      const { data, error } = await supabase
        .from('bug_reports')
        .insert({ title, description, severity, category, screenshot_url, reporter_id: reporterId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
    },
  });
}

interface BugReportFilters {
  severity?: BugReportSeverity;
  category?: BugReportCategory;
  status?: BugReportStatus;
}

export function useBugReports(filters: BugReportFilters = {}) {
  return useQuery<BugReport[]>({
    queryKey: ['bug-reports', filters],
    queryFn: async () => {
      let q = supabase
        .from('bug_reports')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });

      if (filters.severity) q = q.eq('severity', filters.severity);
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.status) q = q.eq('status', filters.status);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateBugReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BugReportStatus }) => {
      const { error } = await supabase
        .from('bug_reports')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
    },
  });
}
