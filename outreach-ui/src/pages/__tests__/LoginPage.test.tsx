import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock AuthProvider — LoginPage uses useAuthContext
vi.mock('@/components/AuthProvider', () => ({
  useAuthContext: () => ({
    user: null,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

import LoginPage from '../LoginPage';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('renders the email input field', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByPlaceholderText('vas@email.cz')).toBeInTheDocument();
  });

  it('renders the password input field', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('renders the submit button with correct text', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('button', { name: /přihlásit se/i })).toBeInTheDocument();
  });

  it('renders the email label', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText('E-mail')).toBeInTheDocument();
  });

  it('renders the password label', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText('Heslo')).toBeInTheDocument();
  });
});
