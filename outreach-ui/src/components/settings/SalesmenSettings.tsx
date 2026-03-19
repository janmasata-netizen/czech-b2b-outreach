import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import StatusBadge from '@/components/shared/StatusBadge';
import { useSalesmen, useUpsertSalesman, useDeleteSalesman } from '@/hooks/useSettings';
import { useTeamsSettings } from '@/hooks/useSettings';
import type { Salesman } from '@/types/database';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };

export default function SalesmenSettings() {
  const { data: salesmen, isLoading } = useSalesmen();
  const { data: teams } = useTeamsSettings();
  const upsert = useUpsertSalesman();
  const remove = useDeleteSalesman();
  const [editing, setEditing] = useState<Partial<Salesman> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Salesman | null>(null);

  async function handleSave() {
    if (!editing?.name?.trim()) { toast.error('Zadejte jméno obchodníka', { duration: 8000 }); return; }
    if (!editing?.email?.trim()) { toast.error('Zadejte e-mail obchodníka', { duration: 8000 }); return; }
    if (!editing?.imap_host?.trim()) { toast.error('Zadejte IMAP server', { duration: 8000 }); return; }
    if (!editing?.imap_user?.trim()) { toast.error('Zadejte IMAP uživatele', { duration: 8000 }); return; }
    if (!editing?.team_id) { toast.error('Vyberte tým', { duration: 8000 }); return; }
    try {
      const toSave = { ...editing };
      if (toSave.id && !toSave.imap_password) {
        delete toSave.imap_password; // don't overwrite with empty
      }
      await upsert.mutateAsync(toSave);
      toast.success('Obchodník uložen');
      setEditing(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Maximum 5')) {
        toast.error('Nelze přidat více než 5 aktivních obchodníků', { duration: 8000 });
      } else {
        toast.error('Chyba při ukládání: ' + msg, { duration: 8000 });
      }
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await remove.mutateAsync(confirmDelete.id);
      toast.success('Obchodník smazán');
      setConfirmDelete(null);
    } catch {
      toast.error('Chyba při mazání obchodníka', { duration: 8000 });
    }
  }

  const activeSalesmen = (salesmen ?? []).filter(s => s.is_active !== false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <PageHeader
      title="Obchodníci"
      subtitle="Každý obchodník má vlastní IMAP inbox a Reply-To e-mail. Max. 5 aktivních."
      actions={
        <GlassButton
          size="sm"
          variant="primary"
          disabled={activeSalesmen.length >= 5}
          onClick={() => setEditing({ name: '', email: '', imap_host: '', imap_port: 993, imap_secure: true, imap_user: '', imap_password: '', team_id: teams?.[0]?.id ?? '', is_active: true })}
        >
          + Nový obchodník
        </GlassButton>
      }
    />
    <GlassCard padding={20}>

      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(salesmen ?? []).map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.name}</span>
                  <StatusBadge status={s.is_active !== false ? 'active' : 'inactive'} />
                  {s.team && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {s.team.name}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                  {s.email}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  IMAP: <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{s.imap_host ? `${s.imap_user}@${s.imap_host}:${s.imap_port ?? 993}` : s.imap_credential_name ?? '—'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <GlassButton size="sm" onClick={() => setEditing(s)}>Upravit</GlassButton>
                <GlassButton size="sm" variant="danger" onClick={() => setConfirmDelete(s)}>
                  <Trash2 size={13} />
                </GlassButton>
              </div>
            </div>
          ))}
          {!salesmen?.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Žádní obchodníci</p>}
        </div>
      )}

      {/* Capacity indicator */}
      {(salesmen?.length ?? 0) > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
          {activeSalesmen.length} / 5 aktivních obchodníků
        </div>
      )}

      {/* Edit modal */}
      <GlassModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Upravit obchodníka' : 'Nový obchodník'}
        width={500}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setEditing(null)}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Ukládám…' : 'Uložit'}
            </GlassButton>
          </>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GlassInput
              label="Jméno obchodníka"
              placeholder="Jan Novák"
              value={editing.name ?? ''}
              onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))}
              required
            />
            <GlassInput
              label="E-mail (Reply-To)"
              placeholder="jan.novak@firma.cz"
              type="email"
              value={editing.email ?? ''}
              onChange={e => setEditing(p => ({ ...p!, email: e.target.value }))}
              required
            />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              IMAP přihlášení (pro detekci odpovědí)
            </div>
            <GlassInput
              label="IMAP server"
              placeholder="imap.gmail.com"
              value={editing.imap_host ?? ''}
              onChange={e => setEditing(p => ({ ...p!, imap_host: e.target.value }))}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <GlassInput
                  label="Port"
                  type="number"
                  placeholder="993"
                  value={editing.imap_port ?? 993}
                  onChange={e => setEditing(p => ({ ...p!, imap_port: parseInt(e.target.value) || 993 }))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'end', gap: 8, paddingBottom: 4 }}>
                <input
                  type="checkbox"
                  id="imap_secure"
                  checked={editing.imap_secure !== false}
                  onChange={e => setEditing(p => ({ ...p!, imap_secure: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--green)' }}
                />
                <label htmlFor="imap_secure" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>SSL/TLS</label>
              </div>
            </div>
            <GlassInput
              label="IMAP uživatel"
              placeholder="jan.novak@firma.cz"
              value={editing.imap_user ?? ''}
              onChange={e => setEditing(p => ({ ...p!, imap_user: e.target.value }))}
            />
            <GlassInput
              label="IMAP heslo"
              type="password"
              placeholder={editing.id ? '(beze změny)' : ''}
              value={editing.imap_password ?? ''}
              onChange={e => setEditing(p => ({ ...p!, imap_password: e.target.value }))}
            />
            {teams && teams.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Tým</label>
                <select
                  className="glass-input"
                  value={editing.team_id ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, team_id: e.target.value }))}
                >
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="is_active"
                checked={editing.is_active !== false}
                onChange={e => setEditing(p => ({ ...p!, is_active: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: 'var(--green)' }}
              />
              <label htmlFor="is_active" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                Aktivní (zahrnout do reply detection)
              </label>
            </div>
          </div>
        )}
      </GlassModal>

      {/* Delete confirm modal */}
      <GlassModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Smazat obchodníka"
        width={400}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setConfirmDelete(null)}>Zrušit</GlassButton>
            <GlassButton variant="danger" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending ? 'Mažu…' : 'Smazat'}
            </GlassButton>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text)' }}>
          Opravdu smazat obchodníka <strong>{confirmDelete?.name}</strong>?
          Existující vlny a odpovědi přiřazené tomuto obchodníkovi zůstanou zachovány.
        </p>
      </GlassModal>
    </GlassCard>
    </div>
  );
}
