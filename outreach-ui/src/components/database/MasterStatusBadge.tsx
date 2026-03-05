import type { MasterStatus } from '@/types/database';

const STATUS_MAP: Record<MasterStatus, { label: string; bg: string; border: string; text: string }> = {
  active:      { label: 'Aktivní',       bg: 'rgba(62,207,142,0.1)',  border: 'rgba(62,207,142,0.25)',  text: '#3ECF8E' },
  blacklisted: { label: 'Blacklist',     bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', text: '#f87171' },
  archived:    { label: 'Archivováno',   bg: 'rgba(82,82,91,0.15)',   border: 'rgba(82,82,91,0.3)',     text: '#71717a' },
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
