import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import StatusBadge from '@/components/shared/StatusBadge';
import { useOutreachAccounts, useUpsertOutreachAccount, useDeleteOutreachAccount, useTeamsSettings } from '@/hooks/useSettings';
import type { OutreachAccount } from '@/types/database';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };
const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 3 };
const MONO: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' };

type FormData = Partial<OutreachAccount> & { smtp_password?: string };

export default function OutreachAccountsSettings() {
  const { data: accounts, isLoading } = useOutreachAccounts();
  const { data: teams } = useTeamsSettings();
  const upsert = useUpsertOutreachAccount();
  const remove = useDeleteOutreachAccount();
  const [editing, setEditing] = useState<FormData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OutreachAccount | null>(null);

  function openCreate() {
    setEditing({
      email_address: '',
      display_name: '',
      smtp_host: 'smtp.gmail.com',
      smtp_port: 465,
      smtp_secure: true,
      smtp_user: '',
      smtp_password: '',
      daily_send_limit: 100,
      is_active: true,
      team_id: teams?.[0]?.id ?? '',
    });
  }

  function openEdit(account: OutreachAccount) {
    setEditing({ ...account, smtp_password: '' }); // password blank = keep existing
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.email_address?.trim()) { toast.error('Zadejte e-mailovou adresu', { duration: 8000 }); return; }
    if (!editing.smtp_host?.trim()) { toast.error('Zadejte SMTP server', { duration: 8000 }); return; }
    if (!editing.smtp_user?.trim()) { toast.error('Zadejte SMTP uživatele', { duration: 8000 }); return; }
    if (!editing.id && !editing.smtp_password?.trim()) { toast.error('Zadejte SMTP heslo', { duration: 8000 }); return; }
    if (!editing.team_id) { toast.error('Vyberte tým', { duration: 8000 }); return; }
    try {
      await upsert.mutateAsync(editing);
      toast.success(editing.id ? 'Účet uložen' : 'Účet vytvořen');
      setEditing(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Chyba při ukládání: ' + msg, { duration: 8000 });
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await remove.mutateAsync(confirmDelete.id);
      toast.success('Účet smazán');
      setConfirmDelete(null);
    } catch {
      toast.error('Chyba při mazání účtu', { duration: 8000 });
    }
  }

  function limitColor(account: OutreachAccount) {
    const pct = account.daily_send_limit > 0 ? account.sends_today / account.daily_send_limit : 0;
    if (pct >= 1) return '#ef4444';
    if (pct >= 0.8) return '#fbbf24';
    return 'var(--text)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Odesílací účty"
        subtitle="Gmail / SMTP účty pro odesílání outreach e-mailů. Každý účet má vlastní denní limit."
        actions={
          <GlassButton size="sm" variant="primary" onClick={openCreate}>
            + Nový účet
          </GlassButton>
        }
      />
      <GlassCard padding={20}>
        {isLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(accounts ?? []).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', ...MONO }}>{a.email_address}</span>
                    <StatusBadge status={a.is_active ? 'active' : 'inactive'} />
                    {a.team && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {a.team.name}</span>}
                  </div>
                  {a.display_name && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{a.display_name}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, display: 'flex', gap: 12 }}>
                    <span>
                      {a.smtp_host}:{a.smtp_port} {a.smtp_secure ? '(SSL)' : ''}
                    </span>
                    <span style={{ color: limitColor(a), ...MONO }}>
                      {a.sends_today}/{a.daily_send_limit} dnes
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <GlassButton size="sm" onClick={() => openEdit(a)}>Upravit</GlassButton>
                  <GlassButton size="sm" variant="danger" onClick={() => setConfirmDelete(a)}>
                    <Trash2 size={13} />
                  </GlassButton>
                </div>
              </div>
            ))}
            {!accounts?.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Žádné odesílací účty</p>}
          </div>
        )}

        {/* Edit/Create modal */}
        <GlassModal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={editing?.id ? 'Upravit odesílací účet' : 'Nový odesílací účet'}
          width={520}
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
                label="E-mailová adresa *"
                placeholder="outreach@firma.cz"
                type="email"
                value={editing.email_address ?? ''}
                onChange={e => {
                  const email = e.target.value;
                  setEditing(p => ({
                    ...p!,
                    email_address: email,
                    // Auto-fill smtp_user if it was empty or matched the old email
                    smtp_user: (!p!.smtp_user || p!.smtp_user === p!.email_address) ? email : p!.smtp_user,
                  }));
                }}
                style={MONO}
              />
              <GlassInput
                label="Zobrazované jméno"
                placeholder="Jan Novák | Firma s.r.o."
                value={editing.display_name ?? ''}
                onChange={e => setEditing(p => ({ ...p!, display_name: e.target.value }))}
              />

              <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.03em' }}>SMTP nastavení</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <GlassInput
                      label="Server"
                      placeholder="smtp.gmail.com"
                      value={editing.smtp_host ?? ''}
                      onChange={e => setEditing(p => ({ ...p!, smtp_host: e.target.value }))}
                      style={MONO}
                    />
                  </div>
                  <div style={{ width: 80 }}>
                    <GlassInput
                      label="Port"
                      type="number"
                      value={String(editing.smtp_port ?? 465)}
                      onChange={e => setEditing(p => ({ ...p!, smtp_port: Number(e.target.value) || 465 }))}
                      style={MONO}
                    />
                  </div>
                </div>
                <GlassInput
                  label="Uživatel"
                  placeholder="outreach@firma.cz"
                  value={editing.smtp_user ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, smtp_user: e.target.value }))}
                  style={MONO}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <GlassInput
                    label={editing.id ? 'Heslo (ponechte prázdné = beze změny)' : 'Heslo *'}
                    placeholder={editing.id ? '••••••••' : 'App Password'}
                    type="password"
                    value={editing.smtp_password ?? ''}
                    onChange={e => setEditing(p => ({ ...p!, smtp_password: e.target.value }))}
                    style={MONO}
                  />
                  <p style={HINT}>Pro Gmail použijte App Password (Nastavení Google → Zabezpečení → Hesla aplikací).</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="smtp_secure"
                    checked={editing.smtp_secure !== false}
                    onChange={e => setEditing(p => ({ ...p!, smtp_secure: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--green)' }}
                  />
                  <label htmlFor="smtp_secure" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                    SSL/TLS (doporučeno pro port 465)
                  </label>
                </div>
              </div>

              <GlassInput
                label="Denní limit odesílání"
                type="number"
                value={String(editing.daily_send_limit ?? 100)}
                onChange={e => setEditing(p => ({ ...p!, daily_send_limit: Number(e.target.value) || 100 }))}
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
                  Aktivní (použitelný pro odesílání)
                </label>
              </div>
            </div>
          )}
        </GlassModal>

        {/* Delete confirm modal */}
        <GlassModal
          open={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title="Smazat odesílací účet"
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
            Opravdu smazat odesílací účet <strong style={MONO}>{confirmDelete?.email_address}</strong>?
            Vlny přiřazené k tomuto účtu přestanou odesílat.
          </p>
        </GlassModal>
      </GlassCard>
    </div>
  );
}
