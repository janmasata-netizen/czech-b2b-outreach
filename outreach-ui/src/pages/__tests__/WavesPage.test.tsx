import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// jsdom doesn't implement matchMedia — stub it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ data: [], error: null }),
        order: () => ({ data: [], error: null }),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

// Mock useWaves hook
vi.mock('@/hooks/useWaves', () => ({
  useWaves: () => ({
    data: [],
    isLoading: false,
  }),
}));

// Mock child components
vi.mock('@/components/waves/WavesTable', () => ({
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="waves-table">{isLoading ? 'Loading...' : 'Table'}</div>
  ),
}));
vi.mock('@/components/waves/CreateWaveDialog', () => ({
  default: () => null,
}));

import WavesPage from '../WavesPage';

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

describe('WavesPage', () => {
  it('renders the page header with default tab title "Manager"', () => {
    renderWithProviders(<WavesPage />);
    expect(screen.getByText('Manager')).toBeInTheDocument();
  });

  it('shows subtitle with wave count', () => {
    renderWithProviders(<WavesPage />);
    expect(screen.getByText('0 vln')).toBeInTheDocument();
  });

  it('shows empty state message when no waves exist', () => {
    renderWithProviders(<WavesPage />);
    expect(screen.getByText('Žádné koncepty')).toBeInTheDocument();
  });

  it('shows empty state description', () => {
    renderWithProviders(<WavesPage />);
    expect(
      screen.getByText('Vytvořte první vlnu pomocí tlačítka níže v postranním panelu.'),
    ).toBeInTheDocument();
  });

  it('renders without crashing on the live tab', () => {
    renderWithProviders(<WavesPage />, { route: '/?tab=live' });
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});
