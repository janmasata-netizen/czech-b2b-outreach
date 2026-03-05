import { LogOut } from 'lucide-react';
import { useAuthContext } from '@/components/AuthProvider';

interface UserInfoProps {
  collapsed?: boolean;
}

export default function UserInfo({ collapsed }: UserInfoProps) {
  const { user, profile, signOut } = useAuthContext();

  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'Uživatel';
  const initials = displayName.slice(0, 2).toUpperCase();

  if (collapsed) {
    return (
      <button
        onClick={signOut}
        title={`${displayName} — odhlásit se`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: 5,
          background: 'var(--green-bg)',
          border: '1px solid var(--green-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'var(--green)',
        }}>
          {initials}
        </div>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {/* Avatar */}
      <div style={{
        width: 24, height: 24, borderRadius: 5,
        background: 'var(--green-bg)',
        border: '1px solid var(--green-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'var(--green)', flexShrink: 0,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.email}
        </div>
      </div>
      <button
        onClick={signOut}
        title="Odhlásit se"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', transition: 'color 0.15s', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
