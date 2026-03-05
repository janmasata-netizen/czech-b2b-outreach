import GlassModal from './GlassModal';
import GlassButton from './GlassButton';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Potvrdit',
  cancelLabel = 'Zrušit',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </GlassButton>
          <GlassButton variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? 'Zpracovávám…' : confirmLabel}
          </GlassButton>
        </>
      }
    >
      {children}
    </GlassModal>
  );
}
