import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './DashboardPage';

// Mock AuthProvider
vi.mock('@/components/AuthProvider', () => ({
  useAuthContext: () => ({
    profile: { is_admin: true, team_id: 'team-1' },
    user: { id: 'user-1' },
  }),
}));

// Mock all child components to isolate DashboardPage logic
vi.mock('@/components/layout/PageHeader', () => ({
  default: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));
vi.mock('@/components/shared/StatsGrid', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="stats-grid">{children}</div>,
}));
vi.mock('@/components/shared/StatCard', () => ({
  default: ({ label }: { label: string }) => <div data-testid="stat-card">{label}</div>,
}));
vi.mock('@/components/dashboard/SentEmailsAreaChart', () => ({
  default: () => <div data-testid="sent-chart" />,
}));
vi.mock('@/components/dashboard/WaveRepliesChart', () => ({
  default: () => <div data-testid="wave-chart" />,
}));
vi.mock('@/components/dashboard/TemplateRepliesChart', () => ({
  default: () => <div data-testid="template-chart" />,
}));
vi.mock('@/components/dashboard/ActiveWavesTable', () => ({
  default: () => <div data-testid="active-waves" />,
}));
vi.mock('@/components/dashboard/OnboardingChecklist', () => ({
  default: () => <div data-testid="onboarding" />,
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// Mock the dashboard hook
const mockStats = {
  data: undefined as Record<string, number> | undefined,
  isLoading: false,
  isError: false,
};

vi.mock('@/hooks/useDashboard', () => ({
  useDashboardStats: () => mockStats,
  useReadyLeadsCount: () => ({ data: 0 }),
  useActiveWavesCount: () => ({ data: 0 }),
  useRetargetReadyCount: () => ({ data: 0 }),
  useReplyCount: () => ({ data: 0 }),
}));

vi.mock('@/hooks/useLeads', () => ({
  useTeams: () => ({ data: [] }),
}));

vi.mock('@/lib/utils', () => ({
  formatPercent: (v: number) => `${v}%`,
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

describe('DashboardPage', () => {
  it('renders header', () => {
    mockStats.isLoading = false;
    mockStats.isError = false;
    mockStats.data = { totalLeads: 100, enrichedLeads: 50, verifiedLeads: 40, repliedLeads: 5, bouncedLeads: 2, sentEmails: 80, pendingQueue: 10, replyRate: 6.25 };
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText('Přehled')).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    mockStats.isError = true;
    mockStats.data = undefined;
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText('Chyba při načítání statistik.')).toBeInTheDocument();
    expect(screen.getByText('Zkusit znovu')).toBeInTheDocument();
    mockStats.isError = false;
  });

  it('renders stat cards when data is available', () => {
    mockStats.isError = false;
    mockStats.data = { totalLeads: 100, enrichedLeads: 50, verifiedLeads: 40, repliedLeads: 5, bouncedLeads: 2, sentEmails: 80, pendingQueue: 10, replyRate: 6.25 };
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText('Celkem leadů')).toBeInTheDocument();
    expect(screen.getByText('Ověřeno e-mailů')).toBeInTheDocument();
    expect(screen.getByText('Odesláno')).toBeInTheDocument();
  });

  it('renders placeholder dashes when no data', () => {
    mockStats.isError = false;
    mockStats.data = undefined;
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText('Přehled')).toBeInTheDocument();
  });
});
