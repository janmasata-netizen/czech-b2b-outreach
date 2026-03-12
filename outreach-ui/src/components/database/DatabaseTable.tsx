import { useNavigate } from 'react-router-dom';
import type { Company, Contact, EmailCandidate } from '@/types/database';
import TagBadge from './TagBadge';
import MasterStatusBadge from './MasterStatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import { formatDate, extractDomain } from '@/lib/utils';
import { Mail, Phone, Linkedin, Users } from 'lucide-react';

type CompanyWithTags = Company & { tags: Array<{ id: string; name: string; color: string }> };

interface DatabaseTableProps {
  companies: CompanyWithTags[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  isLoading?: boolean;
}

export default function DatabaseTable({ companies, selected, onToggle, onToggleAll, isLoading }: DatabaseTableProps) {
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

  if (!companies.length) {
    return <EmptyState icon="◈" title="Žádné firmy" description="Přidejte firmy nebo změňte filtry" />;
  }

  const allSelected = companies.length > 0 && companies.every(c => selected.includes(c.id));

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
            <th style={th}>Kontakty</th>
            <th style={th}>Kontaktní info</th>
            <th style={th}>Štítky</th>
            <th style={th}>CRM stav</th>
            <th style={th}>Přidáno</th>
          </tr>
        </thead>
        <tbody>
          {companies.map(company => {
            const checked = selected.includes(company.id);
            const contacts = company.contacts ?? [];
            const contactCount = contacts.length;
            const emails = contacts.flatMap((c: Contact & { email_candidates?: EmailCandidate[] }) => c.email_candidates ?? []);
            const hasEmail = emails.length > 0;
            const hasPhone = contacts.some((c: Contact) => c.phone);
            const hasLinkedin = contacts.some((c: Contact) => c.linkedin);
            const tags = company.tags ?? [];

            return (
              <tr
                key={company.id}
                onClick={() => navigate(`/databaze/${company.id}`)}
                style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ ...td, width: 36 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(company.id)} />
                </td>
                <td style={{ ...td, fontWeight: 500 }}>{company.company_name ?? '—'}</td>
                <td style={{ ...td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{company.ico ?? '—'}</td>
                <td style={td}>{company.domain ? extractDomain(company.domain) : company.website ? extractDomain(company.website) : '—'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Users size={13} style={{ color: 'var(--text-muted)' }} />
                    <span>{contactCount}</span>
                  </div>
                </td>
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
                  <MasterStatusBadge status={company.master_status ?? 'active'} />
                </td>
                <td style={{ ...td, fontSize: 12, color: 'var(--text-dim)' }}>{formatDate(company.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
