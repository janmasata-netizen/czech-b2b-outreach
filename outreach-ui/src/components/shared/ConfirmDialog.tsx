import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Potvrdit', variant = 'danger', loading }: ConfirmDialogProps) {
  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose} disabled={loading}>Zrušit</GlassButton>
          <GlassButton variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? 'Probíhá…' : confirmLabel}
          </GlassButton>
        </>
      }
    >
      <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>{message}</p>
    </GlassModal>
  );
}
