import { useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useWaveReplies } from '@/hooks/useDashboard';
import { formatPercent } from '@/lib/utils';
import { Skeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';

const COLOR = '#3ECF8E';

export default function WaveRepliesChart({ teamId }: { teamId?: string }) {
  const { data: waves = [], isLoading } = useWaveReplies(teamId);
  const rawId = useId().replace(/:/g, '_');

  const chartData = waves.map(w => ({
    name: w.name || '—',
    replyRate: w.reply_rate ?? 0,
    replies: w.reply_count ?? 0,
    sent: w.sent_count ?? 0,
  }));

  return (
    <div style={{ padding: '20px 20px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>
        Reply rate podle vlny
      </h3>

      {isLoading ? (
        <Skeleton height={200} />
      ) : !chartData.length ? (
        <EmptyState icon="📊" title="Žádná data" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad_wave_${rawId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={COLOR} stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={chartData.length > 5 ? -30 : 0}
                textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                height={chartData.length > 5 ? 60 : 30}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}
                cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '4 4' }}
                formatter={(value: number | undefined) => [formatPercent(value ?? 0), 'Reply rate']}
              />
              <Area
                type="monotone"
                dataKey="replyRate"
                name="Reply rate"
                stroke={COLOR}
                fill={`url(#grad_wave_${rawId})`}
              />
            </AreaChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {chartData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{d.replies} / {d.sent}</span>
                <span style={{ color: COLOR, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, width: 48, textAlign: 'right' }}>
                  {formatPercent(d.replyRate)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
