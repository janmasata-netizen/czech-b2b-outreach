import { useState } from 'react';
import { useDashboardStats } from '@/hooks/useDashboard';
import PageHeader from '@/components/layout/PageHeader';
import StatsGrid from '@/components/shared/StatsGrid';
import StatCard from '@/components/shared/StatCard';
import SentEmailsAreaChart from '@/components/dashboard/SentEmailsAreaChart';
import WaveRepliesChart from '@/components/dashboard/WaveRepliesChart';
import TemplateRepliesChart from '@/components/dashboard/TemplateRepliesChart';
import ActiveWavesTable from '@/components/dashboard/ActiveWavesTable';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist';
import { formatPercent } from '@/lib/utils';

const STAT_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: 'Vše', days: 0 },
] as const;

export default function DashboardPage() {
  const [statsDays, setStatsDays] = useState(0);
  const { data: stats, isError } = useDashboardStats(statsDays);

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <PageHeader title="Přehled" subtitle="Realtime monitoring outreach kampaně" />
        <div style={{ padding: 24, color: 'var(--red)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span>Chyba při načítání statistik.</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 6,
              padding: '8px 20px',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageHeader title="Přehled" subtitle="Realtime monitoring outreach kampaně" />
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 4 }}>
          {STAT_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setStatsDays(r.days)}
              style={{
                padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: `1px solid ${statsDays === r.days ? 'var(--green)' : 'var(--border)'}`,
                background: 'transparent',
                color: statsDays === r.days ? 'var(--green)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <OnboardingChecklist />

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
