import type { MasterStatus } from '@/types/database';

const STATUS_MAP: Record<MasterStatus, { label: string; bg: string; border: string; text: string }> = {
  active:      { label: 'Aktivní',       bg: 'rgba(62,207,142,0.18)',  border: 'rgba(62,207,142,0.45)',  text: '#34b87a' },
  blacklisted: { label: 'Blacklist',     bg: 'rgba(239,68,68,0.18)',   border: 'rgba(239,68,68,0.45)',   text: '#ef4444' },
  archived:    { label: 'Archivováno',   bg: 'rgba(82,82,91,0.2)',     border: 'rgba(82,82,91,0.4)',     text: '#71717a' },
};

export default function MasterStatusBadge({ status }: { status: MasterStatus | string }) {
  const entry = STATUS_MAP[status as MasterStatus] ?? STATUS_MAP.active;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
        background: entry.bg, border: `1px solid ${entry.border}`, color: entry.text,
        letterSpacing: '0.02em', whiteSpace: 'nowrap',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: entry.text, flexShrink: 0 }} />
      {entry.label}
    </span>
  );
}
