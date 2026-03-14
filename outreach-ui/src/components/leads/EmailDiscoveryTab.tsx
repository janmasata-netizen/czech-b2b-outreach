import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useImportGroups } from '@/hooks/useImportGroups';
import StackedStatusBar from '@/components/shared/StackedStatusBar';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';
import type { ImportGroupStats } from '@/types/database';

function GroupCard({ group, onClick }: { group: ImportGroupStats; onClick: () => void }) {
  const { t } = useTranslation();

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
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
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>▶</span>
        </div>
      </div>

      <StackedStatusBar group={group} height={10} />

      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-dim)' }}>
          {group.total_leads} {t('importGroups.leads')}
        </span>
      </div>
    </div>
  );
}

export default function EmailDiscoveryTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: groups, isLoading } = useImportGroups();

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((group: ImportGroupStats) => (
        <GroupCard
          key={group.id}
          group={group}
          onClick={() => navigate(`/leady/skupiny/${group.id}`)}
        />
      ))}
    </div>
  );
}
