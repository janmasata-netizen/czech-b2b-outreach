import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

// Mock n8n helpers
vi.mock('@/lib/n8n', () => ({
  n8nWebhookUrl: (path: string) => `https://n8n.test.com/webhook/${path}`,
  n8nHeaders: () => ({ 'Content-Type': 'application/json' }),
}));

// Mock export helper
vi.mock('@/lib/export', () => ({
  exportCsv: vi.fn(),
}));

// Mock useMobile hook
vi.mock('@/hooks/useMobile', () => ({
  default: () => false,
}));

// Mock dedup helper
vi.mock('@/lib/dedup', () => ({
  cleanDomainInput: (v: string) => v,
}));

// Mock glass components to simplify rendering
vi.mock('@/components/glass/GlassCard', () => ({
  default: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="glass-card" {...props}>{children}</div>
  ),
}));
vi.mock('@/components/glass/GlassButton', () => ({
  default: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('@/components/glass/GlassInput', () => ({
  default: ({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      {label && <label>{label}</label>}
      <input {...props} />
    </div>
  ),
}));

import EmailFinderPage from '../EmailFinderPage';

function renderWithProviders(ui: React.ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmailFinderPage', () => {
  it('renders the page header "Email Finder"', () => {
    renderWithProviders(<EmailFinderPage />);
    expect(screen.getByText('Email Finder')).toBeInTheDocument();
  });

  it('renders the page description text', () => {
    renderWithProviders(<EmailFinderPage />);
    expect(
      screen.getByText(/Zadejte firmu, IČO, nebo doménu/),
    ).toBeInTheDocument();
  });

  it('renders find form input by default', () => {
    renderWithProviders(<EmailFinderPage />);
    expect(screen.getByText('Firma, IČO, nebo doména')).toBeInTheDocument();
  });

  it('renders the submit button with search text', () => {
    renderWithProviders(<EmailFinderPage />);
    expect(screen.getByRole('button', { name: /hledat/i })).toBeInTheDocument();
  });

  it('renders verify mode when tab=verify', () => {
    renderWithProviders(<EmailFinderPage />, { route: '/?tab=verify' });
    expect(screen.getByText('E-mailová adresa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ověřit/i })).toBeInTheDocument();
  });
});
