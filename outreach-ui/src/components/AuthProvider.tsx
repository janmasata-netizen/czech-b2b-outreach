import { createContext, useContext, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type AuthState } from '@/hooks/useAuth';

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="app-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--border-strong)', borderTopColor: 'var(--green)', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Načítání…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
