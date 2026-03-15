import { useTranslation } from 'react-i18next';
import type { ImportGroupStats } from '@/types/database';

const COLORS = {
  ready:      '#3ecf8e',
  backup:     '#22d3ee',
  failed:     '#f87171',
  inProgress: '#f59e0b',
};

interface StackedStatusBarProps {
  group: ImportGroupStats;
  height?: number;
  showLegend?: boolean;
  showCounts?: boolean;
}

export default function StackedStatusBar({ group, height = 12, showLegend, showCounts }: StackedStatusBarProps) {
  const { t } = useTranslation();
  const total = group.total_leads;
  if (total === 0) return null;

  const segments = [
    { count: group.ready_count, color: COLORS.ready, label: t('importGroups.found') },
    { count: group.backup_count, color: COLORS.backup, label: t('importGroups.info') },
    { count: group.failed_count, color: COLORS.failed, label: t('importGroups.notFound') },
    { count: group.in_progress_count, color: COLORS.inProgress, label: t('importGroups.inProgress') },
  ];

  const activeSegments = segments.filter(s => s.count > 0);

  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: height / 2, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', width: '100%' }}>
        {activeSegments.map((seg, i) => (
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
      {showLegend && (
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
          {segments.filter(s => s.count > 0 || showCounts).map((seg, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, color: seg.count > 0 ? seg.color : 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, display: 'inline-block' }} />
              {showCounts ? `${seg.count} ${seg.label}` : seg.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
