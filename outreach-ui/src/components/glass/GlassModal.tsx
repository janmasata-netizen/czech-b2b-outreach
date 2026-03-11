import { type ReactNode, useEffect } from 'react';
import useMobile from '@/hooks/useMobile';

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
  fullscreen?: boolean;
}

export default function GlassModal({ open, onClose, title, children, width = 560, footer, fullscreen }: GlassModalProps) {
  const isMobile = useMobile();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  /* Prevent body scroll when modal is open on mobile */
  useEffect(() => {
    if (!open || !isMobile) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);

  if (!open) return null;

  const mobilePanelStyle: React.CSSProperties = fullscreen
    ? { width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', borderRadius: 0 }
    : { width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', maxHeight: '85vh', borderRadius: '12px 12px 0 0' };

  const desktopPanelStyle: React.CSSProperties = fullscreen
    ? { width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', borderRadius: 0 }
    : { width: '100%', maxWidth: width, display: 'flex', flexDirection: 'column', maxHeight: '90vh' };

  return (
    <div
      className="glass-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: (isMobile || fullscreen) ? '0' : 24,
      }}
    >
      <div
        className="glass-modal-panel"
        onClick={e => e.stopPropagation()}
        style={isMobile ? mobilePanelStyle : desktopPanelStyle}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '14px 16px' : '18px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: isMobile ? 14 : 15, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 20, lineHeight: 1,
              padding: 4, borderRadius: 4, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              width: isMobile ? 32 : 24, height: isMobile ? 32 : 24,
              flexShrink: 0,
            }}
          >×</button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px' : '20px', display: 'flex', flexDirection: 'column', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div style={{ padding: isMobile ? '12px 16px' : '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
