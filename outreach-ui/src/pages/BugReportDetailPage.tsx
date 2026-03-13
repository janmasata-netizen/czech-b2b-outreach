import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuthContext } from '@/components/AuthProvider';
import {
  useBugReport,
  useUpdateBugReportStatus,
  useAddBugReportNote,
  useDeleteBugReportNote,
  useAddBugReportTag,
  useRemoveBugReportTag,
  useBugReportTagSuggestions,
} from '@/hooks/useBugReport';
import { supabase } from '@/lib/supabase';
import type { BugReportStatus, BugReportSeverity } from '@/types/database';
import PageHeader from '@/components/layout/PageHeader';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';

const STATUSES: BugReportStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

const SEVERITY_COLORS: Record<BugReportSeverity, string> = {
  low: 'var(--text-dim)',
  medium: '#fbbf24',
  high: '#f97316',
  critical: '#f87171',
};

const STATUS_COLORS: Record<BugReportStatus, string> = {
  open: '#60a5fa',
  in_progress: '#fbbf24',
  resolved: 'var(--green)',
  closed: 'var(--text-muted)',
};

export default function BugReportDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();

  const { data: report, isLoading } = useBugReport(id);
  const updateStatus = useUpdateBugReportStatus();
  const addNote = useAddBugReportNote();
  const deleteNote = useDeleteBugReportNote();
  const addTag = useAddBugReportTag();
  const removeTag = useRemoveBugReportTag();
  const { data: tagSuggestions } = useBugReportTagSuggestions();

  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Load screenshot signed URL
  useEffect(() => {
    if (!report?.screenshot_url) return;
    supabase.storage
      .from('bug-screenshots')
      .createSignedUrl(report.screenshot_url, 600)
      .then(({ data }) => {
        if (data?.signedUrl) setScreenshotUrl(data.signedUrl);
      });
  }, [report?.screenshot_url]);

  if (isLoading) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24 }}>{t('common.loading')}</div>;
  }

  if (!report) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>Report not found</div>
        <GlassButton size="sm" onClick={() => navigate('/system?tab=reports')} style={{ marginTop: 12 }}>
          {t('bugReportDetail.backToReports')}
        </GlassButton>
      </div>
    );
  }

  const existingTagIds = new Set(report.bug_report_tags?.map(bt => bt.tag_id) ?? []);
  const filteredSuggestions = (tagSuggestions ?? []).filter(
    tag => !existingTagIds.has(tag.id) && tag.name.includes(tagInput.trim().toLowerCase())
  );

  function handleAddNote() {
    if (!noteText.trim() || !user?.id) return;
    addNote.mutate(
      { bugReportId: report!.id, authorId: user.id, content: noteText.trim() },
      { onSuccess: () => setNoteText('') },
    );
  }

  function handleAddTag(name: string) {
    if (!name.trim()) return;
    addTag.mutate({ bugReportId: report!.id, tagName: name });
    setTagInput('');
    setShowTagDropdown(false);
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  }

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
      {text}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <PageHeader
        title={report.title}
        subtitle={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            <span
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                color: SEVERITY_COLORS[report.severity],
                background: `${SEVERITY_COLORS[report.severity]}15`,
              }}
            >
              {t(`bugReport.severities.${report.severity}` as 'bugReport.severities.low')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {t(`bugReport.categories.${report.category}` as 'bugReport.categories.ui')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>•</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {t('bugReportDetail.reporter')}: {report.profiles?.full_name ?? '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>•</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('bugReportDetail.created')}: {new Date(report.created_at).toLocaleString('cs-CZ')}
            </span>
          </div>
        }
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={report.status}
              onChange={e => updateStatus.mutate({ id: report.id, status: e.target.value as BugReportStatus })}
              style={{
                padding: '5px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--bg-surface)',
                color: STATUS_COLORS[report.status],
              }}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{t(`bugReports.statuses.${s}` as 'bugReports.statuses.open')}</option>
              ))}
            </select>
            <GlassButton size="sm" onClick={() => navigate('/system?tab=reports')}>
              ← {t('bugReportDetail.backToReports')}
            </GlassButton>
          </div>
        }
      />

      {/* Description */}
      <GlassCard>
        {sectionTitle(t('bugReportDetail.description'))}
        <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {report.description}
        </div>
      </GlassCard>

      {/* Screenshot */}
      {report.screenshot_url && (
        <GlassCard>
          {sectionTitle(t('bugReportDetail.screenshot'))}
          {screenshotUrl ? (
            <a href={screenshotUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={screenshotUrl}
                alt="Screenshot"
                style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
              />
            </a>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
          )}
        </GlassCard>
      )}

      {/* Tags */}
      <GlassCard>
        {sectionTitle(t('bugReportDetail.tags'))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {report.bug_report_tags?.map(bt => (
            <span
              key={bt.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: (bt.tags?.color ?? '#666') + '20',
                color: bt.tags?.color ?? '#666',
                borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 500,
              }}
            >
              {bt.tags?.name}
              <button
                onClick={() => removeTag.mutate({ junctionId: bt.id, bugReportId: report.id })}
                style={{
                  background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
                  fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2, opacity: 0.7,
                }}
                title={t('common.delete')}
              >
                ×
              </button>
            </span>
          ))}

          {/* Tag input */}
          <div style={{ position: 'relative' }}>
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={e => { setTagInput(e.target.value); setShowTagDropdown(true); }}
              onFocus={() => setShowTagDropdown(true)}
              onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
              onKeyDown={handleTagKeyDown}
              placeholder={t('bugReportDetail.tagPlaceholder')}
              style={{
                padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-surface)', color: 'var(--text)', fontSize: 12, width: 140,
              }}
            />
            {showTagDropdown && filteredSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 6, padding: 4, zIndex: 10, minWidth: 160, maxHeight: 200, overflowY: 'auto',
              }}>
                {filteredSuggestions.slice(0, 10).map(tag => (
                  <div
                    key={tag.id}
                    onMouseDown={(e) => { e.preventDefault(); handleAddTag(tag.name); }}
                    style={{
                      padding: '5px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                      color: tag.color, display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0,
                    }} />
                    {tag.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Admin Notes */}
      <GlassCard>
        {sectionTitle(t('bugReportDetail.notes'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(!report.bug_report_notes || report.bug_report_notes.length === 0) && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
              {t('bugReportDetail.noNotes')}
            </div>
          )}
          {report.bug_report_notes
            ?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(note => (
              <div
                key={note.id}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    <span style={{ fontWeight: 600 }}>{note.profiles?.full_name ?? '—'}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      {new Date(note.created_at).toLocaleString('cs-CZ')}
                    </span>
                  </div>
                  {user?.id === note.author_id && (
                    <button
                      onClick={() => deleteNote.mutate({ noteId: note.id, bugReportId: report.id })}
                      style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', fontSize: 11, padding: '2px 6px',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      {t('bugReportDetail.deleteNote')}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {note.content}
                </div>
              </div>
            ))}

          {/* Add note form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder={t('bugReportDetail.notePlaceholder')}
              rows={3}
              style={{
                padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-surface)', color: 'var(--text)', fontSize: 13,
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
            <div>
              <GlassButton
                variant="primary"
                size="sm"
                disabled={!noteText.trim() || addNote.isPending}
                onClick={handleAddNote}
              >
                {addNote.isPending ? t('common.saving') : t('bugReportDetail.addNote')}
              </GlassButton>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
