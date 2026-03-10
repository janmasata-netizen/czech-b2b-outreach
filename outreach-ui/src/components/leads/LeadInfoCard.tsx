import type { Lead } from '@/types/database';
import GlassCard from '@/components/glass/GlassCard';
import StatusBadge from '@/components/shared/StatusBadge';
import MasterStatusBadge from '@/components/database/MasterStatusBadge';
import { formatDate, extractDomain } from '@/lib/utils';

interface LeadInfoCardProps {
  lead: Lead & { team?: { name: string } | null };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{value ?? '—'}</span>
    </div>
  );
}

export default function LeadInfoCard({ lead }: LeadInfoCardProps) {
  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Základní informace</h3>
      <Row label="Firma" value={lead.company_name} />
      <Row label="IČO" value={<span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{lead.ico}</span>} />
      <Row label="Web" value={lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>{extractDomain(lead.website)}</a> : null} />
      <Row label="Stav" value={<StatusBadge status={lead.status ?? 'new'} />} />
      <Row label="CRM stav" value={<MasterStatusBadge status={lead.master_status ?? 'active'} />} />
      <Row label="Tým" value={lead.team?.name ?? lead.team_id ?? '—'} />
      <Row label="Přidáno" value={formatDate(lead.created_at)} />
      <Row label="Aktualizováno" value={formatDate(lead.updated_at)} />
    </GlassCard>
  );
}
