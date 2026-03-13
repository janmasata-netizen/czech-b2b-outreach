import { useState } from 'react';
import { useDashboardStats, useReadyLeadsCount, useActiveWavesCount, useRetargetReadyCount, useReplyCount } from '@/hooks/useDashboard';
import { useTeams } from '@/hooks/useLeads';
import { useAuthContext } from '@/components/AuthProvider';
import PageHeader from '@/components/layout/PageHeader';
import StatsGrid from '@/components/shared/StatsGrid';
import StatCard from '@/components/shared/StatCard';
import SentEmailsAreaChart from '@/components/dashboard/SentEmailsAreaChart';
import WaveRepliesChart from '@/components/dashboard/WaveRepliesChart';
import TemplateRepliesChart from '@/components/dashboard/TemplateRepliesChart';
import ActiveWavesTable from '@/components/dashboard/ActiveWavesTable';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist';
import { formatPercent } from '@/lib/utils';

const REPLY_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'Vše', days: 0 },
] as const;

export default function DashboardPage() {
  const { profile } = useAuthContext();
  const isAdmin = profile?.is_admin ?? false;

  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const effectiveTeamId = isAdmin ? selectedTeamId : (profile?.team_id ?? undefined);

  const [replyDays, setReplyDays] = useState(30);

  const { data: teams } = useTeams();
  const { data: stats, isError } = useDashboardStats(0, effectiveTeamId);
  const { data: readyLeads } = useReadyLeadsCount(effectiveTeamId);
  const { data: activeWavesCount } = useActiveWavesCount(effectiveTeamId);
  const { data: retargetReady } = useRetargetReadyCount(effectiveTeamId);
  const { data: replyCount } = useReplyCount(replyDays, effectiveTeamId);

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

  const teamSelector = isAdmin && teams?.length ? (
    <select
      value={selectedTeamId ?? ''}
      onChange={e => setSelectedTeamId(e.target.value || undefined)}
      style={{
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        color: 'var(--text)',
        cursor: 'pointer',
        minWidth: 160,
      }}
    >
      <option value="">Všechny týmy</option>
      {teams.map(team => (
        <option key={team.id} value={team.id}>{team.name}</option>
      ))}
    </select>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Přehled" subtitle="Realtime monitoring outreach kampaně" actions={teamSelector} />

      <OnboardingChecklist />

      <StatsGrid cols={4}>
        <StatCard label="Celkem leadů" value={stats?.totalLeads.toLocaleString('cs-CZ') ?? '—'} icon="◈" color="var(--accent)" />
        <StatCard label="Ověřeno e-mailů" value={stats?.verifiedLeads.toLocaleString('cs-CZ') ?? '—'} icon="✓" color="var(--green)" />
        <StatCard label="Odesláno" value={stats?.sentEmails.toLocaleString('cs-CZ') ?? '—'} icon="✉" color="var(--purple)" />
        <StatCard label="Míra odpovědí" value={stats ? formatPercent(stats.replyRate) : '—'} icon="↩" color="var(--cyan)" sub={`${stats?.repliedLeads ?? 0} odpovědí celkem`} />
      </StatsGrid>

      <StatsGrid cols={4}>
        <StatCard label="Připraveno k oslovení" value={(readyLeads ?? 0).toLocaleString('cs-CZ')} icon="📋" color="var(--green)" />
        <StatCard label="Aktivní vlny" value={(activeWavesCount ?? 0).toLocaleString('cs-CZ')} icon="⌁" color="var(--purple)" />
        <StatCard label="Retarget pool" value={(retargetReady ?? 0).toLocaleString('cs-CZ')} icon="🔄" color="var(--orange)" />
        <StatCard
          label="Odpovědi"
          value={(replyCount ?? 0).toLocaleString('cs-CZ')}
          icon="↩"
          color="var(--cyan)"
          sub={
            <span style={{ display: 'inline-flex', gap: 2 }}>
              {REPLY_RANGES.map(r => (
                <button
                  key={r.days}
                  onClick={e => { e.stopPropagation(); setReplyDays(r.days); }}
                  style={{
                    padding: '1px 6px',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: `1px solid ${replyDays === r.days ? 'var(--cyan)' : 'var(--border)'}`,
                    background: 'transparent',
                    color: replyDays === r.days ? 'var(--cyan)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </span>
          }
        />
      </StatsGrid>

      <SentEmailsAreaChart teamId={effectiveTeamId} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 16 }}>
        <WaveRepliesChart teamId={effectiveTeamId} />
        <TemplateRepliesChart teamId={effectiveTeamId} />
      </div>

      <ActiveWavesTable teamId={effectiveTeamId} />
    </div>
  );
}
