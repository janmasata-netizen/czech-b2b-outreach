import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequireAuth, AuthProvider, useAuthContext } from './AuthProvider';

// Mock useAuth hook
const mockAuth = {
  user: null as { id: string; email: string } | null,
  profile: null,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  it('shows loading spinner when loading', () => {
    mockAuth.loading = true;
    mockAuth.user = null;
    renderWithRouter(<RequireAuth><div>Protected</div></RequireAuth>);
    expect(screen.getByText('Načítání…')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    mockAuth.loading = false;
  });

  it('redirects to login when not authenticated', () => {
    mockAuth.loading = false;
    mockAuth.user = null;
    renderWithRouter(<RequireAuth><div>Protected</div></RequireAuth>);
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    mockAuth.loading = false;
    mockAuth.user = { id: '1', email: 'test@test.cz' };
    renderWithRouter(<RequireAuth><div>Protected</div></RequireAuth>);
    expect(screen.getByText('Protected')).toBeInTheDocument();
    mockAuth.user = null;
  });
});

describe('useAuthContext', () => {
  it('throws when used outside AuthProvider', () => {
    function BadComponent() {
      useAuthContext();
      return null;
    }
    expect(() => render(<BadComponent />)).toThrow('useAuthContext must be used within AuthProvider');
  });
});
