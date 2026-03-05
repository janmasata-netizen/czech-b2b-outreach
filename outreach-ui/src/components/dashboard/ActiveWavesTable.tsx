import { useNavigate } from 'react-router-dom';
import { useActiveWaves } from '@/hooks/useDashboard';
import StatusBadge from '@/components/shared/StatusBadge';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import { formatDate, formatPercent } from '@/lib/utils';

const TH: React.CSSProperties = {
  padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
};

export default function ActiveWavesTable() {
  const { data: waves, isLoading } = useActiveWaves();
  const navigate = useNavigate();

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Aktivní vlny
        </h3>
      </div>
      {isLoading ? <TableSkeleton rows={3} /> : !waves?.length ? (
        <EmptyState icon="⌁" title="Žádné aktivní vlny" description="Naplánujte novou vlnu v sekci Vlny" />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Název', 'Datum', 'Leady', 'Odesláno', 'Odpovědí', 'Stav'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {waves.map(w => (
              <tr
                key={w.id}
                className="glass-table-row"
                onClick={() => navigate(`/vlny/${w.id}`)}
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              >
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{w.name}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{formatDate(w.send_date_seq1)}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)', fontWeight: 600 }}>{w.lead_count}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)', fontWeight: 600 }}>{w.sent_count}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)', fontWeight: 600 }}>
                  {w.reply_count} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({formatPercent(w.reply_rate)})</span>
                </td>
                <td style={{ padding: '12px 16px' }}><StatusBadge status={w.status} type="wave" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
