import { useState, type FormEvent } from 'react';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { useCreateWave } from '@/hooks/useWaves';
import { useTeams } from '@/hooks/useLeads';
import { toast } from 'sonner';

interface CreateWaveDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };

export default function CreateWaveDialog({ open, onClose, onCreated }: CreateWaveDialogProps) {
  const { data: teams } = useTeams();
  const createWave = useCreateWave();
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Zadejte název vlny'); return; }
    const resolvedTeam = teamId || teams?.[0]?.id;
    if (!resolvedTeam) { toast.error('Vyberte tým'); return; }
    try {
      const wave = await createWave.mutateAsync({
        name: name.trim(),
        team_id: resolvedTeam,
        status: 'draft',
      });
      toast.success('Vlna vytvořena');
      onCreated?.(wave.id);
      setName('');
      setTeamId('');
      onClose();
    } catch (err: unknown) {
      toast.error('Chyba: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Nová vlna"
      width={420}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={e => handleSubmit(e as any)} disabled={createWave.isPending}>
            {createWave.isPending ? 'Ukládám…' : 'Vytvořit vlnu'}
          </GlassButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassInput
          label="Název vlny"
          placeholder="Q2 2026 — Dentální kliniky"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        {teams && teams.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={LABEL}>Tým</label>
            <select className="glass-input" value={teamId} onChange={e => setTeamId(e.target.value)}>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Šablony, datum a leady nastavíte po vytvoření vlny.
        </p>
      </form>
    </GlassModal>
  );
}
