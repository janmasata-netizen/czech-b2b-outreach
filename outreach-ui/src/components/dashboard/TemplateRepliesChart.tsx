import { useMemo, useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useWaves } from '@/hooks/useWaves';
import { formatPercent } from '@/lib/utils';
import { Skeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';

const COLOR = '#3ECF8E';

export default function TemplateRepliesChart({ teamId }: { teamId?: string }) {
  const { data: allWaves = [], isLoading } = useWaves();
  const waves = teamId ? allWaves.filter(w => w.team_id === teamId) : allWaves;
  const rawId = useId().replace(/:/g, '_');

  const chartData = useMemo(() => {
    const map = new Map<string, { sent: number; replies: number }>();

    for (const w of waves) {
      const key = w.template_set_name ?? '— bez šablony —';
      const cur = map.get(key) ?? { sent: 0, replies: 0 };
      map.set(key, {
        sent: cur.sent + (w.sent_count ?? 0),
        replies: cur.replies + (w.reply_count ?? 0),
      });
    }

    return Array.from(map.entries())
      .map(([name, stats]) => ({
        name,
        replyRate: stats.sent > 0 ? (stats.replies / stats.sent) * 100 : 0,
        replies: stats.replies,
        sent: stats.sent,
      }))
      .sort((a, b) => b.replyRate - a.replyRate);
  }, [waves]);

  // Prepend a zero-baseline point so a single data point has an area to fill from
  const displayData = chartData.length === 1
    ? [{ name: '—', replyRate: 0, replies: 0, sent: 0 }, ...chartData]
    : chartData;

  return (
    <div style={{ padding: '20px 20px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>
        Reply rate podle šablony
      </h3>

      {isLoading ? (
        <Skeleton height={200} />
      ) : !displayData.length ? (
        <EmptyState icon="📊" title="Žádná data" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={displayData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad_tpl_${rawId}`} x1="0" y1="0" x2="0" y2="1">
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
                angle={displayData.length > 5 ? -30 : 0}
                textAnchor={displayData.length > 5 ? 'end' : 'middle'}
                height={displayData.length > 5 ? 60 : 30}
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
                fill={`url(#grad_tpl_${rawId})`}
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
