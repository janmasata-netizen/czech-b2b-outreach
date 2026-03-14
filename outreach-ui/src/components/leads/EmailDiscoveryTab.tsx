import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useImportGroups } from '@/hooks/useImportGroups';
import ImportGroupDetail from '@/components/leads/ImportGroupDetail';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';
import type { ImportGroupStats } from '@/types/database';

const COLORS = {
  ready:      '#3ecf8e',
  backup:     '#22d3ee',
  failed:     '#f87171',
  inProgress: '#a78bfa',
};

function SegmentedBar({ group }: { group: ImportGroupStats }) {
  const total = group.total_leads;
  if (total === 0) return null;
  const segments = [
    { count: group.ready_count, color: COLORS.ready },
    { count: group.backup_count, color: COLORS.backup },
    { count: group.failed_count, color: COLORS.failed },
    { count: group.in_progress_count, color: COLORS.inProgress },
  ].filter(s => s.count > 0);

  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', width: '100%' }}>
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{
            width: `${(seg.count / total) * 100}%`,
            background: seg.color,
            transition: 'width 0.5s ease',
          }}
        />
      ))}
    </div>
  );
}

function GroupCard({ group, isExpanded, onClick }: { group: ImportGroupStats; isExpanded: boolean; onClick: () => void }) {
  const { t } = useTranslation();

  return (
    <div
      onClick={onClick}
      style={{
        background: isExpanded ? 'rgba(99,102,241,0.04)' : 'var(--bg-surface)',
        border: `1px solid ${isExpanded ? 'rgba(99,102,241,0.25)' : 'var(--border)'}`,
        borderRadius: 10,
        padding: '16px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{group.name}</span>
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 4,
            background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontWeight: 500,
          }}>
            {group.source === 'gsheet' ? 'GSheet' : 'CSV'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
            {formatDate(group.created_at)}
          </span>
          <span style={{
            fontSize: 12, color: 'var(--text-dim)',
            transform: isExpanded ? 'rotate(90deg)' : 'none',
            display: 'inline-block', transition: 'transform 0.15s',
          }}>
            ▶
          </span>
        </div>
      </div>

      <SegmentedBar group={group} />

      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-dim)' }}>
          {group.total_leads} {t('importGroups.leads')}
        </span>
        {group.ready_count > 0 && (
          <span style={{ color: COLORS.ready }}>
            ■ {group.ready_count} {t('importGroups.found')}
          </span>
        )}
        {group.backup_count > 0 && (
          <span style={{ color: COLORS.backup }}>
            ■ {group.backup_count} {t('importGroups.info')}
          </span>
        )}
        {group.failed_count > 0 && (
          <span style={{ color: COLORS.failed }}>
            ■ {group.failed_count} {t('importGroups.notFound')}
          </span>
        )}
        {group.in_progress_count > 0 && (
          <span style={{ color: COLORS.inProgress }}>
            ■ {group.in_progress_count} {t('importGroups.inProgress')}
          </span>
        )}
      </div>
    </div>
  );
}

export default function EmailDiscoveryTab() {
  const { t } = useTranslation();
  const { data: groups, isLoading } = useImportGroups();
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  if (isLoading) return <TableSkeleton rows={4} />;

  if (!groups || groups.length === 0) {
    return (
      <EmptyState
        icon="📦"
        title={t('importGroups.noImports')}
        description={t('importGroups.noImportsDesc')}
      />
    );
  }

  const expandedGroup = groups.find(g => g.id === expandedGroupId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((group: ImportGroupStats) => (
        <div key={group.id}>
          <GroupCard
            group={group}
            isExpanded={expandedGroupId === group.id}
            onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
          />
          {expandedGroupId === group.id && expandedGroup && (
            <ImportGroupDetail
              group={expandedGroup}
              onClose={() => setExpandedGroupId(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
