import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useWaveReplies } from '@/hooks/useDashboard';
import { formatPercent } from '@/lib/utils';
import { Skeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';

const COLORS = ['#3ECF8E', '#a78bfa', '#22d3ee', '#fb923c', '#f87171', '#fbbf24', '#34d399', '#818cf8'];

export default function WaveRepliesChart() {
  const { data: waves = [], isLoading } = useWaveReplies();

  const chartData = waves.map(w => ({
    name: w.name || '—',
    replyRate: w.reply_rate ?? 0,
    replies: w.reply_count ?? 0,
    sent: w.sent_count ?? 0,
  }));

  const chartHeight = Math.max(200, chartData.length * 40 + 40);

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
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fill: 'var(--text-dim)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                formatter={(value: number | undefined) => [formatPercent(value ?? 0), 'Reply rate']}
              />
              <Bar dataKey="replyRate" name="replyRate" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {chartData.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{d.replies} / {d.sent}</span>
                <span style={{ color: COLORS[i % COLORS.length], fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, width: 48, textAlign: 'right' }}>
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
