import { useNavigate } from 'react-router-dom';
import type { Lead } from '@/types/database';
import TagBadge from './TagBadge';
import MasterStatusBadge from './MasterStatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import { formatDate, extractDomain } from '@/lib/utils';
import { Mail, Phone, Linkedin } from 'lucide-react';

type LeadWithTags = Lead & { tags: Array<{ id: string; name: string; color: string }> };

interface DatabaseTableProps {
  leads: LeadWithTags[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  isLoading?: boolean;
}

export default function DatabaseTable({ leads, selected, onToggle, onToggleAll, isLoading }: DatabaseTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: 44, background: 'var(--bg-surface)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    );
  }

  if (!leads.length) {
    return <EmptyState icon="◈" title="Žádné záznamy" description="Přidejte leady nebo změňte filtry" />;
  }

  const allSelected = leads.length > 0 && leads.every(l => selected.includes(l.id));

  const th: React.CSSProperties = {
    padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  };
  const td: React.CSSProperties = {
    padding: '8px 10px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 36 }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            </th>
            <th style={th}>Firma</th>
            <th style={th}>IČO</th>
            <th style={th}>Doména</th>
            <th style={th}>Kontaktní osoba</th>
            <th style={th}>Kontakty</th>
            <th style={th}>Štítky</th>
            <th style={th}>CRM stav</th>
            <th style={th}>Přidáno</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => {
            const checked = selected.includes(lead.id);
            const jednatels = lead.jednatels ?? [];
            const firstJed = jednatels[0];
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const emails = jednatels.flatMap((j: any) => j.email_candidates ?? []);
            const hasEmail = emails.length > 0;
            const hasPhone = jednatels.some((j: any) => j.phone);
            const hasLinkedin = jednatels.some((j: any) => j.linkedin);
            /* eslint-enable @typescript-eslint/no-explicit-any */
            const tags = lead.tags ?? [];

            return (
              <tr
                key={lead.id}
                onClick={() => navigate(`/leady/${lead.id}`)}
                style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ ...td, width: 36 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(lead.id)} />
                </td>
                <td style={{ ...td, fontWeight: 500 }}>{lead.company_name ?? '—'}</td>
                <td style={{ ...td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{lead.ico ?? '—'}</td>
                <td style={td}>{lead.domain ? extractDomain(lead.domain) : lead.website ? extractDomain(lead.website) : '—'}</td>
                <td style={td}>{firstJed?.full_name ?? '—'}</td>
                <td style={{ ...td, maxWidth: 100 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {hasEmail && <Mail size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />}
                    {hasPhone && <Phone size={13} style={{ color: '#fb923c', flexShrink: 0 }} />}
                    {hasLinkedin && <Linkedin size={13} style={{ color: '#22d3ee', flexShrink: 0 }} />}
                    {!hasEmail && !hasPhone && !hasLinkedin && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </div>
                </td>
                <td style={{ ...td, maxWidth: 220 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
                    {tags.slice(0, 3).map(t => (
                      <TagBadge key={t.id} name={t.name} color={t.color} />
                    ))}
                    {tags.length > 3 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>+{tags.length - 3}</span>
                    )}
                  </div>
                </td>
                <td style={td}>
                  <MasterStatusBadge status={lead.master_status ?? 'active'} />
                </td>
                <td style={{ ...td, fontSize: 12, color: 'var(--text-dim)' }}>{formatDate(lead.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
