import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/layout/PageHeader';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import WorkflowMonitoringTab from '@/components/system/WorkflowMonitoringTab';
import BugReportsTab from '@/components/system/BugReportsTab';
import SystemLogsTab from '@/components/system/SystemLogsTab';

interface HealthMetrics {
  queuedEmails: number;
  sendingEmails: number;
  failedEmails24h: number;
  lastSentAt: string | null;
  teamSends: Array<{ name: string; sends_today: number; daily_send_limit: number }>;
}

function useSystemHealth() {
  return useQuery<HealthMetrics>({
    queryKey: ['system-health'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const [queueRes, failedRes, lastSentRes, teamsRes] = await Promise.all([
        supabase
          .from('email_queue')
          .select('status', { count: 'exact', head: true })
          .in('status', ['queued', 'sending']),
        supabase
          .from('email_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed')
          .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
        supabase
          .from('sent_emails')
          .select('sent_at')
          .order('sent_at', { ascending: false })
          .limit(1),
        supabase
          .from('teams')
          .select('name, sends_today, daily_send_limit'),
      ]);

      // Separate queued vs sending counts
      const [queuedRes, sendingRes] = await Promise.all([
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'sending'),
      ]);

      return {
        queuedEmails: queuedRes.count ?? 0,
        sendingEmails: sendingRes.count ?? 0,
        failedEmails24h: failedRes.count ?? 0,
        lastSentAt: lastSentRes.data?.[0]?.sent_at ?? null,
        teamSends: (teamsRes.data ?? []).map(t => ({
          name: t.name,
          sends_today: t.sends_today ?? 0,
          daily_send_limit: t.daily_send_limit ?? 0,
        })),
      };
    },
  });
}

function MetricCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <GlassCard padding={16}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </GlassCard>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return 'nikdy';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'právě teď';
  if (mins < 60) return `před ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `před ${hours} hod`;
  return `před ${Math.floor(hours / 24)} dny`;
}

function OverviewTab() {
  const { data, isLoading, refetch } = useSystemHealth();
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <PageHeader title="Stav systému" subtitle="Monitoring front a proxyserverů" />
        <GlassButton variant="secondary" onClick={() => refetch()} style={{ fontSize: 12 }}>
          Obnovit
        </GlassButton>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24 }}>Načítám...</div>
      ) : data ? (
        <>
          {/* Queue metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <MetricCard
              label="Ve frontě"
              value={data.queuedEmails}
              color={data.queuedEmails > 100 ? '#fbbf24' : 'var(--green)'}
              sub="e-mailů čeká na odeslání"
            />
            <MetricCard
              label="Odesílá se"
              value={data.sendingEmails}
              color="var(--cyan)"
              sub="právě se odesílá"
            />
            <MetricCard
              label="Selhané (24h)"
              value={data.failedEmails24h}
              color={data.failedEmails24h > 0 ? '#f87171' : 'var(--green)'}
              sub="za posledních 24 hodin"
            />
            <MetricCard
              label="Poslední odeslání"
              value={formatAgo(data.lastSentAt)}
              color={data.lastSentAt && (Date.now() - new Date(data.lastSentAt).getTime() < 600_000) ? 'var(--green)' : '#fbbf24'}
              sub={data.lastSentAt ? new Date(data.lastSentAt).toLocaleString('cs-CZ') : ''}
            />
          </div>

          {/* Team send limits */}
          <GlassCard padding={20}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
              Denní limity odesílání
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.teamSends.map(team => {
                const pct = team.daily_send_limit > 0 ? (team.sends_today / team.daily_send_limit) * 100 : 0;
                const barColor = pct > 90 ? '#f87171' : pct > 70 ? '#fbbf24' : 'var(--green)';
                return (
                  <div key={team.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{team.name}</span>
                      <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {team.sends_today} / {team.daily_send_limit}
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${Math.min(pct, 100)}%`,
                        background: barColor, borderRadius: 3,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* System status indicators */}
          <GlassCard padding={20}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
              Stav služeb
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                {
                  label: 'WF8 (Send Cron)',
                  ok: data.lastSentAt ? (Date.now() - new Date(data.lastSentAt).getTime() < 600_000) : false,
                  detail: `Poslední odeslání: ${formatAgo(data.lastSentAt)}`,
                },
                {
                  label: 'Fronta e-mailů',
                  ok: data.failedEmails24h < 10,
                  detail: `${data.failedEmails24h} selhání za 24h`,
                },
              ].map(svc => (
                <div key={svc.label} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 6,
                  background: svc.ok ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
                  border: `1px solid ${svc.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: svc.ok ? 'var(--green)' : '#f87171' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{svc.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{svc.detail}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </>
      ) : null}
    </div>
  );
}

export default function SystemHealthPage() {
  const [sp] = useSearchParams();
  const tab = sp.get('tab');

  switch (tab) {
    case 'monitoring': return <WorkflowMonitoringTab />;
    case 'reports':    return <BugReportsTab />;
    case 'logs':       return <SystemLogsTab />;
    default:           return <OverviewTab />;
  }
}
