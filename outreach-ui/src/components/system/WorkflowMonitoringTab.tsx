import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkflowStats } from '@/hooks/useWorkflowStats';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

type Range = '24h' | '7d' | '30d';

export default function WorkflowMonitoringTab() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>('24h');
  const { data, isLoading, isError } = useWorkflowStats(range);

  if (isLoading) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24 }}>{t('common.loading')}</div>;
  }

  if (isError || !data) {
    return (
      <GlassCard padding={20}>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t('workflows.noData')}</div>
      </GlassCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Time range selector */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['24h', '7d', '30d'] as Range[]).map(r => (
          <GlassButton
            key={r}
            variant={range === r ? 'primary' : 'secondary'}
            onClick={() => setRange(r)}
            style={{ fontSize: 12, padding: '5px 12px' }}
          >
            {t(`workflows.range${r.toUpperCase()}` as 'workflows.range24h')}
          </GlassButton>
        ))}
      </div>

      {/* Area chart */}
      <GlassCard padding={20}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          {t('workflows.chartTitle')}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.timeSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'var(--text-dim)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-dim)' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 12,
              }}
            />
            <Area type="monotone" dataKey="success" stackId="1" fill="rgba(74,222,128,0.3)" stroke="var(--green)" name={t('workflows.success')} />
            <Area type="monotone" dataKey="failure" stackId="1" fill="rgba(248,113,113,0.3)" stroke="#f87171" name={t('workflows.failure')} />
          </AreaChart>
        </ResponsiveContainer>
      </GlassCard>

      {/* Per-workflow table */}
      <GlassCard padding={20}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
          {t('workflows.workflowsTable')}
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['name', 'totalRuns', 'successRate', 'avgDuration', 'lastFailure'].map(col => (
                  <th key={col} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500 }}>
                    {t(`workflows.tableHeaders.${col}` as 'workflows.tableHeaders.name')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.workflows.map(wf => {
                const rateColor = wf.successRate >= 95 ? 'var(--green)' : wf.successRate >= 80 ? '#fbbf24' : '#f87171';
                return (
                  <tr key={wf.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text)', fontWeight: 500 }}>{wf.name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{wf.totalRuns}</td>
                    <td style={{ padding: '8px 10px', color: rateColor, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                      {wf.successRate.toFixed(1)}%
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {wf.avgDurationMs < 1000 ? `${wf.avgDurationMs}ms` : `${(wf.avgDurationMs / 1000).toFixed(1)}s`}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 11 }}>
                      {wf.lastFailure ? new Date(wf.lastFailure).toLocaleString('cs-CZ') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Recent failures */}
      <GlassCard padding={20}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
          {t('workflows.recentFailures')}
        </h3>
        {data.recentFailures.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t('workflows.noFailures')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.recentFailures.slice(0, 10).map((f, i) => (
              <div key={i} style={{
                padding: '8px 12px', borderRadius: 6,
                background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
                fontSize: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: 'var(--text)' }}>{f.workflowName}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {new Date(f.timestamp).toLocaleString('cs-CZ')}
                  </span>
                </div>
                <div style={{ color: '#f87171', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, wordBreak: 'break-all' }}>
                  {f.error.slice(0, 200)}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
