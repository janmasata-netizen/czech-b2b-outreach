import { useTranslation } from 'react-i18next';
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
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel ?? t('confirmDialog.cancel')}
          </GlassButton>
          <GlassButton variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? t('confirmDialog.processing') : (confirmLabel ?? t('confirmDialog.confirm'))}
          </GlassButton>
        </>
      }
    >
      {children}
    </GlassModal>
  );
}
