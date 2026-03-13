import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WaveAnalytics } from '@/types/database';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatDate, formatPercent } from '@/lib/utils';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';

const TH: React.CSSProperties = {
  padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
};

interface WavesTableProps {
  waves: WaveAnalytics[];
  isLoading: boolean;
}

export default function WavesTable({ waves, isLoading }: WavesTableProps) {
  const navigate = useNavigate();

  if (isLoading) return <TableSkeleton rows={5} />;
  if (!waves.length) return <EmptyState icon="⌁" title="Žádné vlny" description="Vytvořte první vlnu pomocí tlačítka výše." />;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Název', 'Datum seq1', 'Leady', 'Odesláno', 'Odpovědi', 'Reply rate', 'Stav'].map(h => (
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
              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <td style={{ padding: '12px 16px' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{w.name}</div>
                {w.template_set_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{w.template_set_name}</div>}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>{formatDate(w.send_date_seq1)}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', fontWeight: 600 }}>{w.lead_count}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)', fontWeight: 600 }}>{w.sent_count}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)', fontWeight: 600 }}>{w.reply_count}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: Number(w.reply_rate) >= 5 ? 'var(--green)' : 'var(--text-dim)', fontWeight: 600 }}>{formatPercent(w.reply_rate)}</td>
              <td style={{ padding: '12px 16px' }}><StatusBadge status={w.status} type="wave" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
