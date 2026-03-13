import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassModal from '@/components/glass/GlassModal';
import GlassInput from '@/components/glass/GlassInput';
import ConfirmDialog from '@/components/glass/ConfirmDialog';
import {
  useTemplateSetsSettings,
  useUpsertTemplate,
  useCreateTemplateSet,
  useDeleteTemplateSet,
  useTeamsSettings,
} from '@/hooks/useSettings';
import { useAuthContext } from '@/components/AuthProvider';
import { toast } from 'sonner';
import type { EmailTemplate } from '@/types/database';

export default function TemplateSetEditor() {
  const navigate = useNavigate();
  const { profile } = useAuthContext();
  const isAdmin = profile?.is_admin === true;
  const { data: teams } = useTeamsSettings();
  const userTeamId = profile?.team_id;
  const { data: sets, isLoading } = useTemplateSetsSettings(isAdmin ? undefined : userTeamId ?? undefined);
  const upsertTemplate = useUpsertTemplate();
  const createTemplateSet = useCreateTemplateSet();
  const deleteTemplateSet = useDeleteTemplateSet();

  const [newSetName, setNewSetName] = useState('');
  const [newSetTeamId, setNewSetTeamId] = useState('');
  const [showNewSet, setShowNewSet] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const teamMap = new Map(teams?.map(t => [t.id, t.name]) ?? []);

  // ── Create set + 3 default sequences ──────────────────
  async function handleCreateSet() {
    const createTeamId = isAdmin ? newSetTeamId : userTeamId;
    if (!newSetName.trim() || !createTeamId) return;
    try {
      const data = await createTemplateSet.mutateAsync({ name: newSetName.trim(), team_id: createTeamId });
      // Auto-create 3 empty sequence pairs
      for (const seq of [1, 2, 3]) {
        for (const variant of ['A', 'B']) {
          await upsertTemplate.mutateAsync({
            template_set_id: data.id,
            sequence_number: seq,
            variant,
            subject: '',
            body_html: '',
          });
        }
      }
      setNewSetName('');
      setNewSetTeamId('');
      setShowNewSet(false);
      toast.success('Šablona vytvořena');
      navigate(`/sablony/${data.id}`);
    } catch {
      toast.error('Chyba při vytváření šablony', { duration: 8000 });
    }
  }

  // ── Delete set ────────────────────────────────────────
  async function handleDeleteSet() {
    if (!confirmDeleteId) return;
    try {
      await deleteTemplateSet.mutateAsync(confirmDeleteId);
      toast.success('Šablona smazána');
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('foreign key') || msg.includes('violates')) {
        toast.error('Šablonu nelze smazat — je používána vlnou', { duration: 8000 });
      } else {
        toast.error('Chyba při mazání šablony', { duration: 8000 });
      }
    } finally {
      setConfirmDeleteId(null);
    }
  }

  // Czech pluralization for "sekvence/sekvencí"
  function seqLabel(n: number) {
    if (n === 1) return '1 sekvence';
    if (n >= 2 && n <= 4) return `${n} sekvence`;
    return `${n} sekvencí`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Šablony" actions={
        <GlassButton size="sm" variant="primary" onClick={() => setShowNewSet(true)}>+ Nová šablona</GlassButton>
      } />

      {/* ── Grid view: template set cards ── */}
      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám...</p>
      ) : !sets?.length ? (
        <GlassCard padding={40}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Žádné šablony</p>
        </GlassCard>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {sets.map(s => {
            const seqCount = new Set((s.email_templates ?? []).map((t: EmailTemplate) => t.sequence_number)).size;
            return (
              <div
                key={s.id}
                onClick={() => navigate(`/sablony/${s.id}`)}
                style={{
                  position: 'relative',
                  padding: '16px 18px',
                  borderRadius: 10,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(62,207,142,0.4)';
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(62,207,142,0.04)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-subtle)';
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  {s.name}
                </div>
                {isAdmin && s.team_id && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {teamMap.get(s.team_id) ?? 'Neznámý tým'}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {seqLabel(seqCount)}
                </div>
                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                  title="Smazat šablonu"
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

      {/* ── New Set Dialog ── */}
      <GlassModal
        open={showNewSet}
        onClose={() => { setShowNewSet(false); setNewSetName(''); setNewSetTeamId(''); }}
        title="Nová šablona"
        width={400}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => { setShowNewSet(false); setNewSetName(''); setNewSetTeamId(''); }}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleCreateSet} disabled={!newSetName.trim() || createTemplateSet.isPending || (isAdmin && !newSetTeamId)}>
              {createTemplateSet.isPending ? 'Vytvářím...' : 'Vytvořit'}
            </GlassButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <GlassInput
            label="Název šablony"
            placeholder="Nabídka webu"
            value={newSetName}
            onChange={e => setNewSetName(e.target.value)}
            autoFocus
          />
          {isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>Tým</label>
              <select
                className="glass-input"
                value={newSetTeamId}
                onChange={e => setNewSetTeamId(e.target.value)}
                style={{ fontSize: 13, height: 36 }}
              >
                <option value="">— Vyberte tým —</option>
                {teams?.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </GlassModal>

      {/* ── Confirm Delete Set ── */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDeleteSet}
        title="Smazat šablonu"
        confirmLabel="Smazat"
        variant="danger"
        loading={deleteTemplateSet.isPending}
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Smazat šablonu a všechny její sekvence? Tato akce je nevratná.
        </div>
      </ConfirmDialog>
    </div>
  );
}
