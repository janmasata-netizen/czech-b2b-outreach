import { useState } from 'react';
import GlassButton from '@/components/glass/GlassButton';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useDeleteLeads, useUpdateLeadStatus } from '@/hooks/useLeads';
import { useTags, useAddTagToLead } from '@/hooks/useTags';
import { useAuthContext } from '@/components/AuthProvider';
import { toast } from 'sonner';

interface BulkActionsProps {
  selected: string[];
  onClear: () => void;
}

export default function BulkActions({ selected, onClear }: BulkActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const deleteMutation = useDeleteLeads();
  const updateStatus = useUpdateLeadStatus();
  const { profile } = useAuthContext();
  const { data: tags = [] } = useTags(profile?.team_id ?? undefined);
  const addTag = useAddTagToLead();

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(selected);
      toast.success(`Smazáno ${selected.length} leadů`);
      onClear();
      setConfirmDelete(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast.error('Chyba při mazání leadů' + (e?.message ? ': ' + e.message : ''), { duration: 8000 });
    }
  }

  async function handleStatusChange(status: string) {
    try {
      await Promise.all(selected.map(id => updateStatus.mutateAsync({ id, status })));
      toast.success(`Stav změněn na "${status}" pro ${selected.length} leadů`);
      setShowStatusPicker(false);
    } catch {
      toast.error('Chyba při změně stavu', { duration: 8000 });
    }
  }

  async function handleBulkTag(tagId: string, tagName: string) {
    try {
      await Promise.all(selected.map(leadId => addTag.mutateAsync({ leadId, tagId, tagName })));
      toast.success(`Štítek "${tagName}" přidán k ${selected.length} leadům`);
      setShowTagPicker(false);
    } catch {
      toast.error('Chyba při přidávání štítku', { duration: 8000 });
    }
  }

  if (!selected.length) return null;

  const STATUS_OPTIONS = [
    { value: 'ready', label: 'Připraven' },
    { value: 'problematic', label: 'Problémový' },
    { value: 'needs_review', label: 'Čeká na kontrolu' },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'rgba(62,207,142,0.06)', border: '1px solid rgba(62,207,142,0.2)', borderRadius: 8, flexWrap: 'wrap', position: 'relative' }}>
        <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>
          Vybráno: <strong style={{ color: 'var(--green)' }}>{selected.length}</strong>
        </span>
        <div style={{ flex: 1 }} />

        {/* Status picker */}
        <div style={{ position: 'relative' }}>
          <GlassButton size="sm" variant="secondary" onClick={() => { setShowStatusPicker(v => !v); setShowTagPicker(false); }}>
            Změnit stav
          </GlassButton>
          {showStatusPicker && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: 6, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  style={{
                    display: 'block', width: '100%', padding: '6px 10px', background: 'none',
                    border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 12,
                    borderRadius: 4, textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tag picker */}
        {tags.length > 0 && (
          <div style={{ position: 'relative' }}>
            <GlassButton size="sm" variant="secondary" onClick={() => { setShowTagPicker(v => !v); setShowStatusPicker(false); }}>
              Přidat štítek
            </GlassButton>
            {showTagPicker && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
                padding: 6, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleBulkTag(tag.id, tag.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text)', fontSize: 12, borderRadius: 4, textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color }} />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <GlassButton size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
          Smazat vybrané
        </GlassButton>
        <GlassButton size="sm" variant="secondary" onClick={onClear}>
          Zrušit výběr
        </GlassButton>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Smazat leady"
        message={`Opravdu chcete smazat ${selected.length} vybraných leadů? Tato akce je nevratná.`}
        confirmLabel="Smazat"
        loading={deleteMutation.isPending}
      />
    </>
  );
}
