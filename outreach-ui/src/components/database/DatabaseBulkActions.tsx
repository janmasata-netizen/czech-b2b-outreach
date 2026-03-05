import { useState } from 'react';
import GlassButton from '@/components/glass/GlassButton';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useTags, useAddTagToLead } from '@/hooks/useTags';
import { useUpdateMasterStatus } from '@/hooks/useMasterLeads';
import { useDeleteLeads } from '@/hooks/useLeads';
import { toast } from 'sonner';

interface DatabaseBulkActionsProps {
  selected: string[];
  onClear: () => void;
  teamId?: string;
}

export default function DatabaseBulkActions({ selected, onClear, teamId }: DatabaseBulkActionsProps) {
  const { data: tags = [] } = useTags(teamId);
  const addTag = useAddTagToLead();
  const updateStatus = useUpdateMasterStatus();
  const deleteLeads = useDeleteLeads();
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!selected.length) return null;

  async function handleBulkTag(tagId: string, tagName: string) {
    try {
      await Promise.all(selected.map(leadId => addTag.mutateAsync({ leadId, tagId, tagName })));
      toast.success(`Štítek přidán k ${selected.length} leadům`);
      setShowTagPicker(false);
    } catch {
      toast.error('Chyba při přidávání štítku');
    }
  }

  async function handleBlacklist() {
    try {
      const blacklistTag = tags.find(t => t.name.toLowerCase() === 'blacklist');
      await updateStatus.mutateAsync({ ids: selected, master_status: 'blacklisted' });
      if (blacklistTag) {
        await Promise.all(selected.map(leadId =>
          addTag.mutateAsync({ leadId, tagId: blacklistTag.id, tagName: blacklistTag.name }).catch(() => {})
        ));
      }
      toast.success(`${selected.length} leadů přidáno na blacklist`);
      onClear();
    } catch {
      toast.error('Chyba při blacklistování');
    }
  }

  async function handleArchive() {
    try {
      await updateStatus.mutateAsync({ ids: selected, master_status: 'archived' });
      toast.success(`${selected.length} leadů archivováno`);
      onClear();
    } catch {
      toast.error('Chyba při archivaci');
    }
  }

  async function handleDelete() {
    try {
      await deleteLeads.mutateAsync(selected);
      toast.success(`Smazáno ${selected.length} leadů`);
      onClear();
      setConfirmDelete(false);
    } catch {
      toast.error('Chyba při mazání');
    }
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        background: 'rgba(62,207,142,0.06)', border: '1px solid rgba(62,207,142,0.2)', borderRadius: 8,
        flexWrap: 'wrap', position: 'relative',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>
          Vybráno: <strong style={{ color: 'var(--green)' }}>{selected.length}</strong>
        </span>
        <div style={{ flex: 1 }} />

        {/* Tag picker */}
        <div style={{ position: 'relative' }}>
          <GlassButton size="sm" variant="secondary" onClick={() => setShowTagPicker(v => !v)}>
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

        <GlassButton size="sm" variant="danger" onClick={handleBlacklist}>Blacklist</GlassButton>
        <GlassButton size="sm" variant="secondary" onClick={handleArchive}>Archivovat</GlassButton>
        <GlassButton size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>Smazat</GlassButton>
        <GlassButton size="sm" variant="secondary" onClick={onClear}>Zrušit výběr</GlassButton>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Smazat leady"
        message={`Opravdu chcete smazat ${selected.length} vybraných leadů? Tato akce je nevratná.`}
        confirmLabel="Smazat"
        loading={deleteLeads.isPending}
      />
    </>
  );
}
