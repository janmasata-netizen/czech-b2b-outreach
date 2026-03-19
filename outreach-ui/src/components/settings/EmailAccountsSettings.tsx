import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import StatusBadge from '@/components/shared/StatusBadge';
import { useEmailAccounts, useUpsertEmailAccount, useDeleteEmailAccount, useTeamsSettings } from '@/hooks/useSettings';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };
const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 3 };
const MONO: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' };
const SECTION_HEADER: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-dim)',
  letterSpacing: '0.03em',
};
const SECTION_BOX: React.CSSProperties = {
  padding: '12px 14px',
  background: 'var(--bg-surface)',
  borderRadius: 8,
  border: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

interface EmailAccount {
  id: string;
  team_id: string;
  name: string;
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password?: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  imap_password?: string;
  daily_send_limit: number;
  sends_today: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  team?: { name: string };
}

type FormData = Partial<EmailAccount> & { smtp_password?: string; imap_password?: string };

function limitColor(account: EmailAccount) {
  const pct = account.daily_send_limit > 0 ? account.sends_today / account.daily_send_limit : 0;
  if (pct >= 1) return '#ef4444';
  if (pct >= 0.8) return '#fbbf24';
  return 'var(--text)';
}

export default function EmailAccountsSettings() {
  const { data: accounts, isLoading } = useEmailAccounts();
  const { data: teams } = useTeamsSettings();
  const upsert = useUpsertEmailAccount();
  const remove = useDeleteEmailAccount();
  const [editing, setEditing] = useState<FormData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EmailAccount | null>(null);

  function openCreate() {
    setEditing({
      name: '',
      email_address: '',
      smtp_host: 'smtp.gmail.com',
      smtp_port: 465,
      smtp_secure: true,
      smtp_user: '',
      smtp_password: '',
      imap_host: 'imap.gmail.com',
      imap_port: 993,
      imap_secure: true,
      imap_user: '',
      imap_password: '',
      daily_send_limit: 100,
      is_active: true,
      team_id: teams?.[0]?.id ?? '',
    });
  }

  function openEdit(account: EmailAccount) {
    setEditing({ ...account, smtp_password: '', imap_password: '' }); // empty = keep existing
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error('Zadejte jméno účtu', { duration: 8000 }); return; }
    if (!editing.email_address?.trim()) { toast.error('Zadejte e-mailovou adresu', { duration: 8000 }); return; }
    if (!editing.smtp_host?.trim()) { toast.error('Zadejte SMTP server', { duration: 8000 }); return; }
    if (!editing.smtp_user?.trim()) { toast.error('Zadejte SMTP uživatele', { duration: 8000 }); return; }
    if (!editing.id && !editing.smtp_password?.trim()) { toast.error('Zadejte SMTP heslo', { duration: 8000 }); return; }
    if (!editing.imap_host?.trim()) { toast.error('Zadejte IMAP server', { duration: 8000 }); return; }
    if (!editing.imap_user?.trim()) { toast.error('Zadejte IMAP uživatele', { duration: 8000 }); return; }
    if (!editing.team_id) { toast.error('Vyberte tým', { duration: 8000 }); return; }
    try {
      const toSave = { ...editing };
      if (toSave.id && !toSave.smtp_password) delete toSave.smtp_password;
      if (toSave.id && !toSave.imap_password) delete toSave.imap_password;
      await upsert.mutateAsync(toSave);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="E-mailové účty"
        subtitle="Kombinované SMTP a IMAP účty pro odesílání outreach e-mailů a detekci odpovědí."
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
            {(accounts ?? []).map((a: EmailAccount) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{a.name}</span>
                    <StatusBadge status={a.is_active ? 'active' : 'inactive'} />
                    {a.team && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {a.team.name}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', ...MONO, marginTop: 2 }}>
                    {a.email_address}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>
                      SMTP: <span style={MONO}>{a.smtp_host}:{a.smtp_port}{a.smtp_secure ? ' (SSL)' : ''}</span>
                    </span>
                    {a.imap_host && (
                      <span>
                        IMAP: <span style={MONO}>{a.imap_host}:{a.imap_port}{a.imap_secure ? ' (SSL)' : ''}</span>
                      </span>
                    )}
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
            {!accounts?.length && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Žádné e-mailové účty</p>
            )}
          </div>
        )}

        {/* Edit / Create modal */}
        <GlassModal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={editing?.id ? 'Upravit e-mailový účet' : 'Nový e-mailový účet'}
          width={560}
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

              {/* Identity */}
              <div style={SECTION_BOX}>
                <div style={SECTION_HEADER}>Identita</div>
                <GlassInput
                  label="Jméno účtu *"
                  placeholder="Jan Novák"
                  value={editing.name ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))}
                />
                <GlassInput
                  label="E-mailová adresa *"
                  placeholder="jan.novak@firma.cz"
                  type="email"
                  value={editing.email_address ?? ''}
                  onChange={e => {
                    const email = e.target.value;
                    setEditing(p => ({
                      ...p!,
                      email_address: email,
                      smtp_user: (!p!.smtp_user || p!.smtp_user === p!.email_address) ? email : p!.smtp_user,
                      imap_user: (!p!.imap_user || p!.imap_user === p!.email_address) ? email : p!.imap_user,
                    }));
                  }}
                  style={MONO}
                />
              </div>

              {/* SMTP */}
              <div style={SECTION_BOX}>
                <div style={SECTION_HEADER}>SMTP (odesílání)</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <GlassInput
                      label="Server *"
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
                  label="Uživatel *"
                  placeholder="jan.novak@firma.cz"
                  value={editing.smtp_user ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, smtp_user: e.target.value }))}
                  style={MONO}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <GlassInput
                    label={editing.id ? 'Heslo (prázdné = beze změny)' : 'Heslo *'}
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

              {/* IMAP */}
              <div style={SECTION_BOX}>
                <div style={SECTION_HEADER}>IMAP (detekce odpovědí)</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <GlassInput
                      label="Server *"
                      placeholder="imap.gmail.com"
                      value={editing.imap_host ?? ''}
                      onChange={e => setEditing(p => ({ ...p!, imap_host: e.target.value }))}
                      style={MONO}
                    />
                  </div>
                  <div style={{ width: 80 }}>
                    <GlassInput
                      label="Port"
                      type="number"
                      value={String(editing.imap_port ?? 993)}
                      onChange={e => setEditing(p => ({ ...p!, imap_port: Number(e.target.value) || 993 }))}
                      style={MONO}
                    />
                  </div>
                </div>
                <GlassInput
                  label="Uživatel *"
                  placeholder="jan.novak@firma.cz"
                  value={editing.imap_user ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, imap_user: e.target.value }))}
                  style={MONO}
                />
                <GlassInput
                  label={editing.id ? 'Heslo (prázdné = beze změny)' : 'Heslo *'}
                  placeholder={editing.id ? '••••••••' : 'App Password'}
                  type="password"
                  value={editing.imap_password ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, imap_password: e.target.value }))}
                  style={MONO}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="imap_secure"
                    checked={editing.imap_secure !== false}
                    onChange={e => setEditing(p => ({ ...p!, imap_secure: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--green)' }}
                  />
                  <label htmlFor="imap_secure" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                    SSL/TLS (doporučeno pro port 993)
                  </label>
                </div>
              </div>

              {/* Limits */}
              <div style={SECTION_BOX}>
                <div style={SECTION_HEADER}>Limity</div>
                <GlassInput
                  label="Denní limit odesílání"
                  type="number"
                  value={String(editing.daily_send_limit ?? 100)}
                  onChange={e => setEditing(p => ({ ...p!, daily_send_limit: Number(e.target.value) || 100 }))}
                />
              </div>

              {/* Team (only when multiple teams exist) */}
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

              {/* Active */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editing.is_active !== false}
                  onChange={e => setEditing(p => ({ ...p!, is_active: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--green)' }}
                />
                <label htmlFor="is_active" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  Aktivní (odesílání + detekce odpovědí)
                </label>
              </div>
            </div>
          )}
        </GlassModal>

        {/* Delete confirmation modal */}
        <GlassModal
          open={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title="Smazat e-mailový účet"
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
            Opravdu smazat účet <strong style={MONO}>{confirmDelete?.email_address}</strong>?
            Vlny přiřazené k tomuto účtu přestanou odesílat a odpovědi se přestanou detekovat.
          </p>
        </GlassModal>
      </GlassCard>
    </div>
  );
}
