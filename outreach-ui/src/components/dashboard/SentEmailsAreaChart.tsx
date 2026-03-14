import { useState, useId, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useEmailVolumeChart } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';

const RANGES = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: 'Vše', days: 0 },
] as const;

const CHART_COLORS = ['#3ECF8E', '#a78bfa', '#22d3ee', '#fb923c', '#f472b6'];

export default function SentEmailsAreaChart({ teamId }: { teamId?: string }) {
  const [days, setDays] = useState(14);
  const { data, isLoading } = useEmailVolumeChart(days, teamId);

  const rawId = useId().replace(/:/g, '_');

  const seqKeys = useMemo(() => {
    if (!data?.length) return ['seq1', 'seq2', 'seq3'];
    const keys = new Set<string>();
    data.forEach((d: Record<string, unknown>) => Object.keys(d).filter(k => k.startsWith('seq')).forEach(k => keys.add(k)));
    return Array.from(keys).sort();
  }, [data]);

  return (
    <div style={{ padding: '20px 20px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
          Odeslané e-maily
        </h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${days === r.days ? 'var(--green)' : 'var(--border)'}`,
                background: 'transparent',
                color: days === r.days ? 'var(--green)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton height={320} />
      ) : !data?.length ? (
        <EmptyState icon="📊" title="Žádná data" />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              {seqKeys.map((key, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length];
                return (
                  <linearGradient key={key} id={`grad_${key}_${rawId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}
              cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '4 4' }}
            />
            {seqKeys.map((key, i) => {
              const color = CHART_COLORS[i % CHART_COLORS.length];
              const seqNum = key.replace('seq', '');
              return (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={`Sekvence ${seqNum}`}
                  stackId="1"
                  stroke={color}
                  fill={`url(#grad_${key}_${rawId})`}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
