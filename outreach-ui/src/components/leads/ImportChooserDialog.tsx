import GlassModal from '@/components/glass/GlassModal';
import { FileSpreadsheet, Table } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (type: 'csv' | 'gsheet') => void;
}

const OPTIONS = [
  {
    type: 'csv' as const,
    Icon: FileSpreadsheet,
    label: 'CSV soubor',
    desc: 'Nahrajte CSV soubor z počítače',
  },
  {
    type: 'gsheet' as const,
    Icon: Table,
    label: 'Google Sheet',
    desc: 'Načtěte data z veřejného Google Sheetu',
  },
];

export default function ImportChooserDialog({ open, onClose, onChoose }: Props) {
  return (
    <GlassModal open={open} onClose={onClose} title="Importovat leady" width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {OPTIONS.map(({ type, Icon, label, desc }) => (
          <button
            key={type}
            onClick={() => { onClose(); onChoose(type); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-muted)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-surface)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            onFocus={e => {
              e.currentTarget.style.background = 'var(--bg-muted)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onBlur={e => {
              e.currentTarget.style.background = 'var(--bg-surface)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <Icon size={22} strokeWidth={1.6} style={{ flexShrink: 0, color: 'var(--green)' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </GlassModal>
  );
}
