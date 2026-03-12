import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Lead, WaveLead } from '@/types/database';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatDate, extractDomain, truncate } from '@/lib/utils';
import { EMAIL_STATUS_STYLES, LEAD_LANGUAGE_MAP } from '@/lib/constants';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import { useRemoveLeadFromWave } from '@/hooks/useLeads';
import { toast } from 'sonner';

function EmailStatusBadge({ status }: { status: string }) {
  const s = EMAIL_STATUS_STYLES[status] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

const TH: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
};

interface LeadsTableProps {
  leads: Lead[];
  isLoading: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
}

export default function LeadsTable({ leads, isLoading, selected, onSelect }: LeadsTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const removeFromWave = useRemoveLeadFromWave();

  async function handleRemoveFromWave(e: React.MouseEvent, waveLeadId: string, leadId: string, waveName: string) {
    e.stopPropagation();
    if (!window.confirm(t('leads.removeFromWaveConfirm', { name: waveName }))) return;
    try {
      await removeFromWave.mutateAsync({ waveLeadId, leadId });
      toast.success(t('leads.removedFromWave'));
    } catch (err: unknown) {
      toast.error(t('waves.errorScheduling') + (err instanceof Error ? err.message : ''), { duration: 8000 });
    }
  }

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    onSelect(e.target.checked ? leads.map(l => l.id) : []);
  }

  function toggle(id: string) {
    onSelect(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  if (isLoading) return <TableSkeleton rows={10} />;
  if (!leads.length) return <EmptyState icon="◈" title={t('leads.noLeads')} description={t('leads.noLeadsDesc')} />;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 40, padding: '9px 12px' }}>
              <input type="checkbox" checked={selected.length === leads.length && leads.length > 0} onChange={toggleAll} style={{ accentColor: 'var(--green)' }} />
            </th>
            {[t('leads.tableHeaders.company'), t('leads.tableHeaders.ico'), t('leads.tableHeaders.web'), t('leads.tableHeaders.email'), t('leads.tableHeaders.emailStatus'), t('leads.tableHeaders.jednatel'), t('leads.tableHeaders.status'), t('leads.tableHeaders.wave'), t('leads.tableHeaders.added')].map(h => (
              <th key={h} style={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => {
            const isSelected = selected.includes(lead.id);
            const candidates = lead.email_candidates ?? [];
            const bestCand = candidates.find(e => e.is_verified) ?? candidates[0];
            const primaryEmail = bestCand?.email_address;
            const emailStatus = lead.status === 'info_email'
              ? 'info_email'
              : bestCand?.qev_status && bestCand.qev_status !== 'unknown'
              ? bestCand.qev_status
              : bestCand?.seznam_status ?? null;
            const jednatels = lead.jednatels?.map(j => j.full_name).filter(Boolean).join(', ');
            // wave_leads come from Supabase join with nested waves
            const wl = lead.wave_leads?.[0] as (WaveLead & { waves?: { name: string; status: string } }) | undefined;
            const waveName: string | undefined = wl?.waves?.name;
            const canRemove = !!wl;

            return (
              <tr
                key={lead.id}
                className="glass-table-row"
                style={{ background: isSelected ? 'rgba(62,207,142,0.05)' : undefined, borderBottom: '1px solid var(--border)' }}
                onClick={() => navigate(`/leady/${lead.id}`)}
              >
                <td style={{ padding: '11px 12px' }} onClick={e => { e.stopPropagation(); toggle(lead.id); }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(lead.id)} style={{ accentColor: 'var(--green)' }} />
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                    {truncate(lead.company_name ?? '—', 32)}
                    {lead.lead_type === 'contact' && (
                      <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 4,
                        background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                        marginLeft: 5, fontWeight: 500, verticalAlign: 'middle',
                      }}>{t('leads.contact')}</span>
                    )}
                    {lead.language && lead.language !== 'cs' && (
                      <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 4,
                        background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                        marginLeft: 5, fontWeight: 600, verticalAlign: 'middle',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>{lead.language}</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>{lead.ico ?? '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-dim)' }}>{lead.website ? extractDomain(lead.website) : '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: primaryEmail ? 'var(--text)' : 'var(--text-muted)' }}>
                  {primaryEmail ? truncate(primaryEmail, 34) : '—'}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  {emailStatus ? <EmailStatusBadge status={emailStatus} /> : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-dim)' }}>{jednatels || '—'}</td>
                <td style={{ padding: '11px 14px' }}><StatusBadge status={lead.status ?? 'new'} /></td>
                <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                  {wl && waveName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }} title={waveName}>
                        {waveName}
                      </span>
                      {canRemove && (
                        <button
                          title={t('leads.removeFromWave')}
                          onClick={e => handleRemoveFromWave(e, wl!.id, lead.id, waveName!)}
                          disabled={removeFromWave.isPending}
                          style={{ flexShrink: 0, background: 'none', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 4, cursor: 'pointer', color: '#f87171', fontSize: 13, lineHeight: 1, padding: '1px 5px' }}
                        >×</button>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>{formatDate(lead.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
