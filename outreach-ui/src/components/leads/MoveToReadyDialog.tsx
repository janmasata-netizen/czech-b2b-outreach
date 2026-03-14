import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import StatusBadge from '@/components/shared/StatusBadge';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Lead } from '@/types/database';

interface MoveToReadyDialogProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}

export default function MoveToReadyDialog({ open, onClose, groupId }: MoveToReadyDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problemLeads, setProblemLeads] = useState<Lead[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [problemResult, readyResult] = await Promise.all([
        supabase
          .from('leads')
          .select('id, company_name, ico, status')
          .eq('import_group_id', groupId)
          .in('status', ['failed', 'needs_review']),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('import_group_id', groupId)
          .eq('status', 'ready'),
      ]);
      const problems = (problemResult.data ?? []) as Lead[];
      setProblemLeads(problems);
      setReadyCount(readyResult.count ?? 0);
      setChecked(new Set(problems.map(l => l.id)));
      setLoading(false);
    })();
  }, [open, groupId]);

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const toMark = problemLeads.filter(l => checked.has(l.id));
      if (toMark.length > 0) {
        const { error } = await supabase
          .from('leads')
          .update({ status: 'problematic' })
          .in('id', toMark.map(l => l.id));
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['import-groups'] });
      qc.invalidateQueries({ queryKey: ['import-group-leads'] });
      qc.invalidateQueries({ queryKey: ['ready-leads-by-group'] });

      toast.success(t('importGroups.moveToReady'));
      onClose();
    } catch {
      toast.error('Failed to update leads');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('importGroups.moveToReadyTitle')}
      width={600}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>{t('common.cancel')}</GlassButton>
          <GlassButton variant="primary" onClick={handleConfirm} disabled={saving || loading}>
            {t('importGroups.moveConfirm')}
          </GlassButton>
        </>
      }
    >
      {loading ? (
        <TableSkeleton rows={3} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {t('importGroups.moveToReadySummary', { ready: readyCount, problem: problemLeads.length })}
          </div>

          {problemLeads.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                {t('importGroups.markProblematic')}
              </div>
              {problemLeads.map(lead => (
                <label
                  key={lead.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 6,
                    background: checked.has(lead.id) ? 'rgba(251,146,60,0.06)' : 'transparent',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(lead.id)}
                    onChange={() => toggleCheck(lead.id)}
                    style={{ accentColor: '#fb923c' }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
                    {lead.company_name ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>
                    {lead.ico ?? '—'}
                  </span>
                  <StatusBadge status={lead.status} />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </GlassModal>
  );
}
