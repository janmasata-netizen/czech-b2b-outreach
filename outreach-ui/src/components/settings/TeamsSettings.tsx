import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import PageHeader from '@/components/layout/PageHeader';
import { useTeamsSettings, useUpsertTeam } from '@/hooks/useSettings';
import type { Team } from '@/types/database';
import { toast } from 'sonner';

const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 3 };

export default function TeamsSettings() {
  const { data: teams, isLoading } = useTeamsSettings();
  const upsertTeam = useUpsertTeam();
  const [editing, setEditing] = useState<Partial<Team> | null>(null);

  const isCreating = editing !== null && !editing.id;

  function openCreate() {
    setEditing({ name: '', daily_send_limit: 130 });
  }

  function openEdit(team: Team) {
    setEditing(team);
  }

  function handleClose() {
    setEditing(null);
  }

  async function handleSave() {
    if (!editing?.name?.trim()) { toast.error('Zadejte název týmu', { duration: 8000 }); return; }
    try {
      await upsertTeam.mutateAsync(editing);
      toast.success(isCreating ? 'Tým vytvořen' : 'Tým uložen');
      handleClose();
    } catch (err: unknown) {
      toast.error('Chyba při ukládání: ' + (err instanceof Error ? err.message : String(err)), { duration: 8000 });
    }
  }

  const saving = upsertTeam.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <PageHeader title="Týmy" actions={<GlassButton size="sm" variant="primary" onClick={openCreate}>+ Nový tým</GlassButton>} />
    <GlassCard padding={20}>

      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(teams ?? []).map(team => (
            <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{team.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Denní limit: <span style={{ fontFamily: 'JetBrains Mono, monospace', color: (team.sends_today ?? 0) >= (team.daily_send_limit ?? 130) ? '#ef4444' : 'var(--text)' }}>
                    {team.sends_today ?? 0}/{team.daily_send_limit ?? 130}
                  </span>
                </div>
              </div>
              <GlassButton size="sm" onClick={() => openEdit(team)}>Upravit</GlassButton>
            </div>
          ))}
          {!teams?.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Žádné týmy</p>}
        </div>
      )}

      <GlassModal
        open={!!editing}
        onClose={handleClose}
        title={isCreating ? 'Nový tým' : 'Upravit tým'}
        width={460}
        footer={
          <>
            <GlassButton variant="secondary" onClick={handleClose}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Ukládám…' : 'Uložit'}
            </GlassButton>
          </>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GlassInput
              label="Název týmu"
              value={editing.name ?? ''}
              onChange={e => setEditing(prev => ({ ...prev!, name: e.target.value }))}
              required
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <GlassInput
                label="Denní limit odesílání"
                type="number"
                value={String(editing.daily_send_limit ?? 130)}
                onChange={e => setEditing(prev => ({ ...prev!, daily_send_limit: Number(e.target.value) || 130 }))}
              />
              <p style={HINT}>Maximální počet emailů odeslaných za den pro tento tým. FROM email se nastavuje přímo na vlně.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <GlassInput
                label="Retarget lockout (dny)"
                type="number"
                value={String((editing as Record<string, unknown>).retarget_lockout_days ?? 120)}
                onChange={e => setEditing(prev => ({ ...prev!, retarget_lockout_days: Number(e.target.value) || 120 } as Partial<Team>))}
              />
              <p style={HINT}>Počet dnů od posledního kontaktu, po které nelze lead znovu oslovit. Výchozí: 120.</p>
            </div>
          </div>
        )}
      </GlassModal>
    </GlassCard>
    </div>
  );
}
