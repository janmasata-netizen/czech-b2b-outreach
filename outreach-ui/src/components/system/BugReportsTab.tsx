import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useBugReports, useUpdateBugReportStatus } from '@/hooks/useBugReport';
import GlassCard from '@/components/glass/GlassCard';
import type { BugReportSeverity, BugReportCategory, BugReportStatus } from '@/types/database';

const SEVERITIES: BugReportSeverity[] = ['low', 'medium', 'high', 'critical'];
const CATEGORIES: BugReportCategory[] = ['ui', 'emails', 'enrichment', 'waves', 'system', 'other'];
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

export default function BugReportsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [severity, setSeverity] = useState<BugReportSeverity | ''>('');
  const [category, setCategory] = useState<BugReportCategory | ''>('');
  const [status, setStatus] = useState<BugReportStatus | ''>('');

  const { data: reports, isLoading } = useBugReports({
    severity: severity || undefined,
    category: category || undefined,
    status: status || undefined,
  });
  const updateStatus = useUpdateBugReportStatus();

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-surface)', color: 'var(--text)', fontSize: 12,
  };

  if (isLoading) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24 }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={severity} onChange={e => setSeverity(e.target.value as BugReportSeverity | '')} style={selectStyle}>
          <option value="">{t('bugReports.allSeverities')}</option>
          {SEVERITIES.map(s => (
            <option key={s} value={s}>{t(`bugReport.severities.${s}` as 'bugReport.severities.low')}</option>
          ))}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value as BugReportCategory | '')} style={selectStyle}>
          <option value="">{t('bugReports.allCategories')}</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{t(`bugReport.categories.${c}` as 'bugReport.categories.ui')}</option>
          ))}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value as BugReportStatus | '')} style={selectStyle}>
          <option value="">{t('bugReports.allStatuses')}</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{t(`bugReports.statuses.${s}` as 'bugReports.statuses.open')}</option>
          ))}
        </select>
      </div>

      {/* Reports list */}
      {!reports?.length ? (
        <GlassCard padding={24}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dim)' }}>{t('bugReports.noReports')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t('bugReports.noReportsDesc')}</div>
          </div>
        </GlassCard>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['title', 'severity', 'category', 'reporter', 'date', 'status'].map(col => (
                  <th key={col} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500 }}>
                    {t(`bugReports.tableHeaders.${col}` as 'bugReports.tableHeaders.title')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map(report => (
                <tr
                  key={report.id}
                  onClick={() => navigate(`/system/reports/${report.id}`)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '8px 10px', color: 'var(--text)', fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {report.title}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      color: SEVERITY_COLORS[report.severity],
                      background: `${SEVERITY_COLORS[report.severity]}15`,
                    }}>
                      {t(`bugReport.severities.${report.severity}` as 'bugReport.severities.low')}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>
                    {t(`bugReport.categories.${report.category}` as 'bugReport.categories.ui')}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>
                    {report.profiles?.full_name ?? '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 11 }}>
                    {new Date(report.created_at).toLocaleString('cs-CZ')}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select
                      value={report.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateStatus.mutate({ id: report.id, status: e.target.value as BugReportStatus })}
                      style={{
                        padding: '3px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        border: '1px solid var(--border)', background: 'var(--bg-surface)',
                        color: STATUS_COLORS[report.status],
                      }}
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{t(`bugReports.statuses.${s}` as 'bugReports.statuses.open')}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
