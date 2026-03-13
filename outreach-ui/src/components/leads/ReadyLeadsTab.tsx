import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLeads } from '@/hooks/useLeads';
import { extractDomain } from '@/lib/utils';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import Pagination from '@/components/shared/Pagination';
import GlassButton from '@/components/glass/GlassButton';
import PushToWaveDialog from '@/components/leads/PushToWaveDialog';
import { PAGE_SIZE } from '@/lib/constants';
import type { Lead } from '@/types/database';

const TH: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
};

export default function ReadyLeadsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [pushIds, setPushIds] = useState<string[] | null>(null);

  const { data, isLoading } = useLeads({ status: 'ready' }, page);
  const leads = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    setSelected(e.target.checked ? leads.map((l: { id: string }) => l.id) : []);
  }

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  if (isLoading) return <TableSkeleton rows={8} />;

  if (!leads.length && page === 1) {
    return (
      <EmptyState
        icon="◎"
        title={t('leads.noReadyLeads')}
        description={t('leads.noReadyLeadsDesc')}
        action={<GlassButton variant="secondary" onClick={() => navigate('/leady?new=1')}>+ {t('leads.addLeadShort')}</GlassButton>}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Bulk action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('leads.readyLeadsCount', { count: total })}
        </div>
        {selected.length > 0 && (
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => setPushIds(selected)}
          >
            {t('leads.addCountToWave', { count: selected.length })}
          </GlassButton>
        )}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 40, padding: '9px 12px' }}>
                  <input
                    type="checkbox"
                    checked={selected.length === leads.length && leads.length > 0}
                    onChange={toggleAll}
                    style={{ accentColor: 'var(--green)' }}
                  />
                </th>
                {[t('leads.tableHeaders.company'), t('leads.tableHeaders.ico'), t('leads.tableHeaders.domain'), t('leads.tableHeaders.web'), ''].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: Lead) => {
                const isSelected = selected.includes(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className="glass-table-row"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'rgba(62,207,142,0.05)' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/leady/${lead.id}`)}
                  >
                    <td style={{ padding: '11px 12px' }} onClick={e => { e.stopPropagation(); toggle(lead.id); }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(lead.id)}
                        style={{ accentColor: 'var(--green)' }}
                      />
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                        {lead.company_name ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>
                      {lead.ico ?? '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-dim)' }}>
                      {lead.domain ?? (lead.website ? extractDomain(lead.website) : '—')}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {lead.website
                        ? <a href={lead.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>{extractDomain(lead.website)}</a>
                        : '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      <GlassButton
                        size="sm"
                        variant="primary"
                        onClick={() => setPushIds([lead.id])}
                      >
                        {t('leads.addToWave')}
                      </GlassButton>
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
        onPage={p => { setPage(p); setSelected([]); }}
        totalItems={total}
        pageSize={PAGE_SIZE}
      />

      {pushIds && (
        <PushToWaveDialog
          leadIds={pushIds}
          open={true}
          onClose={() => { setPushIds(null); setSelected([]); }}
        />
      )}
    </div>
  );
}
