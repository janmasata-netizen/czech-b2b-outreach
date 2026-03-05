import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import PageHeader from '@/components/layout/PageHeader';
import { useTeamsSettings, useUpsertTeam, useUpsertOutreachAccount } from '@/hooks/useSettings';
import type { Team } from '@/types/database';
import { toast } from 'sonner';

const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 3 };

export default function TeamsSettings() {
  const { data: teams, isLoading } = useTeamsSettings();
  const upsertTeam = useUpsertTeam();
  const upsertAccount = useUpsertOutreachAccount();
  const [editing, setEditing] = useState<Partial<Team> | null>(null);
  const [burnerEmail, setBurnerEmail] = useState('');

  const isCreating = editing !== null && !editing.id;

  function openCreate() {
    setEditing({ name: '' });
    setBurnerEmail('');
  }

  function openEdit(team: Team) {
    setEditing(team);
    setBurnerEmail('');
  }

  function handleClose() {
    setEditing(null);
    setBurnerEmail('');
  }

  async function handleSave() {
    if (!editing?.name?.trim()) { toast.error('Zadejte název týmu'); return; }
    if (isCreating && !burnerEmail.trim()) { toast.error('Zadejte burner e-mail pro odchozí poštu'); return; }
    try {
      const teamId = await upsertTeam.mutateAsync(editing);
      // When creating, also insert the first outreach account
      if (isCreating && burnerEmail.trim()) {
        await upsertAccount.mutateAsync({
          team_id: teamId,
          email_address: burnerEmail.trim(),
          smtp_credential_name: 'burner outreach email',
          daily_send_limit: 130,
          sends_today: 0,
          is_active: true,
        });
      }
      toast.success(isCreating ? 'Tým vytvořen' : 'Tým uložen');
      handleClose();
    } catch (err: unknown) {
      toast.error('Chyba při ukládání: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  const saving = upsertTeam.isPending || upsertAccount.isPending;

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
            {isCreating && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <GlassInput
                  label="Burner e-mail (odchozí outreach) *"
                  placeholder="jmeno.prijmeni@meisat.com"
                  type="email"
                  value={burnerEmail}
                  onChange={e => setBurnerEmail(e.target.value)}
                  required
                />
                <p style={HINT}>Tento e-mail bude přidán jako výchozí odesílatel pro vlny tohoto týmu. Další e-maily lze přidat v sekci Outreach účty.</p>
              </div>
            )}
          </div>
        )}
      </GlassModal>
    </GlassCard>
    </div>
  );
}
