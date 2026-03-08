import GlassConfirmDialog from '@/components/glass/ConfirmDialog';

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

export default function ConfirmDialog({ message, ...rest }: ConfirmDialogProps) {
  return (
    <GlassConfirmDialog {...rest}>
      <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>{message}</p>
    </GlassConfirmDialog>
  );
}
