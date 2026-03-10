import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import CreateWaveDialog from '@/components/waves/CreateWaveDialog';
import { useWaves, useAddLeadsToWave } from '@/hooks/useWaves';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

interface PushToWaveDialogProps {
  leadIds: string[];
  open: boolean;
  onClose: () => void;
}

export default function PushToWaveDialog({ leadIds, open, onClose }: PushToWaveDialogProps) {
  const navigate = useNavigate();
  const { data: allWaves, isLoading } = useWaves();
  const addLeads = useAddLeadsToWave();
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const draftWaves = (allWaves ?? []).filter(w => w.status === 'draft');

  async function handleAdd() {
    if (!selectedWaveId) return;
    try {
      await addLeads.mutateAsync({ waveId: selectedWaveId, leadIds });
      toast.success(`${leadIds.length} lead${leadIds.length === 1 ? '' : 'ů'} přidáno do vlny`);
      onClose();
      navigate(`/vlny/${selectedWaveId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast.error('Chyba: ' + (e?.message ?? 'neznámá chyba'));
    }
  }

  function handleCreated(waveId: string) {
    setShowCreate(false);
    onClose();
    navigate(`/vlny/${waveId}`);
  }

  return (
    <>
      <GlassModal
        open={open && !showCreate}
        onClose={onClose}
        title={`Přidat do vlny — ${leadIds.length} lead${leadIds.length === 1 ? '' : 'ů'}`}
        width={520}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setShowCreate(true)}>
              + Vytvořit novou vlnu
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleAdd}
              disabled={!selectedWaveId || addLeads.isPending}
            >
              {addLeads.isPending ? 'Přidávám…' : 'Přidat do vlny'}
            </GlassButton>
          </>
        }
      >
        {isLoading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Načítám vlny…
          </div>
        ) : draftWaves.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8, color: 'var(--text-muted)' }}>⌁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Žádné koncepty vln</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Vytvořte novou vlnu a pak do ní přidejte leady.
            </div>
            <GlassButton variant="primary" onClick={() => setShowCreate(true)}>
              + Vytvořit vlnu
            </GlassButton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
            {draftWaves.map(wave => {
              const isSelected = selectedWaveId === wave.id;
              return (
                <button
                  key={wave.id}
                  onClick={() => setSelectedWaveId(wave.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                    border: isSelected ? '1px solid var(--green)' : '1px solid var(--border)',
                    background: isSelected ? 'rgba(62,207,142,0.07)' : 'var(--bg-surface)',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {/* Radio indicator */}
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: isSelected ? '4px solid var(--green)' : '1px solid var(--border-strong)',
                    background: isSelected ? 'rgba(62,207,142,0.15)' : 'transparent',
                    transition: 'border 0.15s',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wave.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {wave.template_set_name
                        ? <span style={{ color: 'var(--text-dim)' }}>{wave.template_set_name} · </span>
                        : null}
                      {wave.lead_count} leadů · {formatDate(wave.created_at)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </GlassModal>

      <CreateWaveDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
