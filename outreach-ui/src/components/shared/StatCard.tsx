import { type ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: ReactNode;
  icon?: ReactNode;
  color?: string;
  trend?: { value: number; label: string };
}

export default function StatCard({ label, value, sub, icon, color = 'var(--green)', trend }: StatCardProps) {
  return (
    <div className="stat-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>{label}</span>
        {icon && (
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
            {icon}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      </div>
      {trend && (
        <div style={{ fontSize: 12, color: trend.value >= 0 ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{trend.value >= 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(trend.value).toFixed(1)}% {trend.label}</span>
        </div>
      )}
    </div>
  );
}
