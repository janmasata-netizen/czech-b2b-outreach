import { LEAD_STATUS_MAP, WAVE_STATUS_MAP, STATUS_COLOR_MAP } from '@/lib/constants';
import type { LeadStatus, WaveStatus } from '@/types/database';

const STATUS_ICON_MAP: Record<string, string> = {
  green: '✓',
  accent: '✓',
  red: '✗',
  yellow: '⚠',
  orange: '⚠',
  blue: 'ℹ',
  cyan: 'ℹ',
  purple: '◴',
  muted: '●',
};

interface StatusBadgeProps {
  status: LeadStatus | WaveStatus | string;
  type?: 'lead' | 'wave';
}

export default function StatusBadge({ status, type = 'lead' }: StatusBadgeProps) {
  const map = type === 'wave' ? WAVE_STATUS_MAP : LEAD_STATUS_MAP;
  const entry = (map as Record<string, { label: string; color: string }>)[status];
  const label = entry?.label ?? status;
  const colorKey = entry?.color ?? 'muted';
  const colors = STATUS_COLOR_MAP[colorKey] ?? STATUS_COLOR_MAP.muted;

  return (
    <span
      className="status-badge"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
        background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
        letterSpacing: '0.02em', whiteSpace: 'nowrap',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <span style={{ fontSize: 9, lineHeight: 1, flexShrink: 0 }}>{STATUS_ICON_MAP[colorKey] ?? '●'}</span>
      {label}
    </span>
  );
}
