import { useState } from 'react';
import GlassButton from '@/components/glass/GlassButton';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useDeleteLeads } from '@/hooks/useLeads';
import { toast } from 'sonner';

interface BulkActionsProps {
  selected: string[];
  onClear: () => void;
}

export default function BulkActions({ selected, onClear }: BulkActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteLeads();

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(selected);
      toast.success(`Smazáno ${selected.length} leadů`);
      onClear();
      setConfirmDelete(false);
    } catch (e: any) {
      console.error('Delete leads error:', e);
      toast.error('Chyba při mazání leadů' + (e?.message ? ': ' + e.message : ''));
    }
  }

  if (!selected.length) return null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(62,207,142,0.06)', border: '1px solid rgba(62,207,142,0.2)', borderRadius: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>
          Vybráno: <strong style={{ color: 'var(--green)' }}>{selected.length}</strong>
        </span>
        <div style={{ flex: 1 }} />
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
