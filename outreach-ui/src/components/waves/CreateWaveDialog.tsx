import { useState, type FormEvent } from 'react';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { useCreateWave, useAddLeadsToWave } from '@/hooks/useWaves';
import { useTeams } from '@/hooks/useLeads';
import { useWavePresets } from '@/hooks/useWavePresets';
import type { WavePreset } from '@/types/database';
import { toast } from 'sonner';

interface CreateWaveDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  preselectedLeadIds?: string[];
  retargetMode?: boolean;
  sourceWaveId?: string;
}

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };

export default function CreateWaveDialog({ open, onClose, onCreated, preselectedLeadIds, retargetMode, sourceWaveId }: CreateWaveDialogProps) {
  const { data: teams } = useTeams();
  const createWave = useCreateWave();
  const addLeads = useAddLeadsToWave();
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [presetId, setPresetId] = useState('');

  const resolvedTeamId = teamId || teams?.[0]?.id;
  const { data: presets } = useWavePresets(resolvedTeamId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Zadejte název vlny', { duration: 8000 }); return; }
    const resolvedTeam = teamId || teams?.[0]?.id;
    if (!resolvedTeam) { toast.error('Vyberte tým', { duration: 8000 }); return; }
    try {
      const wave = await createWave.mutateAsync({
        name: name.trim(),
        team_id: resolvedTeam,
        status: 'draft',
        ...(sourceWaveId ? { source_wave_id: sourceWaveId } : {}),
        ...(presets?.find((p: WavePreset) => p.id === presetId) ? {
          template_set_id: presets.find((p: WavePreset) => p.id === presetId)!.template_set_id,
          from_email: presets.find((p: WavePreset) => p.id === presetId)!.from_email,
          salesman_id: presets.find((p: WavePreset) => p.id === presetId)!.salesman_id,
        } : {}),
      });

      // Auto-add preselected leads (retarget flow)
      if (preselectedLeadIds && preselectedLeadIds.length > 0) {
        await addLeads.mutateAsync({
          waveId: wave.id,
          leadIds: preselectedLeadIds,
          retargetMode: retargetMode,
        });
      }

      toast.success(retargetMode
        ? `Retarget vlna vytvořena s ${preselectedLeadIds?.length ?? 0} leady`
        : 'Vlna vytvořena'
      );
      onCreated?.(wave.id);
      setName('');
      setTeamId('');
      setPresetId('');
      onClose();
    } catch (err: unknown) {
      toast.error('Chyba: ' + (err instanceof Error ? err.message : String(err)), { duration: 8000 });
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={retargetMode ? 'Nová retarget vlna' : 'Nová vlna'}
      width={420}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={(e) => handleSubmit(e as unknown as FormEvent)} disabled={createWave.isPending}>
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
        {presets && presets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={LABEL}>Preset</label>
            <select className="glass-input" value={presetId} onChange={e => setPresetId(e.target.value)}>
              <option value="">— Bez presetu —</option>
              {presets.map((p: WavePreset) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {retargetMode && preselectedLeadIds && preselectedLeadIds.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--cyan)', margin: 0, padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 6, border: '1px solid var(--border)' }}>
            {preselectedLeadIds.length} lead{preselectedLeadIds.length > 1 ? 'ů' : ''} bude automaticky přidáno do vlny.
          </p>
        )}
        {!presetId && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Šablony, datum a leady nastavíte po vytvoření vlny.
          </p>
        )}
      </form>
    </GlassModal>
  );
}
