import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useReadyLeadsByGroup } from '@/hooks/useLeads';
import { extractDomain } from '@/lib/utils';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import GlassButton from '@/components/glass/GlassButton';
import PushToWaveDialog from '@/components/leads/PushToWaveDialog';
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [pushIds, setPushIds] = useState<string[] | null>(null);

  const { data: groups, isLoading } = useReadyLeadsByGroup();

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll(leads: Lead[]) {
    const ids = leads.map(l => l.id);
    const allSelected = ids.every(id => selected.includes(id));
    if (allSelected) {
      setSelected(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelected(prev => [...new Set([...prev, ...ids])]);
    }
  }

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  if (isLoading) return <TableSkeleton rows={8} />;

  const totalLeads = (groups ?? []).reduce((sum, g) => sum + g.leads.length, 0);

  if (!groups?.length) {
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
          {t('leads.readyLeadsCount', { count: totalLeads })}
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

      {/* Grouped bundles */}
      {groups.map(group => {
        const key = group.groupId ?? '__none__';
        const isExpanded = expandedGroups.has(key);
        const groupLeadIds = group.leads.map(l => l.id);
        const groupSelectedCount = groupLeadIds.filter(id => selected.includes(id)).length;

        return (
          <div key={key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Group header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
              }}
              onClick={() => toggleGroup(key)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 11, color: 'var(--text-dim)',
                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                  display: 'inline-block', transition: 'transform 0.15s',
                }}>
                  ▶
                </span>
                {group.source && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3,
                    background: group.source === 'csv' ? 'rgba(99,102,241,0.1)' : 'rgba(52,211,153,0.1)',
                    color: group.source === 'csv' ? '#818cf8' : '#34d399',
                    fontWeight: 600, textTransform: 'uppercase',
                  }}>
                    {group.source === 'csv' ? 'CSV' : 'GSheet'}
                  </span>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {t('leads.readyGroupTitle', { name: group.groupName, count: group.leads.length })}
                </span>
                {groupSelectedCount > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    ({groupSelectedCount} vybráno)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={() => setPushIds(groupLeadIds)}
                >
                  {t('leads.addGroupToWave')}
                </GlassButton>
              </div>
            </div>

            {/* Expanded lead table */}
            {isExpanded && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, width: 40, padding: '9px 12px' }}>
                        <input
                          type="checkbox"
                          checked={groupSelectedCount === group.leads.length && group.leads.length > 0}
                          onChange={() => toggleAll(group.leads)}
                          style={{ accentColor: 'var(--green)' }}
                        />
                      </th>
                      {[t('leads.tableHeaders.company'), t('leads.tableHeaders.ico'), t('leads.tableHeaders.domain'), t('leads.tableHeaders.web'), ''].map(h => (
                        <th key={h} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.leads.map((lead: Lead) => {
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
            )}
          </div>
        );
      })}

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
