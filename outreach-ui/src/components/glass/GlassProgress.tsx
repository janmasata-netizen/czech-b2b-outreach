interface GlassProgressProps {
  value: number; // 0-100
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export default function GlassProgress({ value, color = 'var(--green)', height = 4, showLabel = false }: GlassProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="glass-progress-track" style={{ flex: 1, height }}>
        <div className="glass-progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {showLabel && (
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)', minWidth: 34, textAlign: 'right' }}>
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
