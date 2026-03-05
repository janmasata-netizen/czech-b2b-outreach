import { type ReactNode, type CSSProperties } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}

export default function DataTable<T>({ columns, data, rowKey, onRowClick, emptyState }: DataTableProps<T>) {
  if (data.length === 0) return <>{emptyState}</>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '9px 16px',
                textAlign: (col.align ?? 'left') as CSSProperties['textAlign'],
                fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                color: 'var(--text-muted)',
                background: 'var(--bg-subtle)',
                borderBottom: '1px solid var(--border)',
                width: col.width,
                whiteSpace: 'nowrap',
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'glass-table-row' : undefined}
              onClick={() => onRowClick?.(row)}
              style={{ cursor: onRowClick ? 'pointer' : undefined, borderBottom: '1px solid var(--border)' }}
            >
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '12px 16px',
                  textAlign: (col.align ?? 'left') as CSSProperties['textAlign'],
                  fontSize: 13, color: 'var(--text)',
                }}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
