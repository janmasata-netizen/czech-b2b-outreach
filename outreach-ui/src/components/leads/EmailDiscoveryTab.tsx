import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeads } from '@/hooks/useLeads';
import { LEAD_STATUS_MAP } from '@/lib/constants';
import { formatDate, formatRelative } from '@/lib/utils';
import StatusBadge from '@/components/shared/StatusBadge';
import Pagination from '@/components/shared/Pagination';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import type { LeadStatus } from '@/types/database';
import { PAGE_SIZE } from '@/lib/constants';

const DISCOVERY_STATUSES: LeadStatus[] = [
  'new', 'enriching', 'enriched', 'email_discovery', 'email_verified', 'needs_review', 'failed',
];

const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function isStalled(lead: any): boolean {
  if (lead.status !== 'email_discovery') return false;
  const updated = lead.updated_at ?? lead.created_at;
  if (!updated) return false;
  return Date.now() - new Date(updated).getTime() > STALL_THRESHOLD_MS;
}

const TH: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
};

export default function EmailDiscoveryTab() {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useLeads({ statuses: DISCOVERY_STATUSES }, page);
  const leads = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) return <TableSkeleton rows={8} />;

  if (!leads.length) {
    return (
      <EmptyState
        icon="✉"
        title="Žádné leady ve zpracování"
        description="Leady procházející obohacením a hledáním e-mailu se zobrazí zde."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {total.toLocaleString('cs-CZ')} leadů ve zpracování
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Firma', 'IČO', 'Stav', 'Přidáno', 'Čas ve stavu', ''].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: any) => {
                const stalled = isStalled(lead);
                const actionNeeded = lead.status === 'needs_review' || lead.status === 'failed';

                return (
                  <tr
                    key={lead.id}
                    className="glass-table-row"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: stalled ? 'rgba(251,146,60,0.04)' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/leady/${lead.id}`)}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                        {lead.company_name ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>
                      {lead.ico ?? '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <StatusBadge status={lead.status} />
                      {stalled && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#fb923c', fontWeight: 600 }}>
                          ⚠ Zastaveno
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
                      {formatDate(lead.created_at)}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: stalled ? '#fb923c' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
                      {formatRelative(lead.updated_at ?? lead.created_at)}
                    </td>
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      {actionNeeded && (
                        <button
                          onClick={() => navigate(`/leady/${lead.id}`)}
                          style={{
                            fontSize: 12, padding: '3px 10px', borderRadius: 4,
                            border: '1px solid rgba(251,146,60,0.35)',
                            background: 'rgba(251,146,60,0.08)',
                            color: '#fb923c', cursor: 'pointer', fontWeight: 500,
                          }}
                        >
                          {lead.status === 'needs_review' ? 'Zkontrolovat' : 'Zobrazit'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPage={setPage}
        totalItems={total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
