import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BugReport, BugReportSeverity, BugReportCategory, BugReportStatus, Tag } from '@/types/database';

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
      qc.invalidateQueries({ queryKey: ['bug-report'] });
    },
  });
}

// ── Single bug report with notes, tags, profiles ──

export function useBugReport(id: string | undefined) {
  return useQuery<BugReport | null>({
    queryKey: ['bug-report', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('*, profiles(full_name), bug_report_notes(*, profiles(full_name)), bug_report_tags(*, tags(id, name, color))')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// ── Admin notes CRUD ──

export function useAddBugReportNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bugReportId, authorId, content }: { bugReportId: string; authorId: string; content: string }) => {
      const { data, error } = await supabase
        .from('bug_report_notes')
        .insert({ bug_report_id: bugReportId, author_id: authorId, content })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['bug-report', vars.bugReportId] });
    },
  });
}

export function useDeleteBugReportNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId }: { noteId: string; bugReportId: string }) => {
      const { error } = await supabase
        .from('bug_report_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['bug-report', vars.bugReportId] });
    },
  });
}

// ── Tag CRUD ──

export function useAddBugReportTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bugReportId, tagName }: { bugReportId: string; tagName: string }) => {
      const normalizedName = tagName.trim().toLowerCase();
      const { data: existingTag } = await supabase
        .from('tags')
        .select('id')
        .eq('name', normalizedName)
        .maybeSingle();

      let tagId: string;
      if (existingTag) {
        tagId = existingTag.id;
      } else {
        const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4', '#f97316', '#6366f1', '#ef4444', '#ec4899', '#14b8a6'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const { data: newTag, error: tagErr } = await supabase
          .from('tags')
          .insert({ name: normalizedName, color, team_id: null })
          .select('id')
          .single();
        if (tagErr) throw tagErr;
        tagId = newTag.id;
      }

      const { error } = await supabase
        .from('bug_report_tags')
        .insert({ bug_report_id: bugReportId, tag_id: tagId });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['bug-report', vars.bugReportId] });
      qc.invalidateQueries({ queryKey: ['bug-report-tag-suggestions'] });
    },
  });
}

export function useRemoveBugReportTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ junctionId }: { junctionId: string; bugReportId: string }) => {
      const { error } = await supabase
        .from('bug_report_tags')
        .delete()
        .eq('id', junctionId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['bug-report', vars.bugReportId] });
    },
  });
}

export function useBugReportTagSuggestions() {
  return useQuery<Tag[]>({
    queryKey: ['bug-report-tag-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .is('team_id', null)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
