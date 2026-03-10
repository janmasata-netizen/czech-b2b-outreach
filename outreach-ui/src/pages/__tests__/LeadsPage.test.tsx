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
        eq: () => ({ data: [], error: null, count: 0 }),
        order: () => ({
          data: [],
          error: null,
          count: 0,
          range: () => ({ data: [], error: null, count: 0 }),
          limit: () => ({ data: [], error: null }),
        }),
        range: () => ({ data: [], error: null, count: 0 }),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

// Mock useLeads hook
vi.mock('@/hooks/useLeads', () => ({
  useLeads: () => ({
    data: { data: [], count: 0 },
    isLoading: false,
  }),
}));

// Mock child components to isolate page-level rendering
vi.mock('@/components/leads/LeadsFilters', () => ({
  default: () => <div data-testid="leads-filters">Filters</div>,
}));
vi.mock('@/components/leads/LeadsTable', () => ({
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="leads-table">{isLoading ? 'Loading...' : 'Table'}</div>
  ),
}));
vi.mock('@/components/leads/BulkActions', () => ({
  default: () => <div data-testid="bulk-actions" />,
}));
vi.mock('@/components/leads/AddLeadDialog', () => ({
  default: () => null,
}));
vi.mock('@/components/leads/CsvImportDialog', () => ({
  default: () => null,
}));
vi.mock('@/components/leads/GoogleSheetImportDialog', () => ({
  default: () => null,
}));
vi.mock('@/components/leads/ImportChooserDialog', () => ({
  default: () => null,
}));
vi.mock('@/components/leads/EmailDiscoveryTab', () => ({
  default: () => <div data-testid="email-discovery-tab" />,
}));
vi.mock('@/components/leads/ReadyLeadsTab', () => ({
  default: () => <div data-testid="ready-leads-tab" />,
}));
vi.mock('@/components/shared/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));
vi.mock('@/lib/constants', () => ({
  PAGE_SIZE: 25,
}));
vi.mock('@/lib/export', () => ({
  exportCsv: vi.fn(),
}));

import LeadsPage from '../LeadsPage';

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

describe('LeadsPage', () => {
  it('renders the page header with title "Leady"', () => {
    renderWithProviders(<LeadsPage />);
    expect(screen.getByText('Leady')).toBeInTheDocument();
  });

  it('renders the leads table', () => {
    renderWithProviders(<LeadsPage />);
    expect(screen.getByTestId('leads-table')).toBeInTheDocument();
  });

  it('renders the filters component', () => {
    renderWithProviders(<LeadsPage />);
    expect(screen.getByTestId('leads-filters')).toBeInTheDocument();
  });

  it('renders pagination', () => {
    renderWithProviders(<LeadsPage />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('shows total count in subtitle', () => {
    renderWithProviders(<LeadsPage />);
    expect(screen.getByText('0 celkem')).toBeInTheDocument();
  });
});
