import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useImportGroupLeads, useDeleteImportGroup } from '@/hooks/useImportGroups';
import StatusBadge from '@/components/shared/StatusBadge';
import Pagination from '@/components/shared/Pagination';
import GlassButton from '@/components/glass/GlassButton';
import PushToWaveDialog from '@/components/leads/PushToWaveDialog';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import { PAGE_SIZE } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import type { ImportGroupStats, Lead, Contact, EmailCandidate } from '@/types/database';

interface ImportGroupDetailProps {
  group: ImportGroupStats;
  onClose: () => void;
}

const TH: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
};

export default function ImportGroupDetail({ group, onClose }: ImportGroupDetailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [pushIds, setPushIds] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });

  const { data, isLoading } = useImportGroupLeads(group.id, page);
  const deleteGroup = useDeleteImportGroup();
  const leads = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const enrichmentBadgeLabel = t(`importGroups.enrichmentBadge.${group.enrichment_level}`);

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    setSelected(e.target.checked ? leads.map((l: { id: string }) => l.id) : []);
  }

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  async function handleRetryFailed() {
    setRetrying(true);
    try {
      const { data: failedLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('import_group_id', group.id)
        .eq('status', 'failed');

      if (!failedLeads || failedLeads.length === 0) {
        toast.info(t('importGroups.noLeadsToEnrich'));
        setRetrying(false);
        return;
      }

      const webhookPath = group.enrichment_level === 'full_pipeline' ? 'wf2-ares' : 'wf4-email-gen';

      for (const lead of failedLeads) {
        await supabase.from('leads').update({ status: 'enriching' }).eq('id', lead.id);
        try {
          await fetch(n8nWebhookUrl(webhookPath), {
            method: 'POST',
            headers: n8nHeaders(),
            body: JSON.stringify({ lead_id: lead.id }),
          });
          await new Promise(r => setTimeout(r, 200));
        } catch { /* ignore */ }
      }
      toast.success(t('importGroups.retrying'));
    } finally {
      setRetrying(false);
    }
  }

  async function handleStartEnrichment() {
    setEnriching(true);
    try {
      const { data: newLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('import_group_id', group.id)
        .eq('status', 'new');

      if (!newLeads || newLeads.length === 0) {
        toast.info(t('importGroups.noLeadsToEnrich'));
        setEnriching(false);
        return;
      }

      setEnrichProgress({ done: 0, total: newLeads.length });

      const webhookPath = group.enrichment_level === 'full_pipeline' ? 'wf2-ares' : 'wf4-email-gen';

      for (let i = 0; i < newLeads.length; i++) {
        const lead = newLeads[i];
        await supabase.from('leads').update({ status: 'enriching' }).eq('id', lead.id);
        try {
          await fetch(n8nWebhookUrl(webhookPath), {
            method: 'POST',
            headers: n8nHeaders(),
            body: JSON.stringify({ lead_id: lead.id }),
          });
        } catch { /* ignore individual failures */ }
        setEnrichProgress({ done: i + 1, total: newLeads.length });
        if (i < newLeads.length - 1) await new Promise(r => setTimeout(r, 200));
      }

      toast.success(t('importGroups.enrichmentStarted', { count: newLeads.length }));
    } finally {
      setEnriching(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('importGroups.deleteConfirm'))) return;
    try {
      await deleteGroup.mutateAsync(group.id);
      toast.success(t('importGroups.groupDeleted'));
      onClose();
    } catch {
      toast.error('Failed to delete group');
    }
  }

  if (isLoading) return <TableSkeleton rows={5} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{group.name}</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            color: '#818cf8', fontWeight: 500,
          }}>
            {enrichmentBadgeLabel}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{formatDate(group.created_at)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {group.enrichment_level !== 'import_only' && (
            <GlassButton variant="primary" onClick={handleStartEnrichment} disabled={enriching}>
              {enriching
                ? `${t('importGroups.enriching')} ${enrichProgress.done}/${enrichProgress.total}`
                : t('importGroups.startEnrichment')}
            </GlassButton>
          )}
          {group.failed_count > 0 && (
            <GlassButton variant="secondary" onClick={handleRetryFailed} disabled={retrying}>
              {t('importGroups.retryFailed', { count: group.failed_count })}
            </GlassButton>
          )}
          {selected.length > 0 && (
            <GlassButton variant="primary" onClick={() => setPushIds(selected)}>
              {t('leads.addCountToWave', { count: selected.length })}
            </GlassButton>
          )}
          <GlassButton variant="secondary" onClick={handleDelete} disabled={deleteGroup.isPending}>
            {t('importGroups.deleteGroup')}
          </GlassButton>
        </div>
      </div>

      {/* Leads table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 36 }}>
                  <input type="checkbox" checked={selected.length === leads.length && leads.length > 0} onChange={toggleAll} />
                </th>
                <th style={{ ...TH, width: 32 }}></th>
                {['Firma', 'ICO', 'Stav', 'Email', 'Kontakt'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: Lead & { contacts?: (Contact & { email_candidates?: EmailCandidate[] })[] }) => {
                const contacts = lead.contacts ?? [];
                const emails = contacts.flatMap(c => c.email_candidates ?? []);
                const primaryEmail = emails.find(e => e.is_verified)?.email_address ?? emails[0]?.email_address ?? '—';
                const primaryContact = contacts[0]?.full_name ?? '—';
                const isExpanded = expanded === lead.id;

                return (
                  <tr key={lead.id}>
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggle(lead.id)} />
                    </td>
                    <td style={{ padding: '11px 14px', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : lead.id)}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>
                        ▶
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', cursor: 'pointer' }} onClick={() => navigate(`/leady/${lead.id}`)}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{lead.company_name ?? '—'}</span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>
                      {lead.ico ?? '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <StatusBadge status={lead.status} />
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {primaryEmail}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-dim)' }}>
                      {primaryContact}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} onPage={setPage} totalItems={total} pageSize={PAGE_SIZE} />

      {pushIds && (
        <PushToWaveDialog
          leadIds={pushIds}
          open={!!pushIds}
          onClose={() => { setPushIds(null); setSelected([]); }}
        />
      )}
    </div>
  );
}
