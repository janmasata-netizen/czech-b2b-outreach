import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/glass/ConfirmDialog';
import { useWavePresets, useDeleteWavePreset } from '@/hooks/useWavePresets';
import { useTeamsSettings } from '@/hooks/useSettings';
import { useAuthContext } from '@/components/AuthProvider';
import { toast } from 'sonner';
import { useState } from 'react';
import { Mail, User, FileText } from 'lucide-react';

export default function WavePresetsTab() {
  const { profile } = useAuthContext();
  const isAdmin = profile?.is_admin === true;
  const userTeamId = profile?.team_id;
  const { data: presets, isLoading } = useWavePresets(isAdmin ? undefined : userTeamId ?? undefined);
  const { data: teams } = useTeamsSettings();
  const deletePreset = useDeleteWavePreset();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const teamMap = new Map(teams?.map(t => [t.id, t.name]) ?? []);

  async function handleDelete() {
    if (!confirmDeleteId) return;
    try {
      await deletePreset.mutateAsync(confirmDeleteId);
      toast.success('Preset smazan');
    } catch {
      toast.error('Chyba pri mazani presetu', { duration: 8000 });
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Vlnove presety" />

      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nacitam...</p>
      ) : !presets?.length ? (
        <GlassCard padding={40}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Zadne presety. Preset vytvorite na strance vlny tlacitkem Ulozit jako preset.
          </p>
        </GlassCard>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12,
        }}>
          {presets.map(p => {
            const ts = p.template_set as unknown as { id: string; name: string } | null;
            const ea = p.email_account as unknown as { id: string; name: string; email_address: string } | null;
            return (
              <div
                key={p.id}
                style={{
                  position: 'relative',
                  padding: '16px 18px',
                  borderRadius: 10,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                  {p.name}
                </div>
                {isAdmin && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {teamMap.get(p.team_id) ?? 'Neznamy tym'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
                  {ts && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={12} strokeWidth={1.7} />
                      {ts.name}
                    </div>
                  )}
                  {ea && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Mail size={12} strokeWidth={1.7} />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{ea.email_address}</span>
                    </div>
                  )}
                  {ea && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={12} strokeWidth={1.7} />
                      {ea.name}
                    </div>
                  )}
                  {!ts && !ea && (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Prazdny preset</span>
                  )}
                </div>

                <button
                  onClick={() => setConfirmDeleteId(p.id)}
                  title="Smazat preset"
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13,
                    padding: '0 5px', lineHeight: '20px',
                    opacity: 0.5, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.5'; }}
                >x</button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Smazat preset"
        confirmLabel="Smazat"
        variant="danger"
        loading={deletePreset.isPending}
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Smazat tento vlnovy preset? Tato akce je nevratna.
        </div>
      </ConfirmDialog>
    </div>
  );
}
