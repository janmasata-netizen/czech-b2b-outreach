import { useDashboardStats } from '@/hooks/useDashboard';
import PageHeader from '@/components/layout/PageHeader';
import StatsGrid from '@/components/shared/StatsGrid';
import StatCard from '@/components/shared/StatCard';
import SentEmailsAreaChart from '@/components/dashboard/SentEmailsAreaChart';
import WaveRepliesChart from '@/components/dashboard/WaveRepliesChart';
import TemplateRepliesChart from '@/components/dashboard/TemplateRepliesChart';
import ActiveWavesTable from '@/components/dashboard/ActiveWavesTable';
import { formatPercent } from '@/lib/utils';

export default function DashboardPage() {
  const { data: stats, isLoading, isError } = useDashboardStats();

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <PageHeader title="Přehled" subtitle="Realtime monitoring outreach kampaně" />
        <div style={{ padding: 24, color: 'var(--red)', textAlign: 'center' }}>
          Chyba při načítání statistik. Zkuste obnovit stránku.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Přehled" subtitle="Realtime monitoring outreach kampaně" />

      <StatsGrid cols={4}>
        <StatCard label="Celkem leadů" value={stats?.totalLeads.toLocaleString('cs-CZ') ?? '—'} icon="◈" color="var(--accent)" />
        <StatCard label="Ověřeno e-mailů" value={stats?.verifiedLeads.toLocaleString('cs-CZ') ?? '—'} icon="✓" color="var(--green)" />
        <StatCard label="Odesláno" value={stats?.sentEmails.toLocaleString('cs-CZ') ?? '—'} icon="✉" color="var(--purple)" />
        <StatCard label="Míra odpovědí" value={stats ? formatPercent(stats.replyRate) : '—'} icon="↩" color="var(--cyan)" sub={`${stats?.repliedLeads ?? 0} odpovědí celkem`} />
      </StatsGrid>

      <StatsGrid cols={4}>
        <StatCard label="Obohaceno" value={stats?.enrichedLeads.toLocaleString('cs-CZ') ?? '—'} icon="⚡" color="var(--yellow)" />
        <StatCard label="Bounced" value={stats?.bouncedLeads.toLocaleString('cs-CZ') ?? '—'} icon="⚠" color="var(--red)" />
        <StatCard label="Ve frontě" value={stats?.pendingQueue.toLocaleString('cs-CZ') ?? '—'} icon="⏳" color="var(--orange)" />
        <StatCard label="Obohacení %" value={stats ? formatPercent(stats.totalLeads > 0 ? (stats.enrichedLeads / stats.totalLeads) * 100 : 0) : '—'} icon="%" color="var(--accent)" />
      </StatsGrid>

      <SentEmailsAreaChart />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 16 }}>
        <WaveRepliesChart />
        <TemplateRepliesChart />
      </div>

      <ActiveWavesTable />
    </div>
  );
}
