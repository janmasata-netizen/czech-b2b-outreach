import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import { useUsers, useCreateUser, useDeleteUser, useUpdateUserPassword, useUpdateOwnPassword, useUpdateProfile, type AppUser } from '@/hooks/useUsers';
import { useTeamsSettings } from '@/hooks/useSettings';
import { useAuthContext } from '@/components/AuthProvider';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck, Trash2 } from 'lucide-react';

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };
const HINT: React.CSSProperties  = { fontSize: 11, color: 'var(--text-muted)', marginTop: 3 };

// ── Create user modal ────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose, teamOptions }: {
  open: boolean;
  onClose: () => void;
  teamOptions: { id: string; name: string }[];
}) {
  const createUser = useCreateUser();
  const [form, setForm] = useState({ email: '', password: '', full_name: '', team_id: '', is_admin: false });
  const [showPw, setShowPw] = useState(false);

  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.email.trim() || !form.password.trim() || !form.full_name.trim()) {
      toast.error('Vyplňte jméno, e-mail a heslo', { duration: 8000 }); return;
    }
    if (!form.team_id) { toast.error('Vyberte tým', { duration: 8000 }); return; }
    try {
      await createUser.mutateAsync({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        team_id: form.team_id,
        is_admin: form.is_admin,
      });
      toast.success('Uživatel vytvořen');
      setForm({ email: '', password: '', full_name: '', team_id: '', is_admin: false });
      onClose();
    } catch (err: unknown) {
      toast.error('Chyba: ' + (err instanceof Error ? err.message : String(err)), { duration: 8000 });
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title="Nový uživatel" width={460}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={handleSave} disabled={createUser.isPending}>
            {createUser.isPending ? 'Ukládám…' : 'Vytvořit'}
          </GlassButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassInput label="Celé jméno" placeholder="Jan Novák"
          value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
        <GlassInput label="E-mail" type="email" placeholder="jan@firma.cz"
          value={form.email} onChange={e => set('email', e.target.value)} required />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Heslo *</label>
          <div style={{ position: 'relative' }}>
            <input
              className="glass-input"
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="Minimálně 8 znaků"
              style={{ paddingRight: 36, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Tým *</label>
          <select className="glass-input" value={form.team_id} onChange={e => set('team_id', e.target.value)}>
            <option value="">— Vyberte tým —</option>
            {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={form.is_admin} onChange={e => set('is_admin', e.target.checked)}
            style={{ accentColor: 'var(--green)', width: 14, height: 14 }} />
          <span style={{ fontSize: 13, color: 'var(--text)' }}>Administrátor</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(může spravovat uživatele)</span>
        </label>
      </div>
    </GlassModal>
  );
}

// ── Change password modal ────────────────────────────────────────────────────
function ChangePasswordModal({ user, open, onClose }: {
  user: AppUser | null;
  open: boolean;
  onClose: () => void;
}) {
  const { user: me } = useAuthContext();
  const updateOther = useUpdateUserPassword();
  const updateSelf  = useUpdateOwnPassword();

  const isSelf = user?.id === me?.id;

  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  function handleClose() { setPassword(''); setShowPw(false); onClose(); }

  async function handleSave() {
    if (!password.trim()) { toast.error('Zadejte nové heslo', { duration: 8000 }); return; }
    if (!user) return;
    try {
      if (isSelf) {
        await updateSelf.mutateAsync({ userId: user.id, password });
      } else {
        await updateOther.mutateAsync({ userId: user.id, password });
      }
      toast.success('Heslo změněno');
      handleClose();
    } catch (err: unknown) {
      toast.error('Chyba: ' + (err instanceof Error ? err.message : String(err)), { duration: 8000 });
    }
  }

  const busy = updateOther.isPending || updateSelf.isPending;

  return (
    <GlassModal open={open} onClose={handleClose}
      title={isSelf ? 'Změnit vlastní heslo' : `Heslo — ${user?.profile.full_name ?? user?.email}`}
      width={420}
      footer={
        <>
          <GlassButton variant="secondary" onClick={handleClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={handleSave} disabled={busy}>
            {busy ? 'Ukládám…' : 'Uložit'}
          </GlassButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Nové heslo *</label>
          <div style={{ position: 'relative' }}>
            <input className="glass-input" type={showPw ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Minimálně 8 znaků"
              style={{ paddingRight: 36, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {!isSelf && <p style={HINT}>Heslo bude změněno pro tohoto uživatele.</p>}
        </div>
      </div>
    </GlassModal>
  );
}

// ── User detail modal ─────────────────────────────────────────────────────────
const ROW: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' };
const ROW_LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', minWidth: 110 };
const ROW_VALUE: React.CSSProperties = { fontSize: 13, color: 'var(--text)', textAlign: 'right' as const, flex: 1 };

function UserDetailModal({ user, open, onClose, isAdmin, isSelf, teamOptions }: {
  user: AppUser | null;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  isSelf: boolean;
  teamOptions: { id: string; name: string }[];
}) {
  const updateProfile = useUpdateProfile();
  const canEdit = isSelf || isAdmin;

  const [prevUserId, setPrevUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);

  if (user && user.id !== prevUserId) {
    setPrevUserId(user.id);
    setFullName(user.profile.full_name ?? '');
    setTeamId(user.profile.team_id);
    setAdmin(user.profile.is_admin);
  }

  async function handleSave() {
    if (!user) return;
    if (!fullName.trim()) { toast.error('Jméno nesmí být prázdné', { duration: 8000 }); return; }
    try {
      await updateProfile.mutateAsync({
        id: user.id,
        full_name: fullName.trim(),
        team_id: teamId,
        is_admin: admin,
      });
      toast.success('Profil uložen');
      onClose();
    } catch (err: unknown) {
      toast.error('Chyba: ' + (err instanceof Error ? err.message : String(err)), { duration: 8000 });
    }
  }

  if (!user) return null;

  const team = user.profile.team as { name: string; daily_send_limit?: number; sends_today?: number; is_active?: boolean } | undefined;

  return (
    <GlassModal open={open} onClose={onClose}
      title={user.profile.full_name ?? user.email}
      width={480}
      footer={
        canEdit ? (
          <>
            <GlassButton variant="secondary" onClick={onClose}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleSave} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Ukládám…' : 'Uložit'}
            </GlassButton>
          </>
        ) : (
          <GlassButton variant="secondary" onClick={onClose}>Zavřít</GlassButton>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Jméno */}
        <div style={ROW}>
          <span style={ROW_LABEL}>Jméno</span>
          <div style={{ flex: 1, textAlign: 'right' }}>
            {canEdit ? (
              <GlassInput value={fullName} onChange={e => setFullName(e.target.value)}
                style={{ textAlign: 'right', fontSize: 13, padding: '4px 8px' }} />
            ) : (
              <span style={ROW_VALUE}>{user.profile.full_name ?? '—'}</span>
            )}
          </div>
        </div>

        {/* E-mail */}
        <div style={ROW}>
          <span style={ROW_LABEL}>E-mail</span>
          <span style={ROW_VALUE}>{user.email}</span>
        </div>

        {/* Role */}
        <div style={ROW}>
          <span style={ROW_LABEL}>Role</span>
          <div style={{ flex: 1, textAlign: 'right' }}>
            {isAdmin ? (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={admin} onChange={e => setAdmin(e.target.checked)}
                  style={{ accentColor: 'var(--green)', width: 14, height: 14 }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>Administrátor</span>
              </label>
            ) : (
              <span style={ROW_VALUE}>{user.profile.is_admin ? 'Administrátor' : 'Uživatel'}</span>
            )}
          </div>
        </div>

        {/* Tým */}
        <div style={ROW}>
          <span style={ROW_LABEL}>Tým</span>
          <div style={{ flex: 1, textAlign: 'right' }}>
            {canEdit ? (
              <select className="glass-input" value={teamId ?? ''} onChange={e => setTeamId(e.target.value || null)}
                style={{ textAlign: 'right', fontSize: 13, padding: '4px 8px' }}>
                <option value="">— Žádný —</option>
                {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <span style={ROW_VALUE}>{team?.name ?? '—'}</span>
            )}
          </div>
        </div>

        {/* Denní limit */}
        <div style={ROW}>
          <span style={ROW_LABEL}>Denní limit</span>
          <span style={ROW_VALUE}>{team?.daily_send_limit ?? '—'}</span>
        </div>

        {/* Odesláno dnes */}
        <div style={ROW}>
          <span style={ROW_LABEL}>Odesláno dnes</span>
          <span style={ROW_VALUE}>{team?.sends_today ?? '—'}</span>
        </div>

        {/* Tým aktivní */}
        <div style={ROW}>
          <span style={ROW_LABEL}>Tým aktivní</span>
          <span style={ROW_VALUE}>{team ? (team.is_active ? '✓' : '—') : '—'}</span>
        </div>

        {/* Registrace */}
        <div style={ROW}>
          <span style={ROW_LABEL}>Registrace</span>
          <span style={ROW_VALUE}>{new Date(user.created_at).toLocaleDateString('cs-CZ')}</span>
        </div>

        {/* ID */}
        <div style={{ ...ROW, borderBottom: 'none' }}>
          <span style={ROW_LABEL}>ID</span>
          <span style={{ ...ROW_VALUE, fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{user.id}</span>
        </div>
      </div>
    </GlassModal>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UsersSettings() {
  const { user: me, profile: myProfile } = useAuthContext();
  const isAdmin = myProfile?.is_admin === true;

  const { data: users, isLoading, error } = useUsers();
  const { data: teams } = useTeamsSettings();
  const deleteUser = useDeleteUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [pwTarget, setPwTarget] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [detailTarget, setDetailTarget] = useState<AppUser | null>(null);

  const teamOptions = (teams ?? []).map(t => ({ id: t.id, name: t.name }));

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      toast.success('Uživatel smazán');
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error('Chyba: ' + (err instanceof Error ? err.message : String(err)), { duration: 8000 });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <PageHeader
      title="Uživatelé"
      actions={isAdmin ? <GlassButton size="sm" variant="primary" onClick={() => setCreateOpen(true)}>+ Nový uživatel</GlassButton> : undefined}
    />
    <GlassCard padding={20}>

      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám…</p>
      ) : error ? (
        <p style={{ color: 'var(--red, #ef4444)', fontSize: 13 }}>Chyba při načítání uživatelů: {error instanceof Error ? error.message : 'Neznámá chyba'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(users ?? []).map(u => {
            const isSelf = u.id === me?.id;
            const canDelete = isAdmin && !isSelf;
            const initials = (u.profile.full_name ?? u.email).split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase();

            return (
              <div key={u.id} onClick={() => setDetailTarget(u)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'var(--bg-subtle)',
                borderRadius: 8, border: '1px solid var(--border)',
                cursor: 'pointer',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: u.profile.is_admin ? 'var(--green)' : 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: u.profile.is_admin ? '#0a0a0a' : 'var(--text-dim)',
                  flexShrink: 0,
                }}>
                  {initials}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {u.profile.full_name ?? '—'}
                    </span>
                    {u.profile.is_admin && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: 'var(--green)', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 4, padding: '1px 6px' }}>
                        <ShieldCheck size={10} /> Admin
                      </span>
                    )}
                    {isSelf && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>vy</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {u.email}
                    {u.profile.team && <span style={{ marginLeft: 8, opacity: 0.6 }}>· {(u.profile.team as { name: string }).name}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {(isSelf || isAdmin) && (
                    <GlassButton size="sm" onClick={() => setPwTarget(u)}>
                      Změnit heslo
                    </GlassButton>
                  )}
                  {canDelete && (
                    <GlassButton size="sm" variant="danger" onClick={() => setDeleteTarget(u)}>
                      <Trash2 size={12} />
                    </GlassButton>
                  )}
                </div>
              </div>
            );
          })}
          {!users?.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Žádní uživatelé</p>}
        </div>
      )}

      {/* Change own password shortcut at bottom for non-admins */}
      {!isAdmin && me && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <GlassButton size="sm" onClick={() => {
            const self = (users ?? []).find(u => u.id === me.id);
            if (self) setPwTarget(self);
          }}>
            Změnit vlastní heslo
          </GlassButton>
        </div>
      )}

      {/* Modals */}
      <UserDetailModal
        user={detailTarget}
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        isAdmin={isAdmin}
        isSelf={detailTarget?.id === me?.id}
        teamOptions={teamOptions}
      />

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} teamOptions={teamOptions} />

      <ChangePasswordModal
        user={pwTarget}
        open={!!pwTarget}
        onClose={() => setPwTarget(null)}
      />

      <GlassModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title="Smazat uživatele" width={400}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setDeleteTarget(null)}>Zrušit</GlassButton>
            <GlassButton variant="danger" onClick={confirmDelete} disabled={deleteUser.isPending}>
              {deleteUser.isPending ? 'Mažu…' : 'Smazat'}
            </GlassButton>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Opravdu chcete smazat uživatele <strong style={{ color: 'var(--text)' }}>{deleteTarget?.profile.full_name ?? deleteTarget?.email}</strong>?
          Tato akce je nevratná.
        </p>
      </GlassModal>
    </GlassCard>
    </div>
  );
}
